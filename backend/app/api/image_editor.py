"""
图片可视化编辑 API
支持生成后的图片二次编辑
"""

from fastapi import APIRouter, HTTPException, File, UploadFile
from pydantic import BaseModel
from typing import Optional, List
from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter
import os
import base64
from io import BytesIO
import uuid

from ..config import config

router = APIRouter(prefix="/api/editor", tags=["Image Editor"])


class CropRequest(BaseModel):
    """裁剪请求"""
    image_path: str
    x: int
    y: int
    width: int
    height: int


class ResizeRequest(BaseModel):
    """缩放请求"""
    image_path: str
    width: int
    height: int
    maintain_aspect_ratio: bool = False


class RotateRequest(BaseModel):
    """旋转请求"""
    image_path: str
    angle: float  # 旋转角度，正数为顺时针


class AddTextRequest(BaseModel):
    """添加文字请求"""
    image_path: str
    text: str
    x: int
    y: int
    font_size: int = 48
    color: str = "#000000"  # 十六进制颜色
    font_family: Optional[str] = None


class AdjustRequest(BaseModel):
    """图片调整请求"""
    image_path: str
    brightness: Optional[float] = None  # 亮度 0.5-2.0
    contrast: Optional[float] = None    # 对比度 0.5-2.0
    saturation: Optional[float] = None  # 饱和度 0.5-2.0
    sharpness: Optional[float] = None   # 锐度 0.5-2.0


class FilterRequest(BaseModel):
    """滤镜请求"""
    image_path: str
    filter_type: str  # blur, sharpen, smooth, detail, edge_enhance


class BatchEditRequest(BaseModel):
    """批量编辑请求"""
    image_path: str
    operations: List[dict]  # 操作序列


def _save_edited_image(img: Image.Image, original_path: str) -> str:
    """保存编辑后的图片"""
    # 生成新的文件名
    base, ext = os.path.splitext(original_path)
    timestamp = uuid.uuid4().hex[:8]
    new_path = f"{base}_edited_{timestamp}{ext}"

    # 保存图片
    img.save(new_path, quality=95, optimize=True)
    return new_path


def _hex_to_rgb(hex_color: str) -> tuple:
    """将十六进制颜色转换为 RGB"""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


@router.post("/crop")
async def crop_image(request: CropRequest):
    """裁剪图片"""
    try:
        if not os.path.exists(request.image_path):
            raise HTTPException(status_code=404, detail="图片不存在")

        img = Image.open(request.image_path)

        # 裁剪
        cropped = img.crop((
            request.x,
            request.y,
            request.x + request.width,
            request.y + request.height
        ))

        # 保存
        new_path = _save_edited_image(cropped, request.image_path)

        return {
            "success": True,
            "image_path": new_path,
            "message": "裁剪成功"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"裁剪失败: {str(e)}")


@router.post("/resize")
async def resize_image(request: ResizeRequest):
    """缩放图片"""
    try:
        if not os.path.exists(request.image_path):
            raise HTTPException(status_code=404, detail="图片不存在")

        img = Image.open(request.image_path)

        if request.maintain_aspect_ratio:
            # 保持宽高比
            img.thumbnail((request.width, request.height), Image.Resampling.LANCZOS)
        else:
            # 强制缩放
            img = img.resize((request.width, request.height), Image.Resampling.LANCZOS)

        # 保存
        new_path = _save_edited_image(img, request.image_path)

        return {
            "success": True,
            "image_path": new_path,
            "message": "缩放成功"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"缩放失败: {str(e)}")


@router.post("/rotate")
async def rotate_image(request: RotateRequest):
    """旋转图片"""
    try:
        if not os.path.exists(request.image_path):
            raise HTTPException(status_code=404, detail="图片不存在")

        img = Image.open(request.image_path)

        # 旋转（逆时针为正）
        rotated = img.rotate(-request.angle, expand=True, resample=Image.Resampling.BICUBIC)

        # 保存
        new_path = _save_edited_image(rotated, request.image_path)

        return {
            "success": True,
            "image_path": new_path,
            "message": "旋转成功"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"旋转失败: {str(e)}")


@router.post("/add-text")
async def add_text_to_image(request: AddTextRequest):
    """在图片上添加文字"""
    try:
        if not os.path.exists(request.image_path):
            raise HTTPException(status_code=404, detail="图片不存在")

        img = Image.open(request.image_path)
        draw = ImageDraw.Draw(img)

        # 加载字体
        try:
            if request.font_family:
                font = ImageFont.truetype(request.font_family, request.font_size)
            else:
                # 尝试使用系统默认字体
                font = ImageFont.load_default()
        except:
            font = ImageFont.load_default()

        # 转换颜色
        color = _hex_to_rgb(request.color)

        # 添加文字
        draw.text((request.x, request.y), request.text, font=font, fill=color)

        # 保存
        new_path = _save_edited_image(img, request.image_path)

        return {
            "success": True,
            "image_path": new_path,
            "message": "文字添加成功"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"添加文字失败: {str(e)}")


@router.post("/adjust")
async def adjust_image(request: AdjustRequest):
    """调整图片参数（亮度、对比度等）"""
    try:
        if not os.path.exists(request.image_path):
            raise HTTPException(status_code=404, detail="图片不存在")

        img = Image.open(request.image_path)

        # 调整亮度
        if request.brightness is not None:
            enhancer = ImageEnhance.Brightness(img)
            img = enhancer.enhance(request.brightness)

        # 调整对比度
        if request.contrast is not None:
            enhancer = ImageEnhance.Contrast(img)
            img = enhancer.enhance(request.contrast)

        # 调整饱和度
        if request.saturation is not None:
            enhancer = ImageEnhance.Color(img)
            img = enhancer.enhance(request.saturation)

        # 调整锐度
        if request.sharpness is not None:
            enhancer = ImageEnhance.Sharpness(img)
            img = enhancer.enhance(request.sharpness)

        # 保存
        new_path = _save_edited_image(img, request.image_path)

        return {
            "success": True,
            "image_path": new_path,
            "message": "调整成功"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"调整失败: {str(e)}")


@router.post("/filter")
async def apply_filter(request: FilterRequest):
    """应用滤镜"""
    try:
        if not os.path.exists(request.image_path):
            raise HTTPException(status_code=404, detail="图片不存在")

        img = Image.open(request.image_path)

        # 应用滤镜
        filter_map = {
            "blur": ImageFilter.BLUR,
            "sharpen": ImageFilter.SHARPEN,
            "smooth": ImageFilter.SMOOTH,
            "detail": ImageFilter.DETAIL,
            "edge_enhance": ImageFilter.EDGE_ENHANCE
        }

        if request.filter_type not in filter_map:
            raise HTTPException(status_code=400, detail=f"不支持的滤镜类型: {request.filter_type}")

        img_filtered = img.filter(filter_map[request.filter_type])

        # 保存
        new_path = _save_edited_image(img_filtered, request.image_path)

        return {
            "success": True,
            "image_path": new_path,
            "message": f"滤镜 {request.filter_type} 应用成功"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"应用滤镜失败: {str(e)}")


@router.post("/batch-edit")
async def batch_edit(request: BatchEditRequest):
    """
    批量编辑操作
    支持按顺序执行多个编辑操作

    operations 格式示例:
    [
        {"type": "crop", "params": {"x": 0, "y": 0, "width": 500, "height": 500}},
        {"type": "resize", "params": {"width": 1000, "height": 1000}},
        {"type": "adjust", "params": {"brightness": 1.2}}
    ]
    """
    try:
        if not os.path.exists(request.image_path):
            raise HTTPException(status_code=404, detail="图片不存在")

        img = Image.open(request.image_path)
        current_path = request.image_path

        # 按顺序执行操作
        for operation in request.operations:
            op_type = operation.get("type")
            params = operation.get("params", {})

            if op_type == "crop":
                img = img.crop((
                    params["x"],
                    params["y"],
                    params["x"] + params["width"],
                    params["y"] + params["height"]
                ))

            elif op_type == "resize":
                if params.get("maintain_aspect_ratio"):
                    img.thumbnail((params["width"], params["height"]), Image.Resampling.LANCZOS)
                else:
                    img = img.resize((params["width"], params["height"]), Image.Resampling.LANCZOS)

            elif op_type == "rotate":
                img = img.rotate(-params["angle"], expand=True, resample=Image.Resampling.BICUBIC)

            elif op_type == "adjust":
                if "brightness" in params:
                    img = ImageEnhance.Brightness(img).enhance(params["brightness"])
                if "contrast" in params:
                    img = ImageEnhance.Contrast(img).enhance(params["contrast"])
                if "saturation" in params:
                    img = ImageEnhance.Color(img).enhance(params["saturation"])
                if "sharpness" in params:
                    img = ImageEnhance.Sharpness(img).enhance(params["sharpness"])

            elif op_type == "filter":
                filter_map = {
                    "blur": ImageFilter.BLUR,
                    "sharpen": ImageFilter.SHARPEN,
                    "smooth": ImageFilter.SMOOTH,
                    "detail": ImageFilter.DETAIL,
                    "edge_enhance": ImageFilter.EDGE_ENHANCE
                }
                img = img.filter(filter_map.get(params["filter_type"], ImageFilter.SHARPEN))

        # 保存最终结果
        new_path = _save_edited_image(img, current_path)

        return {
            "success": True,
            "image_path": new_path,
            "message": f"批量编辑完成，共执行 {len(request.operations)} 个操作"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"批量编辑失败: {str(e)}")


@router.get("/preview")
async def preview_operation(
    image_path: str,
    operation: str,
    params: str  # JSON 字符串
):
    """
    预览编辑效果（不保存）
    返回 base64 编码的图片
    """
    try:
        import json

        if not os.path.exists(image_path):
            raise HTTPException(status_code=404, detail="图片不存在")

        img = Image.open(image_path)
        params_dict = json.loads(params)

        # 执行操作
        if operation == "crop":
            img = img.crop((
                params_dict["x"],
                params_dict["y"],
                params_dict["x"] + params_dict["width"],
                params_dict["y"] + params_dict["height"]
            ))
        elif operation == "resize":
            img = img.resize((params_dict["width"], params_dict["height"]), Image.Resampling.LANCZOS)
        elif operation == "rotate":
            img = img.rotate(-params_dict["angle"], expand=True)
        # ... 其他操作

        # 转换为 base64
        buffered = BytesIO()
        img.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode()

        return {
            "success": True,
            "preview_image": f"data:image/png;base64,{img_base64}"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"预览失败: {str(e)}")
