"""
Director Module - Gemini 3 Flash for Prompt Compilation & Style Lock
负责理解业务、拆解 Prompt、注入风格约束
"""
import httpx
import json
from typing import Dict, Any, Optional
from ..config import config


# Jinja2 风格模板 - 电商主图专用
STYLE_TEMPLATE = """
(Style Block - LOCKED):
Professional e-commerce product photography, studio lighting, 4k resolution, 
minimalist composition, clean solid color background, product centered in frame.
NO text, NO watermark, NO blurry edges, NO distorted geometry, NO extra objects.

(Subject Block - Dynamic):
Subject: {product_name}
Color Scheme: {color}
Key Selling Point: {selling_point} - make this feature visually prominent
Product Category: {category}

(Composition Block - FIXED):
View: Front view, slightly elevated angle, product fills 60-70% of frame
Lighting: Professional softbox lighting from top-left, subtle gradient shadow
Background: Clean, minimalist, single solid color that complements the product
"""

# 负面提示词 - 强制排除
NEGATIVE_PROMPT = """
text, words, letters, numbers, watermark, logo, signature, 
blurry, distorted, deformed, extra limbs, missing parts, 
low quality, pixelated, noise, grain, artifacts, 
busy background, cluttered, multiple products, human hands holding product
"""


async def compile_prompt(sku_data: Dict[str, Any]) -> Dict[str, str]:
    """
    将 Excel 行数据编译为结构化 Prompt
    
    Args:
        sku_data: 包含 product_name, selling_point, color, category 的字典
        
    Returns:
        包含 prompt 和 negative_prompt 的字典
    """
    # 填充模板
    prompt = STYLE_TEMPLATE.format(
        product_name=sku_data.get("product_name", "Product"),
        color=sku_data.get("color", "Natural"),
        selling_point=sku_data.get("selling_point", "High Quality"),
        category=sku_data.get("category", "General")
    )
    
    return {
        "prompt": prompt.strip(),
        "negative_prompt": NEGATIVE_PROMPT.strip()
    }


async def enhance_prompt_with_gemini(sku_data: Dict[str, Any]) -> Dict[str, str]:
    """
    使用 Gemini 3 Flash 智能增强 Prompt
    将结构化数据转换为更专业的电商图片描述
    
    Args:
        sku_data: SKU 数据字典
        
    Returns:
        增强后的 prompt 和 negative_prompt
    """
    system_instruction = """你是一个专业的电商视觉设计师,擅长将产品信息转化为AI绘图的专业Prompt。

要求:
1. 输出必须是英文
2. 强调专业产品摄影风格
3. 构图要求: 产品居中, 干净背景, 专业打光
4. 必须禁止任何文字生成
5. 突出产品的核心卖点特征

请直接输出最终的Prompt,不要解释。"""

    user_message = f"""请为以下产品生成电商主图的AI绘图Prompt:

产品名称: {sku_data.get('product_name', '产品')}
产品颜色: {sku_data.get('color', '默认')}
核心卖点: {sku_data.get('selling_point', '高品质')}
产品类别: {sku_data.get('category', '通用')}"""

    url = f"{config.YUNWU_BASE_URL}/v1beta/models/{config.GEMINI_FLASH_MODEL}:generateContent"
    
    headers = {
        "Authorization": f"Bearer {config.GEMINI_FLASH_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "systemInstruction": {
            "parts": [{"text": system_instruction}]
        },
        "contents": [
            {
                "role": "user",
                "parts": [{"text": user_message}]
            }
        ],
        "generationConfig": {
            "temperature": 0.7,
            "topP": 0.9,
            "maxOutputTokens": 500
        }
    }
    
    try:
        async with httpx.AsyncClient(timeout=config.REQUEST_TIMEOUT) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            
            result = response.json()
            
            # 解析 Gemini 响应
            if "candidates" in result and len(result["candidates"]) > 0:
                content = result["candidates"][0].get("content", {})
                parts = content.get("parts", [])
                if parts:
                    enhanced_prompt = parts[0].get("text", "")
                    return {
                        "prompt": enhanced_prompt.strip(),
                        "negative_prompt": NEGATIVE_PROMPT.strip()
                    }
            
            # 如果 Gemini 调用失败,回退到模板
            print(f"[Director] Gemini enhancement failed, using template. Response: {result}")
            return await compile_prompt(sku_data)
            
    except Exception as e:
        print(f"[Director] Error calling Gemini: {e}")
        # 回退到模板编译
        return await compile_prompt(sku_data)


async def validate_sku_data(sku_data: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    校验 SKU 数据完整性
    
    Returns:
        (is_valid, error_message)
    """
    required_fields = ["product_name"]
    
    for field in required_fields:
        if not sku_data.get(field):
            return False, f"Missing required field: {field}"
    
    return True, None
