"""FastAPI backend for MRI DICOM Analyzer."""

import base64
import io
import shutil
from pathlib import Path
from typing import Any

import aiofiles
import pydicom
from PIL import Image
from fastapi import FastAPI, File, HTTPException, UploadFile, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from dicom_utils import (
    parse_dicom,
    dicom_to_images,
    process_dicom_folder,
    generate_scan_id,
    normalize_pixel_array,
    group_by_series,
    is_localizer_or_scout,
    select_representative_slices,
)
from claude_client import analyze_mri, chat_continue, validate_token, get_model_info

app = FastAPI(title="MRI DICOM Analyzer API")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for scans (in production, use a database)
scans_storage: dict[str, dict[str, Any]] = {}

UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


class AnalyzeRequest(BaseModel):
    scan_id: str
    message: str
    slice_indices: list[int] | None = None  # Which slices to analyze (0-indexed)
    chat_history: list[dict[str, Any]] | None = None


class ChatRequest(BaseModel):
    scan_id: str
    message: str
    chat_history: list[dict[str, Any]]
    include_current_slice: bool = False
    current_slice_index: int | None = None


class LoadLocalRequest(BaseModel):
    path: str  # Local filesystem path to DICOM folder


class ScanFolderRequest(BaseModel):
    path: str


class LoadSeriesRequest(BaseModel):
    path: str
    series_uid: str | None = None  # If None, loads all non-localizer series


class LoadMultipleSeriesRequest(BaseModel):
    series_uids: list[str]


class AISeriesSelectRequest(BaseModel):
    user_description: str  # e.g., "spine and lower back", "brain", "knee"


class AnalyzeMode(BaseModel):
    mode: str = "current"  # "current" | "selected" | "overview" | "all"
    slice_indices: list[int] | None = None
    num_overview_slices: int = 10


# Storage for folder scans (series info)
folder_scans: dict[str, dict[str, Any]] = {}


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/api/model-info")
async def model_info():
    """Get information about the AI model being used."""
    return get_model_info()


@app.post("/api/validate-token")
async def validate_api_token(x_api_token: str = Header(..., alias="X-API-Token")):
    """Validate Claude API token."""
    if not x_api_token or len(x_api_token) < 10:
        return {
            "valid": False,
            "error": "Invalid token format"
        }

    valid, error = validate_token(x_api_token)
    if valid:
        return {"valid": True}
    else:
        return {"valid": False, "error": error or "Invalid API token"}


@app.post("/api/scan-folder")
async def scan_folder(request: ScanFolderRequest):
    """Scan a folder and return available series (without loading images)."""
    local_path = Path(request.path)

    if not local_path.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {request.path}")

    try:
        # Find all DICOM files
        all_files = []

        # Check for DICOMDIR
        dicomdir_file = local_path / "DICOMDIR"
        if dicomdir_file.exists() and dicomdir_file.is_file():
            ds = pydicom.dcmread(dicomdir_file)
            for record in ds.DirectoryRecordSequence:
                if hasattr(record, 'ReferencedFileID'):
                    file_path = local_path / Path(*record.ReferencedFileID)
                    if file_path.exists():
                        all_files.append(file_path)

        if not all_files:
            # Recursively find files
            for item in local_path.rglob("*"):
                if item.is_file() and not item.name.startswith('.'):
                    if item.suffix.lower() in ['.exe', '.cds', '.txt', '.zip', '.xml']:
                        continue
                    if item.name == 'DICOMDIR':
                        continue
                    all_files.append(item)

        # Filter valid DICOM files
        valid_files = []
        for f in all_files:
            try:
                pydicom.dcmread(f, stop_before_pixels=True)
                valid_files.append(f)
            except Exception:
                continue

        if not valid_files:
            raise ValueError("No valid DICOM files found")

        # Group by series
        series_map = group_by_series(valid_files)

        # Format response
        series_list = []
        for uid, info in series_map.items():
            series_list.append({
                "uid": uid,
                "series_number": info["series_number"],
                "description": info["description"],
                "modality": info["modality"],
                "num_slices": info["num_slices"],
                "is_localizer": info["is_localizer"],
            })

        # Sort by series number
        series_list.sort(key=lambda x: x["series_number"])

        # Store for later use
        folder_id = generate_scan_id()
        folder_scans[folder_id] = {
            "path": str(local_path),
            "series_map": series_map,
        }

        return {
            "folder_id": folder_id,
            "path": str(local_path),
            "total_files": len(valid_files),
            "series": series_list,
            "num_series": len(series_list),
            "num_localizers": sum(1 for s in series_list if s["is_localizer"]),
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error scanning folder: {str(e)}")


@app.post("/api/load-series/{folder_id}")
async def load_series(folder_id: str, series_uid: str | None = None):
    """Load a specific series from a scanned folder."""
    if folder_id not in folder_scans:
        raise HTTPException(status_code=404, detail="Folder scan not found. Please scan folder first.")

    folder_info = folder_scans[folder_id]
    series_map = folder_info["series_map"]

    # If no series specified, load all non-localizer series
    if series_uid:
        if series_uid not in series_map:
            raise HTTPException(status_code=404, detail="Series not found")
        series_to_load = {series_uid: series_map[series_uid]}
    else:
        series_to_load = {uid: info for uid, info in series_map.items() if not info["is_localizer"]}

    if not series_to_load:
        raise HTTPException(status_code=400, detail="No valid series to load")

    scan_id = generate_scan_id()
    all_images = []
    metadata = None

    for uid, series_info in series_to_load.items():
        for file_info in series_info["files"]:
            try:
                ds = pydicom.dcmread(file_info["path"])
                if not hasattr(ds, 'pixel_array'):
                    continue

                if metadata is None:
                    metadata = parse_dicom(file_info["path"])
                    metadata["series_description"] = series_info["description"]

                pixel_array = ds.pixel_array

                if len(pixel_array.shape) == 3:
                    for frame in pixel_array:
                        normalized = normalize_pixel_array(frame.copy(), ds)
                        img = Image.fromarray(normalized, mode='L')
                        buffer = io.BytesIO()
                        img.save(buffer, format='PNG')
                        all_images.append(base64.b64encode(buffer.getvalue()).decode('utf-8'))
                else:
                    normalized = normalize_pixel_array(pixel_array.copy(), ds)
                    img = Image.fromarray(normalized, mode='L')
                    buffer = io.BytesIO()
                    img.save(buffer, format='PNG')
                    all_images.append(base64.b64encode(buffer.getvalue()).decode('utf-8'))

            except Exception:
                continue

    if not all_images:
        raise HTTPException(status_code=400, detail="No images could be loaded")

    metadata["num_slices"] = len(all_images)

    scans_storage[scan_id] = {
        "metadata": metadata,
        "images": all_images,
        "path": folder_info["path"],
    }

    return {
        "scan_id": scan_id,
        "metadata": metadata,
        "num_slices": len(all_images),
    }


@app.post("/api/load-multiple-series/{folder_id}")
async def load_multiple_series(folder_id: str, request: LoadMultipleSeriesRequest):
    """Load multiple specific series from a scanned folder."""
    if folder_id not in folder_scans:
        raise HTTPException(status_code=404, detail="Folder scan not found. Please scan folder first.")

    folder_info = folder_scans[folder_id]
    series_map = folder_info["series_map"]

    # Validate all series UIDs exist
    for uid in request.series_uids:
        if uid not in series_map:
            raise HTTPException(status_code=404, detail=f"Series not found: {uid}")

    series_to_load = {uid: series_map[uid] for uid in request.series_uids}

    if not series_to_load:
        raise HTTPException(status_code=400, detail="No valid series to load")

    scan_id = generate_scan_id()
    all_images = []
    metadata = None

    for uid, series_info in series_to_load.items():
        for file_info in series_info["files"]:
            try:
                ds = pydicom.dcmread(file_info["path"])
                if not hasattr(ds, 'pixel_array'):
                    continue

                if metadata is None:
                    metadata = parse_dicom(file_info["path"])
                    metadata["series_description"] = series_info["description"]

                pixel_array = ds.pixel_array

                if len(pixel_array.shape) == 3:
                    for frame in pixel_array:
                        normalized = normalize_pixel_array(frame.copy(), ds)
                        img = Image.fromarray(normalized, mode='L')
                        buffer = io.BytesIO()
                        img.save(buffer, format='PNG')
                        all_images.append(base64.b64encode(buffer.getvalue()).decode('utf-8'))
                else:
                    normalized = normalize_pixel_array(pixel_array.copy(), ds)
                    img = Image.fromarray(normalized, mode='L')
                    buffer = io.BytesIO()
                    img.save(buffer, format='PNG')
                    all_images.append(base64.b64encode(buffer.getvalue()).decode('utf-8'))

            except Exception:
                continue

    if not all_images:
        raise HTTPException(status_code=400, detail="No images could be loaded")

    metadata["num_slices"] = len(all_images)

    scans_storage[scan_id] = {
        "metadata": metadata,
        "images": all_images,
        "path": folder_info["path"],
    }

    return {
        "scan_id": scan_id,
        "metadata": metadata,
        "num_slices": len(all_images),
    }


@app.post("/api/ai-select-series/{folder_id}")
async def ai_select_series(
    folder_id: str,
    request: AISeriesSelectRequest,
    x_api_token: str = Header(..., alias="X-API-Token"),
):
    """Use AI to select relevant series based on user description."""
    if folder_id not in folder_scans:
        raise HTTPException(status_code=404, detail="Folder scan not found.")

    folder_info = folder_scans[folder_id]
    series_map = folder_info["series_map"]

    # Prepare series info for AI
    series_list = []
    for uid, info in series_map.items():
        series_list.append({
            "uid": uid,
            "series_number": info["series_number"],
            "description": info["description"],
            "modality": info["modality"],
            "num_slices": info["num_slices"],
            "is_localizer": info["is_localizer"],
        })

    # Sort by series number
    series_list.sort(key=lambda x: x["series_number"])

    # Create prompt for AI
    series_text = "\n".join([
        f"- UID: {s['uid']}, #{s['series_number']}: {s['description']} ({s['modality']}, {s['num_slices']} slices, localizer: {s['is_localizer']})"
        for s in series_list
    ])

    prompt = f"""You are a medical imaging expert. The user wants to examine: "{request.user_description}"

Available MRI series:
{series_text}

Based on the user's description, select the most relevant series for their examination.
Consider:
- Body part mentioned (spine, brain, knee, etc.)
- Type of scan (T1, T2, FLAIR, DWI, etc.)
- Exclude localizer/scout images unless specifically requested
- If the description is vague, select the most likely relevant series

Return ONLY a JSON array of series UIDs that should be loaded. Example:
["1.2.840...", "1.2.840..."]

If no series match the description, return an empty array: []"""

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=x_api_token)

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )

        response_text = response.content[0].text.strip()

        # Extract JSON array from response
        import json
        import re

        # Try to find JSON array in response
        json_match = re.search(r'\[.*?\]', response_text, re.DOTALL)
        if json_match:
            selected_uids = json.loads(json_match.group())
        else:
            selected_uids = []

        # Validate UIDs exist
        valid_uids = [uid for uid in selected_uids if uid in series_map]

        # Get series info for selected UIDs
        selected_series = [
            next((s for s in series_list if s["uid"] == uid), None)
            for uid in valid_uids
        ]
        selected_series = [s for s in selected_series if s is not None]

        return {
            "selected_uids": valid_uids,
            "selected_series": selected_series,
            "total_slices": sum(s["num_slices"] for s in selected_series),
            "ai_reasoning": response_text,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI selection error: {str(e)}")


@app.post("/api/upload")
async def upload_dicom(
    files: list[UploadFile] = File(...),
):
    """Upload DICOM file(s) and process them."""
    scan_id = generate_scan_id()
    scan_dir = UPLOAD_DIR / scan_id
    scan_dir.mkdir(exist_ok=True)

    try:
        # Save uploaded files
        saved_files = []
        for file in files:
            file_path = scan_dir / file.filename
            async with aiofiles.open(file_path, "wb") as f:
                content = await file.read()
                await f.write(content)
            saved_files.append(file_path)

        # Process based on number of files
        if len(saved_files) == 1:
            file_path = saved_files[0]
            metadata = parse_dicom(file_path)
            images = dicom_to_images(file_path)
        else:
            # Multiple files - treat as series
            metadata, images = process_dicom_folder(scan_dir)

        # Store in memory
        scans_storage[scan_id] = {
            "metadata": metadata,
            "images": images,
            "path": str(scan_dir),
        }

        return {
            "scan_id": scan_id,
            "metadata": metadata,
            "num_slices": len(images),
        }

    except Exception as e:
        # Cleanup on error
        shutil.rmtree(scan_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Error processing DICOM: {str(e)}")


@app.post("/api/load-local")
async def load_local_dicom(request: LoadLocalRequest):
    """Load DICOM files from a local filesystem path."""
    local_path = Path(request.path)

    if not local_path.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {request.path}")

    scan_id = generate_scan_id()

    try:
        # Check if it's a directory or a single file
        if local_path.is_dir():
            # Look for DICOM files in subdirectories too
            all_files = []

            # Check for DICOMDIR index file
            dicomdir_file = local_path / "DICOMDIR"
            if dicomdir_file.exists():
                # Parse DICOMDIR to find actual image files
                ds = pydicom.dcmread(dicomdir_file)
                for record in ds.DirectoryRecordSequence:
                    if hasattr(record, 'ReferencedFileID'):
                        file_path = local_path / Path(*record.ReferencedFileID)
                        if file_path.exists():
                            all_files.append(file_path)

            if not all_files:
                # Recursively find all potential DICOM files
                for item in local_path.rglob("*"):
                    if item.is_file() and not item.name.startswith('.'):
                        # Skip known non-DICOM files
                        if item.suffix.lower() in ['.exe', '.cds', '.txt', '.zip']:
                            continue
                        all_files.append(item)

            # Filter to valid DICOM files
            valid_files = []
            for f in all_files:
                try:
                    pydicom.dcmread(f, stop_before_pixels=True)
                    valid_files.append(f)
                except Exception:
                    continue

            if not valid_files:
                raise ValueError("No valid DICOM files found in directory")

            # Sort by instance number
            def get_sort_key(fp):
                try:
                    ds = pydicom.dcmread(fp, stop_before_pixels=True)
                    series = int(getattr(ds, "SeriesNumber", 0))
                    instance = int(getattr(ds, "InstanceNumber", 0))
                    return (series, instance)
                except Exception:
                    return (0, 0)

            valid_files.sort(key=get_sort_key)

            # Get metadata from first file
            metadata = parse_dicom(valid_files[0])
            metadata["num_slices"] = len(valid_files)

            # Convert slices to images
            images = []
            for fp in valid_files:
                ds = pydicom.dcmread(fp)
                if not hasattr(ds, 'pixel_array'):
                    continue
                pixel_array = ds.pixel_array

                # Handle potential 3D arrays (multi-frame in single file)
                if len(pixel_array.shape) == 3:
                    for frame in pixel_array:
                        normalized = normalize_pixel_array(frame.copy(), ds)
                        img = Image.fromarray(normalized, mode='L')
                        buffer = io.BytesIO()
                        img.save(buffer, format='PNG')
                        images.append(base64.b64encode(buffer.getvalue()).decode('utf-8'))
                else:
                    normalized = normalize_pixel_array(pixel_array.copy(), ds)
                    img = Image.fromarray(normalized, mode='L')
                    buffer = io.BytesIO()
                    img.save(buffer, format='PNG')
                    images.append(base64.b64encode(buffer.getvalue()).decode('utf-8'))

            metadata["num_slices"] = len(images)

        else:
            # Single file
            metadata = parse_dicom(local_path)
            images = dicom_to_images(local_path)

        # Store in memory
        scans_storage[scan_id] = {
            "metadata": metadata,
            "images": images,
            "path": str(local_path),
        }

        return {
            "scan_id": scan_id,
            "metadata": metadata,
            "num_slices": len(images),
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing DICOM: {str(e)}")


@app.get("/api/scan/{scan_id}")
async def get_scan(scan_id: str):
    """Get scan metadata and images."""
    if scan_id not in scans_storage:
        raise HTTPException(status_code=404, detail="Scan not found")

    scan = scans_storage[scan_id]
    return {
        "scan_id": scan_id,
        "metadata": scan["metadata"],
        "images": scan["images"],
        "num_slices": len(scan["images"]),
    }


@app.get("/api/scan/{scan_id}/slice/{slice_index}")
async def get_slice(scan_id: str, slice_index: int):
    """Get a specific slice image."""
    if scan_id not in scans_storage:
        raise HTTPException(status_code=404, detail="Scan not found")

    scan = scans_storage[scan_id]
    if slice_index < 0 or slice_index >= len(scan["images"]):
        raise HTTPException(status_code=404, detail="Slice not found")

    return {
        "slice_index": slice_index,
        "image": scan["images"][slice_index],
        "total_slices": len(scan["images"]),
    }


@app.post("/api/analyze")
async def analyze_scan(
    request: AnalyzeRequest,
    x_api_token: str = Header(..., alias="X-API-Token"),
):
    """Analyze MRI scan with Claude.

    Modes:
    - If slice_indices provided: send only those slices
    - If no slice_indices: send evenly distributed overview (max 10 slices)
    """
    if request.scan_id not in scans_storage:
        raise HTTPException(status_code=404, detail="Scan not found")

    scan = scans_storage[request.scan_id]
    total_slices = len(scan["images"])

    # Select which images to send
    if request.slice_indices:
        # User selected specific slices
        valid_indices = [i for i in request.slice_indices if 0 <= i < total_slices]
        images = [scan["images"][i] for i in valid_indices]
        current_slice = valid_indices[0] + 1 if len(valid_indices) == 1 else None
        slice_info = f"Analyzing slices: {[i+1 for i in valid_indices]}"
    else:
        # Overview mode: select representative slices evenly distributed
        max_images = 10
        selected_indices = select_representative_slices(scan["images"], max_images)
        images = [scan["images"][i] for i in selected_indices]
        current_slice = None
        slice_info = f"Overview mode: analyzing {len(images)} evenly distributed slices from {total_slices} total"

    if not images:
        raise HTTPException(status_code=400, detail="No valid slices selected")

    # Add slice info to message
    enhanced_message = f"{slice_info}\n\nUser question: {request.message}"

    try:
        response = await analyze_mri(
            images=images,
            token=x_api_token,
            user_message=enhanced_message,
            chat_history=request.chat_history,
            current_slice=current_slice,
            total_slices=total_slices,
        )

        return {
            "response": response["text"],
            "annotations": response.get("annotations", []),
            "model": response.get("model", "Unknown"),
            "slices_analyzed": len(images),
            "total_slices": total_slices,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")


@app.post("/api/chat")
async def chat(
    request: ChatRequest,
    x_claude_token: str = Header(..., alias="X-API-Token"),
):
    """Continue chat conversation."""
    if request.scan_id not in scans_storage:
        raise HTTPException(status_code=404, detail="Scan not found")

    scan = scans_storage[request.scan_id]

    # Include current slice if requested
    images = None
    if request.include_current_slice and request.current_slice_index is not None:
        if 0 <= request.current_slice_index < len(scan["images"]):
            images = [scan["images"][request.current_slice_index]]

    try:
        response = await chat_continue(
            token=x_claude_token,
            user_message=request.message,
            chat_history=request.chat_history,
            images=images,
        )
        return {
            "response": response["text"],
            "annotations": response.get("annotations", []),
            "model": response.get("model", "Unknown"),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")


@app.delete("/api/scan/{scan_id}")
async def delete_scan(scan_id: str):
    """Delete a scan and its files."""
    if scan_id not in scans_storage:
        raise HTTPException(status_code=404, detail="Scan not found")

    scan = scans_storage[scan_id]

    # Remove files
    scan_dir = Path(scan["path"])
    if scan_dir.exists():
        shutil.rmtree(scan_dir)

    # Remove from storage
    del scans_storage[scan_id]

    return {"status": "deleted"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
