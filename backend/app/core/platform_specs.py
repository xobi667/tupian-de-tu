"""
电商平台图片规格预设
支持主流电商平台的图片尺寸、比例和要求
"""

from typing import Dict, List, Any
from dataclasses import dataclass


@dataclass
class ImageSpec:
    """图片规格"""
    name: str
    width: int
    height: int
    aspect_ratio: str
    min_size: int  # KB
    max_size: int  # KB
    format: str
    description: str


# 电商平台规格配置
PLATFORM_SPECS: Dict[str, Dict[str, ImageSpec]] = {
    "amazon": {
        "main": ImageSpec(
            name="亚马逊主图",
            width=2000,
            height=2000,
            aspect_ratio="1:1",
            min_size=500,
            max_size=10240,
            format="JPEG/PNG",
            description="亚马逊主图要求：纯白背景，产品占比80%以上，至少2000x2000像素"
        ),
        "detail": ImageSpec(
            name="亚马逊详情图",
            width=1500,
            height=1500,
            aspect_ratio="1:1",
            min_size=300,
            max_size=10240,
            format="JPEG/PNG",
            description="详情页图片，可包含场景和文案"
        )
    },

    "shopee": {
        "main": ImageSpec(
            name="Shopee主图",
            width=1024,
            height=1024,
            aspect_ratio="1:1",
            min_size=100,
            max_size=2048,
            format="JPEG/PNG",
            description="Shopee主图：建议1:1比例，最小800x800"
        ),
        "banner": ImageSpec(
            name="Shopee横幅",
            width=1200,
            height=500,
            aspect_ratio="12:5",
            min_size=100,
            max_size=2048,
            format="JPEG/PNG",
            description="店铺横幅广告图"
        )
    },

    "tiktok": {
        "product": ImageSpec(
            name="TikTok商品图",
            width=1200,
            height=1200,
            aspect_ratio="1:1",
            min_size=50,
            max_size=5120,
            format="JPEG/PNG",
            description="TikTok Shop商品图，支持1:1或9:16"
        ),
        "video_cover": ImageSpec(
            name="TikTok视频封面",
            width=1080,
            height=1920,
            aspect_ratio="9:16",
            min_size=100,
            max_size=5120,
            format="JPEG/PNG",
            description="短视频封面，竖屏比例"
        )
    },

    "facebook": {
        "post": ImageSpec(
            name="Facebook帖子",
            width=1200,
            height=630,
            aspect_ratio="1.91:1",
            min_size=100,
            max_size=8192,
            format="JPEG/PNG",
            description="Facebook/Instagram帖子推荐尺寸"
        ),
        "story": ImageSpec(
            name="Facebook故事",
            width=1080,
            height=1920,
            aspect_ratio="9:16",
            min_size=100,
            max_size=8192,
            format="JPEG/PNG",
            description="Stories竖屏全屏显示"
        )
    },

    "instagram": {
        "square": ImageSpec(
            name="Instagram方图",
            width=1080,
            height=1080,
            aspect_ratio="1:1",
            min_size=100,
            max_size=8192,
            format="JPEG/PNG",
            description="Instagram方形帖子"
        ),
        "portrait": ImageSpec(
            name="Instagram竖图",
            width=1080,
            height=1350,
            aspect_ratio="4:5",
            min_size=100,
            max_size=8192,
            format="JPEG/PNG",
            description="Instagram竖版帖子"
        )
    },

    "lazada": {
        "main": ImageSpec(
            name="Lazada主图",
            width=1000,
            height=1000,
            aspect_ratio="1:1",
            min_size=100,
            max_size=2048,
            format="JPEG/PNG",
            description="Lazada商品主图"
        )
    },

    "aliexpress": {
        "main": ImageSpec(
            name="速卖通主图",
            width=800,
            height=800,
            aspect_ratio="1:1",
            min_size=100,
            max_size=5120,
            format="JPEG/PNG",
            description="AliExpress产品主图"
        )
    },

    "custom": {
        "square": ImageSpec(
            name="自定义方图",
            width=1024,
            height=1024,
            aspect_ratio="1:1",
            min_size=50,
            max_size=10240,
            format="JPEG/PNG",
            description="通用方形图片"
        ),
        "landscape": ImageSpec(
            name="自定义横图",
            width=1920,
            height=1080,
            aspect_ratio="16:9",
            min_size=50,
            max_size=10240,
            format="JPEG/PNG",
            description="通用横向图片"
        ),
        "portrait": ImageSpec(
            name="自定义竖图",
            width=1080,
            height=1920,
            aspect_ratio="9:16",
            min_size=50,
            max_size=10240,
            format="JPEG/PNG",
            description="通用竖向图片"
        )
    }
}


def get_platform_list() -> List[str]:
    """获取所有支持的平台列表"""
    return list(PLATFORM_SPECS.keys())


def get_platform_specs(platform: str) -> Dict[str, Any]:
    """获取指定平台的所有规格"""
    if platform not in PLATFORM_SPECS:
        return {"error": f"不支持的平台: {platform}"}

    specs = PLATFORM_SPECS[platform]
    return {
        "platform": platform,
        "specs": {
            key: {
                "name": spec.name,
                "width": spec.width,
                "height": spec.height,
                "aspect_ratio": spec.aspect_ratio,
                "min_size": spec.min_size,
                "max_size": spec.max_size,
                "format": spec.format,
                "description": spec.description
            }
            for key, spec in specs.items()
        }
    }


def get_spec(platform: str, spec_type: str) -> ImageSpec:
    """获取特定平台的特定规格"""
    if platform not in PLATFORM_SPECS:
        # 返回默认规格
        return PLATFORM_SPECS["custom"]["square"]

    specs = PLATFORM_SPECS[platform]
    if spec_type not in specs:
        # 返回该平台的第一个规格
        return list(specs.values())[0]

    return specs[spec_type]


def get_all_specs() -> Dict[str, Any]:
    """获取所有平台的所有规格"""
    return {
        platform: get_platform_specs(platform)
        for platform in PLATFORM_SPECS.keys()
    }
