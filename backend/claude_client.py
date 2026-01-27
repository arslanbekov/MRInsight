"""Claude API client for MRI analysis."""

import anthropic
from typing import Any


SYSTEM_PROMPT = """You are an expert medical imaging analysis assistant specialized in MRI interpretation.
You help users understand their MRI scans by analyzing the provided images.

When analyzing MRI images, look for:
- Structural anomalies or asymmetries
- Unusual signal intensities (bright or dark areas that seem abnormal)
- Mass effects or space-occupying lesions
- Edema or fluid accumulation
- Atrophy or tissue loss
- Vascular abnormalities
- White matter changes
- Any other findings that could be clinically significant

For each observation:
1. Describe what you see objectively
2. Note the location (use anatomical terms when possible)
3. Describe the characteristics (size, shape, signal intensity)
4. Suggest what it might represent (differential diagnosis)

IMPORTANT - ANNOTATIONS FORMAT:
When you identify specific findings, provide their approximate location so they can be highlighted.
At the END of your response, include a JSON block with annotations in this exact format:

```annotations
[
  {"slice": 1, "x": 50, "y": 30, "label": "Area of interest", "severity": "info"},
  {"slice": 3, "x": 65, "y": 45, "label": "Possible anomaly", "severity": "warning"}
]
```

Coordinates are percentages (0-100) from top-left corner of the image.
Severity levels: "info" (blue), "warning" (yellow), "critical" (red)
Only include this block if you have specific findings to mark. Slice numbers are 1-indexed.

IMPORTANT DISCLAIMER: Your analysis is for educational and informational purposes only.
This is NOT a medical diagnosis. The user MUST consult a qualified radiologist or physician
for official interpretation and medical advice. AI analysis cannot replace professional medical evaluation.

Always be thorough but also honest about limitations. If image quality is poor or if you're
uncertain about something, clearly state that. Err on the side of caution - if something
looks potentially concerning, recommend professional evaluation."""


MODEL_NAME = "claude-sonnet-4-20250514"
MODEL_DISPLAY_NAME = "Claude Sonnet 4"


import re
import json


def parse_annotations(response_text: str) -> tuple[str, list[dict]]:
    """Extract annotations from response and return clean text + annotations."""
    annotations = []
    clean_text = response_text

    # Find annotations block
    pattern = r'```annotations\s*\n([\s\S]*?)\n```'
    match = re.search(pattern, response_text)

    if match:
        try:
            annotations_json = match.group(1).strip()
            annotations = json.loads(annotations_json)
            # Remove annotations block from text
            clean_text = re.sub(pattern, '', response_text).strip()
        except json.JSONDecodeError:
            pass

    return clean_text, annotations


def get_model_info() -> dict:
    """Return model information."""
    return {
        "model_id": MODEL_NAME,
        "display_name": MODEL_DISPLAY_NAME,
        "provider": "Anthropic",
    }


def validate_token(token: str) -> tuple[bool, str | None]:
    """Validate Claude API token."""
    if not token.startswith(("sk-ant-api", "sk-ant-oat")):
        return False, "Invalid token format. Should start with 'sk-ant-api' or 'sk-ant-oat'"

    try:
        client = anthropic.Anthropic(api_key=token)
        client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=10,
            messages=[{"role": "user", "content": "hi"}]
        )
        return True, None
    except anthropic.AuthenticationError:
        return False, "Invalid API token"
    except Exception as e:
        return False, str(e)


async def analyze_mri(
    images: list[str],
    token: str,
    user_message: str,
    chat_history: list[dict[str, Any]] | None = None,
    current_slice: int | None = None,
    total_slices: int | None = None,
) -> str:
    """
    Analyze MRI images using Claude.

    Args:
        images: List of base64-encoded PNG images
        token: Claude API token
        user_message: User's question or request
        chat_history: Previous messages in the conversation
        current_slice: Current slice number being viewed (1-indexed)
        total_slices: Total number of slices

    Returns:
        Claude's analysis response
    """
    client = anthropic.Anthropic(api_key=token)

    # Build message content with images
    content = []

    # Add context about slice position if provided
    if current_slice is not None and total_slices is not None:
        slice_info = f"[Viewing slice {current_slice} of {total_slices}]\n\n"
        content.append({"type": "text", "text": slice_info})

    # Add images
    for i, img_b64 in enumerate(images):
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": img_b64,
            },
        })
        if len(images) > 1:
            content.append({"type": "text", "text": f"(Slice {i + 1})"})

    # Add user message
    content.append({"type": "text", "text": user_message})

    # Build messages array
    messages = []

    # Add chat history if exists
    if chat_history:
        for msg in chat_history:
            messages.append({
                "role": msg["role"],
                "content": msg["content"]
            })

    # Add current message
    messages.append({
        "role": "user",
        "content": content
    })

    # Call Claude API
    response = client.messages.create(
        model=MODEL_NAME,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=messages,
    )

    raw_text = response.content[0].text
    clean_text, annotations = parse_annotations(raw_text)

    return {
        "text": clean_text,
        "annotations": annotations,
        "model": MODEL_DISPLAY_NAME,
    }


async def chat_continue(
    token: str,
    user_message: str,
    chat_history: list[dict[str, Any]],
    images: list[str] | None = None,
) -> str:
    """
    Continue a chat conversation, optionally with new images.

    Args:
        token: Claude API token
        user_message: User's new message
        chat_history: Previous messages
        images: Optional new images to include

    Returns:
        Claude's response
    """
    client = anthropic.Anthropic(api_key=token)

    # Build current message content
    content = []

    # Add images if provided
    if images:
        for img_b64 in images:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": img_b64,
                },
            })

    content.append({"type": "text", "text": user_message})

    # Build messages array from history
    messages = []
    for msg in chat_history:
        messages.append({
            "role": msg["role"],
            "content": msg["content"]
        })

    messages.append({
        "role": "user",
        "content": content
    })

    response = client.messages.create(
        model=MODEL_NAME,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=messages,
    )

    raw_text = response.content[0].text
    clean_text, annotations = parse_annotations(raw_text)

    return {
        "text": clean_text,
        "annotations": annotations,
        "model": MODEL_DISPLAY_NAME,
    }
