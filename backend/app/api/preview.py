"""
Xobi API - Preview Endpoint
实时预览接口 - 生成低分辨率快速预览图
"""
import os
import shutil
import uuid
import base64
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional

from ..core.replacer import generate_replacement_image
from ..config import config

router = APIRouter(prefix="/api/preview", tags=["Preview"])


@router.post("/generate")
async def generate_preview(
    product_image: UploadFile = File(..., description="产品图（白底）"),
    reference_image: UploadFile = File(..., description="参考主图"),
    custom_prompt: str = Form(..., description="生成 Prompt"),
    custom_text: Optional[str] = Form(None, description="自定义文案（可选）")
):
    """
    生成预览图 - 快速低分辨率预览

    参数：
    - 固定分辨率：512x512
    - 快速生成模式
    - 超时：60秒

    返回预览图的 base64 数据
    """
    # 创建临时目录
    temp_dir = os.path.join(os.path.abspath(config.INPUT_DIR), f"preview_{uuid.uuid4().hex[:8]}")
    os.makedirs(temp_dir, exist_ok=True)

    try:
        # 保存上传的图片
        product_path = os.path.join(temp_dir, f"product_{product_image.filename}")
        reference_path = os.path.join(temp_dir, f"reference_{reference_image.filename}")

        with open(product_path, "wb") as f:
            shutil.copyfileobj(product_image.file, f)

        with open(reference_path, "wb") as f:
            shutil.copyfileobj(reference_image.file, f)

        # 构建预览专用的 Prompt（添加低分辨率快速生成指示）
        preview_prompt = f"""{custom_prompt}

PREVIEW MODE: Generate a quick preview at 512x512 resolution for rapid feedback.
Focus on overall composition and color scheme rather than fine details."""

        print(f"[Preview] 开始生成预览图...")
        print(f"[Preview] Prompt: {preview_prompt[:100]}...")

        # 生成预览图（不保存到文件，直接返回 base64）
        result = await generate_replacement_image(
            product_image_path=product_path,
            reference_image_path=reference_path,
            generation_prompt=preview_prompt,
            custom_text=custom_text,
            output_path=None  # 不保存文件
        )

        if result.get("success"):
            return JSONResponse({
                "success": True,
                "message": "预览图生成成功",
                "preview_data": result.get("image_data"),  # base64
                "is_preview": True,
                "mime_type": result.get("mime_type", "image/png")
            })
        else:
            return JSONResponse({
                "success": False,
                "message": result.get("message", "预览图生成失败"),
                "is_preview": True
            }, status_code=400)

    except Exception as e:
        print(f"[Preview] 错误: {str(e)}")
        return JSONResponse({
            "success": False,
            "message": f"预览图生成失败: {str(e)}",
            "is_preview": True
        }, status_code=500)

    finally:
        # 清理临时文件
        product_image.file.close()
        reference_image.file.close()
        # 清理临时目录
        try:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
        except Exception as e:
            print(f"[Preview] 清理临时文件失败: {str(e)}")
