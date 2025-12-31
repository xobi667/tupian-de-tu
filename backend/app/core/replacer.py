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
    
    # 使用 OpenAI 兼容格式构建请求
    url = f"{config.get_base_url()}/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {config.get_api_key('image')}",
        "Content-Type": "application/json"
    }

    # 构建完整提示词
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

    # OpenAI 兼容格式的 multimodal content
    content = [
        {"type": "text", "text": "Reference image for composition and style:"},
        {
            "type": "image_url",
            "image_url": {
                "url": f"data:{reference_image['mime_type']};base64,{reference_image['data']}"
            }
        },
        {"type": "text", "text": "Product image (use this product as the main subject):"},
        {
            "type": "image_url",
            "image_url": {
                "url": f"data:{product_image['mime_type']};base64,{product_image['data']}"
            }
        },
        {"type": "text", "text": full_prompt}
    ]

    payload = {
        "model": config.get_model('image'),
        "max_tokens": 4096,
        "messages": [{
            "role": "user",
            "content": content
        }],
        "temperature": 0.8
    }
    
    try:
        import time
        start_time = time.time()

        # 增加超时时间到 5 分钟（图片生成需要更长时间）
        async with httpx.AsyncClient(timeout=300) as client:
            print(f"[Replacer] 正在生成新主图... (模型: {config.get_model('image')})")
            print(f"[Replacer] API URL: {url}")
            print(f"[Replacer] 请求开始时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")

            response = await client.post(url, headers=headers, json=payload)

            elapsed_time = time.time() - start_time
            print(f"[Replacer] API 响应时间: {elapsed_time:.2f}秒")
            print(f"[Replacer] 响应状态码: {response.status_code}")

            if response.status_code != 200:
                error_text = response.text[:500]
                print(f"[Replacer] API 错误详情: {error_text}")
                return {
                    "success": False,
                    "image_path": None,
                    "image_data": None,
                    "message": f"API 错误 {response.status_code}: {error_text}"
                }

            print("[Replacer] 解析响应中...")
            result = response.json()
            print(f"[Replacer] 响应包含 keys: {list(result.keys())}")

            parse_result = await _parse_and_save_result(result, output_path)
            print(f"[Replacer] 解析结果: success={parse_result.get('success')}, message={parse_result.get('message')}")
            return parse_result

    except httpx.TimeoutException as e:
        elapsed_time = time.time() - start_time
        print(f"[Replacer] 请求超时！耗时: {elapsed_time:.2f}秒")
        return {
            "success": False,
            "image_path": None,
            "image_data": None,
            "message": f"生成超时（{elapsed_time:.0f}秒），请重试或联系管理员"
        }
    except Exception as e:
        import traceback
        print(f"[Replacer] 错误类型: {type(e).__name__}")
        print(f"[Replacer] 错误信息: {str(e)}")
        print(f"[Replacer] 错误堆栈:\n{traceback.format_exc()}")
        return {
            "success": False,
            "image_path": None,
            "image_data": None,
            "message": f"{type(e).__name__}: {str(e)}"
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
    """解析 OpenAI 兼容格式的 API 响应并保存图片"""
    try:
        # OpenAI 兼容格式: choices[0].message.content
        if "choices" not in result or len(result["choices"]) == 0:
            return {
                "success": False,
                "image_path": None,
                "image_data": None,
                "message": "API 返回无结果"
            }

        content = result["choices"][0]["message"]["content"]

        # 处理 Markdown 图片格式: ![image](data:image/...)
        import re
        markdown_match = re.match(r'!\[.*?\]\((data:image/[^)]+)\)', content)
        if markdown_match:
            # 提取 data URI
            data_uri = markdown_match.group(1)
            parts = data_uri.split(",", 1)
            if len(parts) == 2:
                mime_part = parts[0].split(";")[0].replace("data:", "")
                image_data = parts[1]

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
                    "mime_type": mime_part,
                    "message": "生成成功 (markdown base64)"
                }

        # 处理 base64 data URI 格式: data:image/png;base64,iVBORw0KG...
        if isinstance(content, str) and content.startswith("data:image"):
            parts = content.split(",", 1)
            if len(parts) == 2:
                mime_part = parts[0].split(";")[0].replace("data:", "")
                image_data = parts[1]

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
                    "mime_type": mime_part,
                    "message": "生成成功"
                }

        # 处理 URL 格式
        if isinstance(content, str) and content.startswith("http"):
            # 如果返回的是 URL，需要下载图片
            print(f"[Replacer] 图片 URL: {content}")
            return {
                "success": True,
                "image_path": None,
                "image_data": None,
                "image_url": content,
                "message": "生成成功 (URL 格式)"
            }

        # 如果是纯文本（可能是拒绝生成）
        return {
            "success": False,
            "image_path": None,
            "image_data": None,
            "message": f"未生成图片: {str(content)[:200]}"
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
