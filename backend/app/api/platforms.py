"""
电商平台规格 API
提供各平台图片规格查询
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional

from ..core.platform_specs import (
    get_all_specs,
    get_platform_list,
    get_platform_specs
)

router = APIRouter(prefix="/api/platforms", tags=["Platforms"])


@router.get("")
async def list_platforms():
    """获取所有支持的电商平台列表"""
    platforms = get_platform_list()
    return JSONResponse({
        "platforms": platforms,
        "total": len(platforms)
    })


@router.get("/specs")
async def get_all_platform_specs():
    """获取所有平台的规格配置"""
    specs = get_all_specs()
    return JSONResponse(specs)


@router.get("/{platform}/specs")
async def get_specs_by_platform(platform: str):
    """获取指定平台的规格配置"""
    specs = get_platform_specs(platform)

    if "error" in specs:
        raise HTTPException(status_code=404, detail=specs["error"])

    return JSONResponse(specs)
