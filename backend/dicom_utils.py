"""DICOM file utilities for parsing and image conversion."""

import base64
import io
import uuid
from pathlib import Path
from typing import Any

import numpy as np
import pydicom
from PIL import Image
from pydicom.pixel_data_handlers.util import apply_voi_lut


def normalize_pixel_array(pixel_array: np.ndarray, ds: pydicom.Dataset) -> np.ndarray:
    """Normalize pixel array to 0-255 range with proper windowing."""
    # Apply VOI LUT (Value of Interest Look-Up Table) for proper windowing
    try:
        pixel_array = apply_voi_lut(pixel_array, ds)
    except Exception:
        pass

    # Handle MONOCHROME1 (inverted) photometric interpretation
    if hasattr(ds, 'PhotometricInterpretation'):
        if ds.PhotometricInterpretation == "MONOCHROME1":
            pixel_array = np.max(pixel_array) - pixel_array

    # Normalize to 0-255
    pixel_min = pixel_array.min()
    pixel_max = pixel_array.max()

    if pixel_max != pixel_min:
        pixel_array = ((pixel_array - pixel_min) / (pixel_max - pixel_min) * 255).astype(np.uint8)
    else:
        pixel_array = np.zeros_like(pixel_array, dtype=np.uint8)

    return pixel_array


def parse_dicom(file_path: Path) -> dict[str, Any]:
    """Parse DICOM file and extract metadata."""
    ds = pydicom.dcmread(file_path)

    metadata = {
        "patient_name": str(getattr(ds, "PatientName", "Unknown")),
        "patient_id": str(getattr(ds, "PatientID", "Unknown")),
        "study_date": str(getattr(ds, "StudyDate", "Unknown")),
        "modality": str(getattr(ds, "Modality", "Unknown")),
        "body_part": str(getattr(ds, "BodyPartExamined", "Unknown")),
        "study_description": str(getattr(ds, "StudyDescription", "")),
        "series_description": str(getattr(ds, "SeriesDescription", "")),
        "rows": int(getattr(ds, "Rows", 0)),
        "columns": int(getattr(ds, "Columns", 0)),
        "slice_thickness": float(getattr(ds, "SliceThickness", 0)),
        "pixel_spacing": list(getattr(ds, "PixelSpacing", [0, 0])),
    }

    # Check if multi-frame
    if hasattr(ds, "NumberOfFrames"):
        metadata["num_slices"] = int(ds.NumberOfFrames)
    else:
        metadata["num_slices"] = 1

    return metadata


def dicom_to_images(file_path: Path) -> list[str]:
    """Convert DICOM slices to base64 PNG images."""
    ds = pydicom.dcmread(file_path)
    pixel_array = ds.pixel_array

    images = []

    # Handle multi-frame DICOM
    if len(pixel_array.shape) == 3:
        num_frames = pixel_array.shape[0]
        for i in range(num_frames):
            frame = pixel_array[i]
            normalized = normalize_pixel_array(frame.copy(), ds)
            img = Image.fromarray(normalized, mode='L')

            # Convert to base64
            buffer = io.BytesIO()
            img.save(buffer, format='PNG')
            b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
            images.append(b64)
    else:
        # Single frame
        normalized = normalize_pixel_array(pixel_array.copy(), ds)
        img = Image.fromarray(normalized, mode='L')

        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        images.append(b64)

    return images


def process_dicom_folder(folder_path: Path) -> tuple[dict[str, Any], list[str]]:
    """Process a folder of DICOM files (one slice per file)."""
    dicom_files = sorted(folder_path.glob("*.dcm")) + sorted(folder_path.glob("*"))
    dicom_files = [f for f in dicom_files if f.is_file()]

    # Filter to only valid DICOM files
    valid_files = []
    for f in dicom_files:
        try:
            pydicom.dcmread(f, stop_before_pixels=True)
            valid_files.append(f)
        except Exception:
            continue

    if not valid_files:
        raise ValueError("No valid DICOM files found")

    # Sort by instance number if available
    def get_instance_number(fp):
        try:
            ds = pydicom.dcmread(fp, stop_before_pixels=True)
            return int(getattr(ds, "InstanceNumber", 0))
        except Exception:
            return 0

    valid_files.sort(key=get_instance_number)

    # Get metadata from first file
    metadata = parse_dicom(valid_files[0])
    metadata["num_slices"] = len(valid_files)

    # Convert all slices to images
    images = []
    for fp in valid_files:
        ds = pydicom.dcmread(fp)
        pixel_array = ds.pixel_array
        normalized = normalize_pixel_array(pixel_array.copy(), ds)
        img = Image.fromarray(normalized, mode='L')

        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        images.append(b64)

    return metadata, images


def generate_scan_id() -> str:
    """Generate unique scan ID."""
    return str(uuid.uuid4())[:8]


def is_localizer_or_scout(ds: pydicom.Dataset) -> bool:
    """Check if DICOM is a localizer/scout image (calibration, not actual scan)."""
    # Check ImageType
    if hasattr(ds, 'ImageType'):
        image_type = [t.upper() for t in ds.ImageType]
        if any(t in image_type for t in ['LOCALIZER', 'SCOUT', 'SURVEY', 'PILOT']):
            return True

    # Check SeriesDescription
    if hasattr(ds, 'SeriesDescription'):
        desc = ds.SeriesDescription.upper()
        if any(t in desc for t in ['LOCALIZER', 'SCOUT', 'SURVEY', 'PILOT', 'LOC', 'PLANNING']):
            return True

    # Check for very small image dimensions (often localizers)
    if hasattr(ds, 'Rows') and hasattr(ds, 'Columns'):
        if ds.Rows < 64 or ds.Columns < 64:
            return True

    return False


def calculate_image_info_score(pixel_array: np.ndarray) -> float:
    """Calculate information score for an image (higher = more detail)."""
    # Use standard deviation as a simple measure of information content
    # Empty or uniform images will have low std
    return float(np.std(pixel_array))


def group_by_series(dicom_files: list[Path]) -> dict[str, dict]:
    """Group DICOM files by series and extract metadata."""
    series_map = {}

    for fp in dicom_files:
        try:
            ds = pydicom.dcmread(fp, stop_before_pixels=True)

            series_uid = str(getattr(ds, 'SeriesInstanceUID', 'unknown'))
            series_num = int(getattr(ds, 'SeriesNumber', 0))
            series_desc = str(getattr(ds, 'SeriesDescription', 'Unknown Series'))
            instance_num = int(getattr(ds, 'InstanceNumber', 0))

            is_localizer = is_localizer_or_scout(ds)

            if series_uid not in series_map:
                series_map[series_uid] = {
                    'series_number': series_num,
                    'description': series_desc,
                    'is_localizer': is_localizer,
                    'files': [],
                    'modality': str(getattr(ds, 'Modality', 'Unknown')),
                }

            series_map[series_uid]['files'].append({
                'path': fp,
                'instance_number': instance_num,
            })

        except Exception:
            continue

    # Sort files within each series by instance number
    for series in series_map.values():
        series['files'].sort(key=lambda x: x['instance_number'])
        series['num_slices'] = len(series['files'])

    return series_map


def select_representative_slices(images: list[str], num_slices: int = 10) -> list[int]:
    """Select evenly distributed representative slices."""
    total = len(images)
    if total <= num_slices:
        return list(range(total))

    # Evenly distribute slices
    step = total / num_slices
    indices = [int(i * step) for i in range(num_slices)]

    # Make sure we don't exceed bounds
    indices = [min(i, total - 1) for i in indices]

    return indices
