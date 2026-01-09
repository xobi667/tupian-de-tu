"""
图片代理 API
解决外部图片防盗链问题（如Shopee、淘宝等）
"""
from fastapi import APIRouter, Query
from fastapi.responses import Response
import httpx
import logging

router = APIRouter(tags=["图片代理"])
logger = logging.getLogger(__name__)


@router.get("/api/proxy-image")
async def proxy_image(url: str = Query(..., description="要代理的图片URL")):
    """
    代理外部图片请求，绕过防盗链

    用法:
    - 原始URL: https://s-cf-tw.shopeesz.com/file/xxx.jpg
    - 代理URL: /api/proxy-image?url=https://s-cf-tw.shopeesz.com/file/xxx.jpg

    支持:
    - Shopee图片
    - 淘宝图片
    - 京东图片
    - 其他带防盗链的图片
    """
    if not url:
        return Response(
            status_code=400,
            content="缺少 URL 参数"
        )

    # 处理多图URL（逗号分隔，只取第一个）
    if ',' in url:
        url = url.split(',')[0].strip()
        logger.info(f"[图片代理] 从多图URL中提取第一个: {url}")

    try:
        async with httpx.AsyncClient(
            verify=False,
            follow_redirects=True,
            timeout=20.0
        ) as client:
            # 设置请求头，伪装成浏览器
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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

            # 根据不同平台设置不同的 Referer
            if "shopee" in url.lower():
                headers["Referer"] = "https://shopee.tw/"
            elif "taobao" in url.lower() or "tmall" in url.lower():
                headers["Referer"] = "https://www.taobao.com/"
            elif "jd.com" in url.lower():
                headers["Referer"] = "https://www.jd.com/"
            else:
                headers["Referer"] = "https://www.google.com/"

            logger.info(f"[图片代理] 正在获取: {url}")
            resp = await client.get(url, headers=headers)

            if resp.status_code != 200:
                logger.error(f"[图片代理] 失败: {url} -> HTTP {resp.status_code}")
                return Response(
                    status_code=resp.status_code,
                    content=f"上游服务器返回 {resp.status_code}"
                )

            content_type = resp.headers.get("content-type", "image/jpeg")
            logger.info(f"[图片代理] 成功: {url} (Content-Type: {content_type})")

            return Response(
                content=resp.content,
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=86400",  # 缓存1天
                    "Access-Control-Allow-Origin": "*"
                }
            )

    except httpx.TimeoutException:
        logger.error(f"[图片代理] 超时: {url}")
        return Response(status_code=504, content="请求超时")

    except Exception as e:
        logger.error(f"[图片代理] 异常: {url} -> {str(e)}")
        import traceback
        traceback.print_exc()
        return Response(status_code=500, content=str(e))
