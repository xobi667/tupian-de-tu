"""
Replacer Module - 使用 Gemini Image 生成替换后的主图
结合参考图风格和产品图，生成新的电商主图
"""
import httpx
import base64
import os
import time
from typing import Dict, Any, Optional
from ..config import config


class ReplacerError(Exception):
    """图片替换生成错误"""
    pass


async def generate_replacement_image(
    product_image_path: str,
    reference_image_path: str,
    generation_prompt: str,
    custom_text: Optional[str] = None,
    output_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    生成替换后的电商主图
    
    使用 Gemini Image 的多图参考能力：
    - 参考图提供构图风格
    - 产品图提供产品外观
    - Prompt 指导生成
    
    Args:
        product_image_path: 产品图路径
        reference_image_path: 参考主图路径
        generation_prompt: 生成用的 Prompt
        custom_text: 自定义文案
        output_path: 输出路径（可选）
        
    Returns:
        {
            "success": bool,
            "image_path": str,
            "image_data": base64 str,
            "message": str
        }
    """
    # 读取两张图片
    product_image = await _load_image(product_image_path)
    reference_image = await _load_image(reference_image_path)
    
    if not product_image or not reference_image:
        return {
            "success": False,
            "image_path": None,
            "image_data": None,
            "message": "无法加载图片"
        }
    
    # 构建请求
    url = f"{config.YUNWU_BASE_URL}/v1beta/models/{config.GEMINI_IMAGE_MODEL}:generateContent"
    
    headers = {
        "Authorization": f"Bearer {config.GEMINI_IMAGE_API_KEY}",
        "Content-Type": "application/json"
    }
    
    # 多图 + 文本的 Prompt 结构
    full_prompt = f"""You are an expert e-commerce image designer. Create a new product image by:

1. REFERENCE IMAGE (first image): Use this for composition, layout, and style reference
2. PRODUCT IMAGE (second image): This is the actual product to feature in the new image

TASK: Generate a new e-commerce main image that:
- Uses the composition and layout style from the REFERENCE IMAGE
- Features the PRODUCT from the PRODUCT IMAGE as the main subject
- Adapts the scene and decorative elements to suit the product category
- Maintains professional e-commerce photography quality

{generation_prompt}
"""
    
    if custom_text:
        full_prompt += f"\n\nINCLUDE THIS TEXT in the image: \"{custom_text}\""
    
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": "Reference image for composition and style:"
                    },
                    {
                        "inlineData": {
                            "mimeType": reference_image["mime_type"],
                            "data": reference_image["data"]
                        }
                    },
                    {
                        "text": "Product image (use this product as the main subject):"
                    },
                    {
                        "inlineData": {
                            "mimeType": product_image["mime_type"],
                            "data": product_image["data"]
                        }
                    },
                    {
                        "text": full_prompt
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.8,
            "topP": 0.95,
            "responseModalities": ["image", "text"]
        }
    }
    
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            print("[Replacer] 正在生成新主图...")
            response = await client.post(url, headers=headers, json=payload)
            
            if response.status_code != 200:
                error_text = response.text[:500]
                print(f"[Replacer] API 错误: {response.status_code} - {error_text}")
                return {
                    "success": False,
                    "image_path": None,
                    "image_data": None,
                    "message": f"API 错误: {response.status_code}"
                }
            
            result = response.json()
            return await _parse_and_save_result(result, output_path)
            
    except httpx.TimeoutException:
        return {
            "success": False,
            "image_path": None,
            "image_data": None,
            "message": "生成超时，请重试"
        }
    except Exception as e:
        print(f"[Replacer] 错误: {e}")
        return {
            "success": False,
            "image_path": None,
            "image_data": None,
            "message": str(e)
        }


async def _load_image(image_path: str) -> Optional[Dict[str, str]]:
    """加载图片并转为 base64"""
    if not os.path.exists(image_path):
        print(f"[Replacer] 图片不存在: {image_path}")
        return None
    
    with open(image_path, "rb") as f:
        data = base64.b64encode(f.read()).decode("utf-8")
    
    ext = os.path.splitext(image_path)[1].lower()
    mime_type = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp"
    }.get(ext, "image/png")
    
    return {
        "data": data,
        "mime_type": mime_type
    }


async def _parse_and_save_result(result: Dict[str, Any], output_path: Optional[str]) -> Dict[str, Any]:
    """解析 API 响应并保存图片"""
    try:
        if "candidates" not in result or len(result["candidates"]) == 0:
            return {
                "success": False,
                "image_path": None,
                "image_data": None,
                "message": "API 返回无结果"
            }
        
        candidate = result["candidates"][0]
        content = candidate.get("content", {})
        parts = content.get("parts", [])
        
        for part in parts:
            if "inlineData" in part:
                inline_data = part["inlineData"]
                image_data = inline_data.get("data")
                mime_type = inline_data.get("mimeType", "image/png")
                
                # 保存图片
                if output_path:
                    os.makedirs(os.path.dirname(output_path), exist_ok=True)
                    image_bytes = base64.b64decode(image_data)
                    with open(output_path, "wb") as f:
                        f.write(image_bytes)
                    print(f"[Replacer] 图片已保存: {output_path}")
                
                return {
                    "success": True,
                    "image_path": output_path,
                    "image_data": image_data,
                    "mime_type": mime_type,
                    "message": "生成成功"
                }
        
        # 检查是否有文本响应（可能是拒绝信息）
        text_response = ""
        for part in parts:
            if "text" in part:
                text_response = part["text"]
        
        return {
            "success": False,
            "image_path": None,
            "image_data": None,
            "message": f"未生成图片: {text_response[:200]}"
        }
        
    except Exception as e:
        return {
            "success": False,
            "image_path": None,
            "image_data": None,
            "message": f"解析结果失败: {str(e)}"
        }


async def quick_replace(
    product_image_path: str,
    reference_image_path: str,
    product_name: str,
    custom_text: Optional[str] = None,
    output_dir: Optional[str] = None
) -> Dict[str, Any]:
    """
    快速替换 - 一步完成分析和生成
    
    Args:
        product_image_path: 产品图路径
        reference_image_path: 参考主图路径
        product_name: 产品名称
        custom_text: 自定义文案
        output_dir: 输出目录
        
    Returns:
        生成结果
    """
    from .analyzer import analyze_reference_image, analyze_product_image, generate_replacement_prompt
    
    print(f"[QuickReplace] 开始处理: {product_name}")
    
    # Step 1: 分析参考图
    print("[QuickReplace] Step 1: 分析参考图...")
    ref_analysis = await analyze_reference_image(reference_image_path)
    if "error" in ref_analysis:
        return {"success": False, "message": f"参考图分析失败: {ref_analysis['error']}"}
    
    # Step 2: 分析产品图
    print("[QuickReplace] Step 2: 分析产品图...")
    product_analysis = await analyze_product_image(product_image_path)
    if "error" in product_analysis:
        return {"success": False, "message": f"产品图分析失败: {product_analysis['error']}"}
    
    # Step 3: 生成 Prompt
    print("[QuickReplace] Step 3: 生成 Prompt...")
    generation_prompt = await generate_replacement_prompt(ref_analysis, product_analysis, custom_text)
    
    # Step 4: 生成新图
    print("[QuickReplace] Step 4: 生成新主图...")
    
    # 确定输出路径
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        timestamp = int(time.time())
        output_path = os.path.join(output_dir, f"replaced_{product_name}_{timestamp}.png")
    else:
        output_path = None
    
    result = await generate_replacement_image(
        product_image_path=product_image_path,
        reference_image_path=reference_image_path,
        generation_prompt=generation_prompt,
        custom_text=custom_text,
        output_path=output_path
    )
    
    # 添加分析结果到返回值
    result["reference_analysis"] = ref_analysis
    result["product_analysis"] = product_analysis
    result["generation_prompt"] = generation_prompt
    
    return result
