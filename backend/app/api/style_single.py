"""
Style single API (Studio).

Generate a new image based on:
- product image (required)
- optional style reference image
- style preset + options + requirements
"""

from __future__ import annotations

import json
import os
import shutil
import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from ..config import config
from ..core.replacer import generate_styled_image, generate_text_image
from ..core.style_batch import _build_generation_prompt, _detect_language, _to_output_url, _translate_text

router = APIRouter(prefix="/api/style", tags=["Style Studio"])


@router.post("/single")
async def style_single(
    product_image: UploadFile = File(..., description="产品图（必填）"),
    style_reference_image: Optional[UploadFile] = File(None, description="风格参考图（可选）"),
    style_preset: str = Form("generic", description="shein/amazon/tiktok/generic"),
    options_json: str = Form("{}", description="JSON string: style options"),
    requirements: str = Form("", description="额外要求/重点"),
    target_language: str = Form("same", description="same|zh|th|en"),
    aspect_ratio: str = Form("1:1", description="1:1/16:9/9:16/3:4/4:3"),
    copy_text: str = Form("", description="需要出现在图片中的文字（可选）"),
):
    """
    Studio 单次风格生图（Lovart-style building block）。
    """
    temp_dir = os.path.join(os.path.abspath(config.INPUT_DIR), f"temp_style_{uuid.uuid4().hex[:8]}")
    os.makedirs(temp_dir, exist_ok=True)

    product_path = os.path.join(temp_dir, f"product_{product_image.filename}")
    style_ref_path = None

    try:
        with open(product_path, "wb") as f:
            shutil.copyfileobj(product_image.file, f)

        if style_reference_image is not None:
            style_ref_path = os.path.join(temp_dir, f"style_{style_reference_image.filename}")
            with open(style_ref_path, "wb") as f:
                shutil.copyfileobj(style_reference_image.file, f)

        try:
            options = json.loads(options_json or "{}")
            if not isinstance(options, dict):
                options = {}
        except Exception:
            options = {}

        generation_prompt, copy_style_hint = _build_generation_prompt(
            str(style_preset or "generic"),
            options,
            str(requirements or ""),
            str(aspect_ratio or "1:1"),
        )

        final_copy = (copy_text or "").strip()
        if final_copy and target_language and target_language != "same":
            src = _detect_language(final_copy)
            if target_language != src:
                final_copy = await _translate_text(final_copy, target_language, src)

        output_dir = os.path.join(os.path.abspath(config.OUTPUT_DIR), "studio")
        os.makedirs(output_dir, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_path = os.path.join(output_dir, f"studio_{ts}_{uuid.uuid4().hex[:6]}.png")

        result = await generate_styled_image(
            product_image_path=product_path,
            generation_prompt=generation_prompt,
            custom_text=final_copy or None,
            copy_style_hint=copy_style_hint,
            output_path=out_path,
            style_reference_image_path=style_ref_path,
        )

        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("message") or "生成失败")

        image_path = result.get("image_path") or out_path
        return JSONResponse(
            {
                "success": True,
                "message": result.get("message") or "生成成功",
                "image_path": image_path,
                "output_url": _to_output_url(image_path),
                "image_data": result.get("image_data"),
            }
        )
    finally:
        try:
            product_image.file.close()
        except Exception:
            pass
        if style_reference_image is not None:
            try:
                style_reference_image.file.close()
            except Exception:
                pass


@router.post("/text")
async def style_text(
    style_reference_image: Optional[UploadFile] = File(None, description="风格参考图（可选）"),
    style_preset: str = Form("generic", description="shein/amazon/tiktok/generic"),
    options_json: str = Form("{}", description="JSON string: style options"),
    requirements: str = Form("", description="额外要求/重点"),
    target_language: str = Form("same", description="same|zh|th|en"),
    aspect_ratio: str = Form("1:1", description="1:1/16:9/9:16/3:4/4:3"),
    copy_text: str = Form("", description="需要出现在图片中的文字（可选）"),
):
    """
    Studio 文生图（可选风格参考图）。
    """
    temp_dir = os.path.join(os.path.abspath(config.INPUT_DIR), f"temp_text_{uuid.uuid4().hex[:8]}")
    os.makedirs(temp_dir, exist_ok=True)

    style_ref_path = None
    try:
        if style_reference_image is not None:
            style_ref_path = os.path.join(temp_dir, f"style_{style_reference_image.filename}")
            with open(style_ref_path, "wb") as f:
                shutil.copyfileobj(style_reference_image.file, f)

        try:
            options = json.loads(options_json or "{}")
            if not isinstance(options, dict):
                options = {}
        except Exception:
            options = {}

        generation_prompt, copy_style_hint = _build_generation_prompt(
            str(style_preset or "generic"),
            options,
            str(requirements or ""),
            str(aspect_ratio or "1:1"),
        )

        final_copy = (copy_text or "").strip()
        if final_copy and target_language and target_language != "same":
            src = _detect_language(final_copy)
            if target_language != src:
                final_copy = await _translate_text(final_copy, target_language, src)

        output_dir = os.path.join(os.path.abspath(config.OUTPUT_DIR), "studio")
        os.makedirs(output_dir, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_path = os.path.join(output_dir, f"studio_text_{ts}_{uuid.uuid4().hex[:6]}.png")

        result = await generate_text_image(
            generation_prompt=generation_prompt,
            custom_text=final_copy or None,
            copy_style_hint=copy_style_hint,
            output_path=out_path,
            style_reference_image_path=style_ref_path,
        )

        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("message") or "生成失败")

        image_path = result.get("image_path") or out_path
        return JSONResponse(
            {
                "success": True,
                "message": result.get("message") or "生成成功",
                "image_path": image_path,
                "output_url": _to_output_url(image_path),
                "image_data": result.get("image_data"),
            }
        )
    finally:
        if style_reference_image is not None:
            try:
                style_reference_image.file.close()
            except Exception:
                pass
