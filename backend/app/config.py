"""
Xobi Configuration - API Keys and Settings
"""
import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class Config:
    """Application configuration"""
    
    # Yunwu API Base URL
    YUNWU_BASE_URL: str = "https://yunwu.ai"
    
    # Gemini 3 Pro Image Preview (用于图片生成 - Painter)
    GEMINI_IMAGE_API_KEY: str = os.getenv(
        "GEMINI_IMAGE_API_KEY",
        "sk-bFhLmbiUT2xdatRCaxbs3JKtySEldyWORyI9m7K2gZxAD7Px"
    )
    GEMINI_IMAGE_MODEL: str = "gemini-3-pro-image-preview"
    
    # Gemini 3 Flash Preview (用于 Prompt 编译和质检 - Director/Inspector)
    GEMINI_FLASH_API_KEY: str = os.getenv(
        "GEMINI_FLASH_API_KEY",
        "sk-Oc94mUXKNLZ3irBvvna8mffp9rkt07EQnlr5PuIMzi06BDYw"
    )
    GEMINI_FLASH_MODEL: str = "gemini-3-flash-preview"
    
    # 生成参数
    IMAGE_SIZE: str = "square"  # 电商通用 1:1
    MAX_RETRY_COUNT: int = 2  # 质检失败最多重试次数
    
    # 存储路径
    INPUT_DIR: str = os.path.join(os.path.dirname(__file__), "..", "..", "data", "inputs")
    OUTPUT_DIR: str = os.path.join(os.path.dirname(__file__), "..", "..", "data", "outputs")
    
    # API 请求超时
    REQUEST_TIMEOUT: int = 120  # 秒


config = Config()
