"""
图片代理 API
用于前端表格预览外链/本地路径图片（从 Excel智能处理 迁移）
"""

from __future__ import annotations

import logging
import mimetypes
import os

import httpx
from fastapi import APIRouter, Query
from fastapi.responses import FileResponse, Response

from ..config import config

router = APIRouter(tags=["图片代理"])
logger = logging.getLogger(__name__)


def _first_url(value: str) -> str:
    if not value:
        return ""
    s = str(value).strip()
    if not s:
        return ""
    if "," in s:
        return s.split(",", 1)[0].strip()
    return s


def _is_http_url(value: str) -> bool:
    return value.startswith("http://") or value.startswith("https://")


@router.get("/api/proxy-image")
async def proxy_image(url: str = Query(..., description="要代理的图片URL或本地路径")):
    url = _first_url(url)
    if not url:
        return Response(status_code=400, content="缺少 URL 参数")

    # 远程图片：绕过防盗链
    if _is_http_url(url):
        try:
            async with httpx.AsyncClient(verify=False, follow_redirects=True, timeout=20.0) as client:
                headers = {
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0.0.0 Safari/537.36"
                    ),
                    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Connection": "keep-alive",
                    "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    "Sec-Ch-Ua-Mobile": "?0",
                    "Sec-Ch-Ua-Platform": '"Windows"',
                    "Sec-Fetch-Dest": "image",
                    "Sec-Fetch-Mode": "no-cors",
                    "Sec-Fetch-Site": "cross-site",
                }

                lower = url.lower()
                if "shopee" in lower:
                    headers["Referer"] = "https://shopee.tw/"
                elif "taobao" in lower or "tmall" in lower:
                    headers["Referer"] = "https://www.taobao.com/"
                elif "jd.com" in lower:
                    headers["Referer"] = "https://www.jd.com/"
                else:
                    headers["Referer"] = "https://www.google.com/"

                logger.info(f"[ProxyImage] Fetch: {url}")
                resp = await client.get(url, headers=headers)
                if resp.status_code != 200:
                    return Response(status_code=resp.status_code, content=f"上游服务器返回 {resp.status_code}")

                content_type = resp.headers.get("content-type", "image/jpeg")
                return Response(
                    content=resp.content,
                    media_type=content_type,
                    headers={
                        "Cache-Control": "public, max-age=86400",
                        "Access-Control-Allow-Origin": "*",
                    },
                )
        except httpx.TimeoutException:
            return Response(status_code=504, content="请求超时")
        except Exception as e:
            logger.exception(f"[ProxyImage] Error: {e}")
            return Response(status_code=500, content=str(e))

    # 本地路径：用于预览（支持相对路径 -> INPUT_DIR）
    local_path = url
    if not os.path.isabs(local_path):
        local_path = os.path.join(os.path.abspath(config.INPUT_DIR), local_path)

    local_path = os.path.abspath(local_path)
    if not os.path.exists(local_path) or not os.path.isfile(local_path):
        return Response(status_code=404, content="图片不存在")

    media_type = mimetypes.guess_type(local_path)[0] or "application/octet-stream"
    return FileResponse(path=local_path, media_type=media_type, headers={"Cache-Control": "public, max-age=86400"})

