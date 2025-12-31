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
    # 使用 OpenAI 兼容格式的图片生成接口
    url = f"{config.get_base_url()}/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {config.get_api_key('image')}",
        "Content-Type": "application/json"
    }

    # 构建生成请求
    full_prompt = f"Generate a professional e-commerce product image:\n\n{prompt}"
    if negative_prompt:
        full_prompt += f"\n\nNegative constraints: {negative_prompt}"

    payload = {
        "model": config.get_model('image'),
        "max_tokens": 4096,
        "messages": [{
            "role": "user",
            "content": full_prompt
        }],
        "temperature": 0.8
    }
    
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
    解析 OpenAI 兼容格式的图片生成响应

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
        # OpenAI 兼容格式: choices[0].message.content
        if "choices" not in result or len(result["choices"]) == 0:
            return {
                "success": False,
                "image_data": None,
                "image_url": None,
                "mime_type": None,
                "message": "No choices in response"
            }

        content = result["choices"][0]["message"]["content"]

        # 检查 content 是否是 Markdown 图片格式: ![image](data:image/...)
        import re
        markdown_match = re.match(r'!\[.*?\]\((data:image/[^)]+)\)', content)
        if markdown_match:
            # 提取 data URI
            data_uri = markdown_match.group(1)
            parts = data_uri.split(",", 1)
            if len(parts) == 2:
                mime_part = parts[0].split(";")[0].replace("data:", "")
                base64_data = parts[1]
                return {
                    "success": True,
                    "image_data": base64_data,
                    "image_url": None,
                    "mime_type": mime_part,
                    "message": "Image generated successfully (markdown base64)"
                }

        # 检查 content 是否是 URL (以 http 开头)
        if isinstance(content, str) and content.startswith("http"):
            return {
                "success": True,
                "image_data": None,
                "image_url": content,
                "mime_type": "image/png",
                "message": "Image generated successfully (URL)"
            }

        # 检查 content 是否是 base64 数据 (data URI 格式)
        if isinstance(content, str) and content.startswith("data:image"):
            # 解析 data URI: data:image/png;base64,iVBORw0KG...
            parts = content.split(",", 1)
            if len(parts) == 2:
                mime_part = parts[0].split(";")[0].replace("data:", "")
                base64_data = parts[1]
                return {
                    "success": True,
                    "image_data": base64_data,
                    "image_url": None,
                    "mime_type": mime_part,
                    "message": "Image generated successfully (base64)"
                }

        # 如果 content 是纯文本 (可能是生成失败或需要进一步处理)
        return {
            "success": False,
            "image_data": None,
            "image_url": None,
            "mime_type": None,
            "message": f"Unexpected response format: {str(content)[:200]}"
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
