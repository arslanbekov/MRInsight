"""Google Gemini API client for MRI analysis."""

import base64
import google.generativeai as genai
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

IMPORTANT DISCLAIMER: Your analysis is for educational and informational purposes only.
This is NOT a medical diagnosis. The user MUST consult a qualified radiologist or physician
for official interpretation and medical advice. AI analysis cannot replace professional medical evaluation.

Always be thorough but also honest about limitations. If image quality is poor or if you're
uncertain about something, clearly state that. Err on the side of caution - if something
looks potentially concerning, recommend professional evaluation."""


def create_image_part(image_b64: str) -> dict:
    """Create an image part for Gemini API."""
    return {
        "mime_type": "image/png",
        "data": image_b64
    }


async def analyze_mri(
    images: list[str],
    token: str,
    user_message: str,
    chat_history: list[dict[str, Any]] | None = None,
    current_slice: int | None = None,
    total_slices: int | None = None,
) -> str:
    """
    Analyze MRI images using Gemini Pro.

    Args:
        images: List of base64-encoded PNG images
        token: Gemini API token
        user_message: User's question or request
        chat_history: Previous messages in the conversation
        current_slice: Current slice number being viewed (1-indexed)
        total_slices: Total number of slices

    Returns:
        Gemini's analysis response
    """
    genai.configure(api_key=token)

    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",
        system_instruction=SYSTEM_PROMPT
    )

    # Build content parts
    content_parts = []

    # Add context about slice position if provided
    if current_slice is not None and total_slices is not None:
        content_parts.append(f"[Viewing slice {current_slice} of {total_slices}]\n")

    # Add images
    for i, img_b64 in enumerate(images):
        content_parts.append(create_image_part(img_b64))
        if len(images) > 1:
            content_parts.append(f"(Slice {i + 1})")

    # Add user message
    content_parts.append(user_message)

    # Build chat history for context
    history = []
    if chat_history:
        for msg in chat_history:
            role = "user" if msg["role"] == "user" else "model"
            history.append({
                "role": role,
                "parts": [msg["content"]]
            })

    # Create chat session with history
    chat = model.start_chat(history=history)

    # Send message with images
    response = chat.send_message(content_parts)

    return response.text


async def chat_continue(
    token: str,
    user_message: str,
    chat_history: list[dict[str, Any]],
    images: list[str] | None = None,
) -> str:
    """
    Continue a chat conversation, optionally with new images.

    Args:
        token: Gemini API token
        user_message: User's new message
        chat_history: Previous messages
        images: Optional new images to include

    Returns:
        Gemini's response
    """
    genai.configure(api_key=token)

    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",
        system_instruction=SYSTEM_PROMPT
    )

    # Build content parts
    content_parts = []

    # Add images if provided
    if images:
        for img_b64 in images:
            content_parts.append(create_image_part(img_b64))

    content_parts.append(user_message)

    # Build chat history
    history = []
    for msg in chat_history:
        role = "user" if msg["role"] == "user" else "model"
        history.append({
            "role": role,
            "parts": [msg["content"]]
        })

    # Create chat session with history
    chat = model.start_chat(history=history)

    # Send message
    response = chat.send_message(content_parts)

    return response.text


def validate_token(token: str) -> tuple[bool, str | None]:
    """Validate Gemini API token."""
    try:
        genai.configure(api_key=token)
        model = genai.GenerativeModel("gemini-1.5-flash")
        # Simple test
        response = model.generate_content("Say 'ok'")
        return True, None
    except Exception as e:
        return False, str(e)
