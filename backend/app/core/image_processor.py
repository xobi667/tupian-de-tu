"""
图片后处理模块
支持图片裁剪、缩放、格式转换等操作
"""

import os
from PIL import Image
from typing import Optional, Tuple
import base64
from io import BytesIO


def resize_image(
    image_path: str,
    target_width: int,
    target_height: int,
    output_path: Optional[str] = None,
    maintain_aspect_ratio: bool = False
) -> str:
    """
    调整图片尺寸

    Args:
        image_path: 输入图片路径
        target_width: 目标宽度
        target_height: 目标高度
        output_path: 输出路径（可选，默认覆盖原图）
        maintain_aspect_ratio: 是否保持宽高比（默认False，会强制拉伸到目标尺寸）

    Returns:
        处理后的图片路径
    """
    img = Image.open(image_path)

    if maintain_aspect_ratio:
        # 保持宽高比，使用 thumbnail 方法
        img.thumbnail((target_width, target_height), Image.Resampling.LANCZOS)
    else:
        # 强制缩放到目标尺寸
        img = img.resize((target_width, target_height), Image.Resampling.LANCZOS)

    # 确定输出路径
    if not output_path:
        output_path = image_path

    img.save(output_path, quality=95)
    return output_path


def crop_to_aspect_ratio(
    image_path: str,
    aspect_ratio: str,
    output_path: Optional[str] = None
) -> str:
    """
    裁剪图片到指定宽高比

    Args:
        image_path: 输入图片路径
        aspect_ratio: 宽高比，如 "1:1", "16:9", "9:16"
        output_path: 输出路径

    Returns:
        处理后的图片路径
    """
    img = Image.open(image_path)
    current_width, current_height = img.size

    # 解析目标宽高比
    try:
        ratio_parts = aspect_ratio.split(":")
        target_ratio = float(ratio_parts[0]) / float(ratio_parts[1])
    except:
        raise ValueError(f"无效的宽高比格式: {aspect_ratio}")

    current_ratio = current_width / current_height

    if abs(current_ratio - target_ratio) < 0.01:
        # 已经是目标比例，无需裁剪
        return image_path

    # 计算裁剪区域
    if current_ratio > target_ratio:
        # 当前图片过宽，裁剪左右两侧
        new_width = int(current_height * target_ratio)
        new_height = current_height
        left = (current_width - new_width) // 2
        top = 0
        right = left + new_width
        bottom = current_height
    else:
        # 当前图片过高，裁剪上下两侧
        new_width = current_width
        new_height = int(current_width / target_ratio)
        left = 0
        top = (current_height - new_height) // 2
        right = current_width
        bottom = top + new_height

    # 裁剪图片
    img_cropped = img.crop((left, top, right, bottom))

    # 确定输出路径
    if not output_path:
        output_path = image_path

    img_cropped.save(output_path, quality=95)
    return output_path


def optimize_for_platform(
    image_path: str,
    platform: str,
    spec_type: str,
    output_path: Optional[str] = None
) -> dict:
    """
    根据平台规格优化图片

    Args:
        image_path: 输入图片路径
        platform: 平台名称（如 "amazon", "shopee"）
        spec_type: 规格类型（如 "main", "detail"）
        output_path: 输出路径

    Returns:
        {
            "success": bool,
            "output_path": str,
            "message": str,
            "original_size": tuple,
            "final_size": tuple
        }
    """
    from .platform_specs import get_spec

    spec = get_spec(platform, spec_type)

    try:
        img = Image.open(image_path)
        original_size = img.size

        # Step 1: 裁剪到目标宽高比
        img_cropped = _crop_to_ratio(img, spec.aspect_ratio)

        # Step 2: 缩放到目标尺寸
        img_resized = img_cropped.resize((spec.width, spec.height), Image.Resampling.LANCZOS)

        # 确定输出路径
        if not output_path:
            base, ext = os.path.splitext(image_path)
            output_path = f"{base}_{platform}_{spec_type}{ext}"

        # 保存图片
        img_resized.save(output_path, quality=95, optimize=True)

        # 检查文件大小
        file_size_kb = os.path.getsize(output_path) // 1024

        return {
            "success": True,
            "output_path": output_path,
            "message": f"已优化为{spec.name}规格",
            "original_size": original_size,
            "final_size": (spec.width, spec.height),
            "file_size_kb": file_size_kb,
            "spec": {
                "name": spec.name,
                "width": spec.width,
                "height": spec.height,
                "aspect_ratio": spec.aspect_ratio
            }
        }

    except Exception as e:
        return {
            "success": False,
            "output_path": None,
            "message": f"图片处理失败: {str(e)}",
            "original_size": None,
            "final_size": None
        }


def _crop_to_ratio(img: Image.Image, aspect_ratio: str) -> Image.Image:
    """内部方法：裁剪 PIL Image 到指定宽高比"""
    current_width, current_height = img.size

    # 解析目标宽高比
    ratio_parts = aspect_ratio.split(":")
    target_ratio = float(ratio_parts[0]) / float(ratio_parts[1])

    current_ratio = current_width / current_height

    if abs(current_ratio - target_ratio) < 0.01:
        return img

    # 计算裁剪区域
    if current_ratio > target_ratio:
        new_width = int(current_height * target_ratio)
        new_height = current_height
        left = (current_width - new_width) // 2
        top = 0
        right = left + new_width
        bottom = current_height
    else:
        new_width = current_width
        new_height = int(current_width / target_ratio)
        left = 0
        top = (current_height - new_height) // 2
        right = current_width
        bottom = top + new_height

    return img.crop((left, top, right, bottom))


def convert_format(
    image_path: str,
    output_format: str,
    output_path: Optional[str] = None
) -> str:
    """
    转换图片格式

    Args:
        image_path: 输入图片路径
        output_format: 输出格式（"PNG", "JPEG", "WEBP"）
        output_path: 输出路径

    Returns:
        处理后的图片路径
    """
    img = Image.open(image_path)

    # 如果转换为 JPEG，需要处理透明通道
    if output_format.upper() == "JPEG" and img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
        img = background

    # 确定输出路径
    if not output_path:
        base, _ = os.path.splitext(image_path)
        ext = "." + output_format.lower()
        if ext == ".jpeg":
            ext = ".jpg"
        output_path = base + ext

    img.save(output_path, format=output_format.upper(), quality=95)
    return output_path
