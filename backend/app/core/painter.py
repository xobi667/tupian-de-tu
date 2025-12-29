"""
Painter Module - Image Generation via Yunwu API (Gemini 3 Pro Image / Flux)
负责执行高一致性批量绘图
"""
import httpx
import asyncio
import time
import base64
from typing import Dict, Any, Optional
from ..config import config


class PainterError(Exception):
    """图像生成错误"""
    pass


async def generate_image(
    prompt: str,
    negative_prompt: str = "",
    seed: Optional[int] = None,
    retry_count: int = 0
) -> Dict[str, Any]:
    """
    使用 Gemini 3 Pro Image Preview 生成电商主图
    
    Args:
        prompt: 正向提示词
        negative_prompt: 负向提示词
        seed: 随机种子 (用于风格一致性)
        retry_count: 当前重试次数
        
    Returns:
        包含图片 URL 或 base64 数据的字典
    """
    url = f"{config.YUNWU_BASE_URL}/v1beta/models/{config.GEMINI_IMAGE_MODEL}:generateContent"
    
    headers = {
        "Authorization": f"Bearer {config.GEMINI_IMAGE_API_KEY}",
        "Content-Type": "application/json"
    }
    
    # 构建生成请求
    full_prompt = prompt
    if negative_prompt:
        full_prompt += f"\n\nNegative constraints: {negative_prompt}"
    
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": f"Generate a professional e-commerce product image:\n\n{full_prompt}"
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.8,
            "topP": 0.95,
            "responseModalities": ["image", "text"],
            "imageSizeHint": "1024x1024"  # 电商标准尺寸
        }
    }
    
    # 如果指定了 seed，添加到配置
    if seed is not None:
        payload["generationConfig"]["seed"] = seed
    
    try:
        async with httpx.AsyncClient(timeout=config.REQUEST_TIMEOUT) as client:
            print(f"[Painter] Generating image... (attempt {retry_count + 1})")
            response = await client.post(url, headers=headers, json=payload)
            
            if response.status_code == 500 or response.status_code == 503:
                # 服务器错误，等待后重试
                if retry_count < config.MAX_RETRY_COUNT:
                    print(f"[Painter] Server error {response.status_code}, retrying in 2s...")
                    await asyncio.sleep(2)
                    return await generate_image(prompt, negative_prompt, seed, retry_count + 1)
                else:
                    raise PainterError(f"Server error after {retry_count + 1} attempts")
            
            response.raise_for_status()
            result = response.json()
            
            # 解析响应 - 提取图片数据
            return parse_image_response(result)
            
    except httpx.TimeoutException:
        if retry_count < config.MAX_RETRY_COUNT:
            print(f"[Painter] Timeout, retrying in 2s...")
            await asyncio.sleep(2)
            return await generate_image(prompt, negative_prompt, seed, retry_count + 1)
        raise PainterError("Image generation timed out")
        
    except httpx.HTTPStatusError as e:
        raise PainterError(f"HTTP error: {e.response.status_code} - {e.response.text}")
        
    except Exception as e:
        raise PainterError(f"Unexpected error: {str(e)}")


def parse_image_response(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    解析 Gemini Image API 响应
    
    Returns:
        {
            "success": bool,
            "image_data": base64 string or None,
            "image_url": URL string or None,
            "mime_type": str,
            "message": str
        }
    """
    try:
        if "candidates" not in result or len(result["candidates"]) == 0:
            return {
                "success": False,
                "image_data": None,
                "image_url": None,
                "mime_type": None,
                "message": "No candidates in response"
            }
        
        candidate = result["candidates"][0]
        content = candidate.get("content", {})
        parts = content.get("parts", [])
        
        for part in parts:
            # 检查是否有内联图片数据
            if "inlineData" in part:
                inline_data = part["inlineData"]
                return {
                    "success": True,
                    "image_data": inline_data.get("data"),
                    "image_url": None,
                    "mime_type": inline_data.get("mimeType", "image/png"),
                    "message": "Image generated successfully"
                }
            
            # 检查是否有文件数据 (URL)
            if "fileData" in part:
                file_data = part["fileData"]
                return {
                    "success": True,
                    "image_data": None,
                    "image_url": file_data.get("fileUri"),
                    "mime_type": file_data.get("mimeType", "image/png"),
                    "message": "Image generated successfully"
                }
        
        # 如果只有文本响应（可能是拒绝生成）
        text_response = ""
        for part in parts:
            if "text" in part:
                text_response += part["text"]
        
        return {
            "success": False,
            "image_data": None,
            "image_url": None,
            "mime_type": None,
            "message": f"No image in response: {text_response[:200]}"
        }
        
    except Exception as e:
        return {
            "success": False,
            "image_data": None,
            "image_url": None,
            "mime_type": None,
            "message": f"Failed to parse response: {str(e)}"
        }


async def save_image(
    image_result: Dict[str, Any],
    output_path: str
) -> str:
    """
    保存生成的图片到本地文件
    
    Args:
        image_result: generate_image 的返回结果
        output_path: 输出文件路径
        
    Returns:
        保存的文件路径
    """
    import os
    
    # 确保输出目录存在
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    if image_result.get("image_data"):
        # 保存 base64 数据
        image_bytes = base64.b64decode(image_result["image_data"])
        with open(output_path, "wb") as f:
            f.write(image_bytes)
        print(f"[Painter] Image saved to: {output_path}")
        return output_path
        
    elif image_result.get("image_url"):
        # 下载 URL 图片
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(image_result["image_url"])
            response.raise_for_status()
            with open(output_path, "wb") as f:
                f.write(response.content)
        print(f"[Painter] Image downloaded to: {output_path}")
        return output_path
    
    raise PainterError("No image data to save")
