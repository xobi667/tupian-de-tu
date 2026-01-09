"""
Xobi Configuration - Settings
"""

import os
from dataclasses import dataclass
from typing import Optional
from contextvars import ContextVar

# 上下文变量（请求级配置，用于从请求头动态获取配置）
_runtime_config: ContextVar[Optional[dict]] = ContextVar('_runtime_config', default=None)


def _load_dotenv() -> None:
    try:
        from dotenv import load_dotenv  # type: ignore
    except Exception:
        return
    load_dotenv()


def _get_int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError:
        return default


_load_dotenv()


@dataclass(frozen=True)
class Config:
    """Application configuration"""

    # Yunwu API Base URL
    YUNWU_BASE_URL: str = os.getenv("YUNWU_BASE_URL", "https://yunwu.ai")

    # Gemini 3 Pro Image Preview (用于图片生成 - Painter)
    GEMINI_IMAGE_API_KEY: str = os.getenv("GEMINI_IMAGE_API_KEY", "")
    GEMINI_IMAGE_MODEL: str = os.getenv("GEMINI_IMAGE_MODEL", "gemini-3-pro-image-preview")

    # Gemini 3 Flash Preview (用于 Prompt 编译和质检 - Director/Inspector)
    GEMINI_FLASH_API_KEY: str = os.getenv("GEMINI_FLASH_API_KEY", "")
    GEMINI_FLASH_MODEL: str = os.getenv("GEMINI_FLASH_MODEL", "gemini-3-flash-preview")

    # 生成参数
    IMAGE_SIZE: str = os.getenv("IMAGE_SIZE", "square")  # 电商通用 1:1
    MAX_RETRY_COUNT: int = _get_int_env("MAX_RETRY_COUNT", 2)  # 质检失败最多重试次数

    # 存储路径
    INPUT_DIR: str = os.getenv(
        "INPUT_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "data", "inputs")
    )
    OUTPUT_DIR: str = os.getenv(
        "OUTPUT_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "data", "outputs")
    )

    # API 请求超时
    REQUEST_TIMEOUT: int = _get_int_env("REQUEST_TIMEOUT", 120)  # 秒


    # 动态配置方法（支持从请求头获取配置）
    def get_api_key(self, key_type: str = 'flash') -> str:
        """获取 API key，优先使用运行时配置（请求头），否则回退到环境变量"""
        runtime = _runtime_config.get()
        if runtime and 'yunwu_api_key' in runtime:
            return runtime['yunwu_api_key']

        # 回退到环境变量
        if key_type == 'flash':
            return self.GEMINI_FLASH_API_KEY
        else:
            return self.GEMINI_IMAGE_API_KEY

    def get_model(self, model_type: str = 'flash') -> str:
        """获取模型名称，优先使用运行时配置，否则回退到环境变量"""
        runtime = _runtime_config.get()
        if runtime:
            if model_type == 'flash' and 'gemini_flash_model' in runtime:
                return runtime['gemini_flash_model']
            elif model_type == 'image' and 'gemini_image_model' in runtime:
                return runtime['gemini_image_model']

        # 回退到环境变量
        if model_type == 'flash':
            return self.GEMINI_FLASH_MODEL
        else:
            return self.GEMINI_IMAGE_MODEL

    def get_base_url(self) -> str:
        """获取 Base URL，优先使用运行时配置，否则回退到环境变量"""
        runtime = _runtime_config.get()
        if runtime and 'yunwu_base_url' in runtime:
            return runtime['yunwu_base_url']
        return self.YUNWU_BASE_URL


config = Config()


def set_runtime_config(config_dict: dict):
    """设置当前请求的运行时配置（由中间件调用）"""
    _runtime_config.set(config_dict)


if not config.GEMINI_FLASH_API_KEY or not config.GEMINI_IMAGE_API_KEY:
    missing = []
    if not config.GEMINI_FLASH_API_KEY:
        missing.append("GEMINI_FLASH_API_KEY")
    if not config.GEMINI_IMAGE_API_KEY:
        missing.append("GEMINI_IMAGE_API_KEY")
    print(f"[Xobi][WARN] 未配置环境变量: {', '.join(missing)}；相关 AI 接口将无法调用。")
