"""
Dynamic Config Middleware - 从请求头提取 API 配置并注入到上下文
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from ..config import set_runtime_config


class DynamicConfigMiddleware(BaseHTTPMiddleware):
    """
    从请求头提取云雾 API 配置并注入到上下文变量中

    支持的请求头：
    - X-Yunwu-Api-Key: 云雾 API Key
    - X-Yunwu-Base-Url: 云雾 Base URL
    - X-Gemini-Flash-Model: Flash 模型名称
    - X-Gemini-Image-Model: Image 模型名称
    """

    async def dispatch(self, request: Request, call_next):
        # 提取自定义配置头（请求头名称不区分大小写）
        runtime_config = {}

        # API Key（云雾一个 key 通用）
        if api_key := request.headers.get('x-yunwu-api-key'):
            runtime_config['yunwu_api_key'] = api_key

        # Flash 模型（用于对话和分析）
        if flash_model := request.headers.get('x-gemini-flash-model'):
            runtime_config['gemini_flash_model'] = flash_model

        # Image 模型（用于图片生成）
        if image_model := request.headers.get('x-gemini-image-model'):
            runtime_config['gemini_image_model'] = image_model

        # Base URL
        if base_url := request.headers.get('x-yunwu-base-url'):
            runtime_config['yunwu_base_url'] = base_url

        # 注入到上下文（如果有配置的话）
        if runtime_config:
            set_runtime_config(runtime_config)
            print(f"[Config Middleware] Runtime config injected: {list(runtime_config.keys())}")

        response = await call_next(request)
        return response
