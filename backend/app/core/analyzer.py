"""
Analyzer Module - 使用 Gemini Vision 分析图片
分析参考主图和产品图，提取构图、风格、产品信息
"""
import httpx
import base64
import json
import os
import re
from typing import Dict, Any, Optional
from ..config import config


async def analyze_reference_image(image_path: str) -> Dict[str, Any]:
    """分析参考主图，提取构图、风格、场景信息"""
    abs_path = os.path.abspath(image_path)
    print(f"DEBUG: Analyzer checking reference path: {abs_path}")
    
    prompt = """请分析这张电商主图，提取以下信息并以JSON格式返回:

{
    "layout": {
        "product_position": "center/left/right/bottom",
        "product_size_ratio": 0.0-1.0,
        "composition": "居中构图/左右构图/上下构图"
    },
    "style": {
        "background_type": "纯色/渐变/实景/合成场景",
        "main_colors": ["主色调描述"],
        "lighting": "柔光/硬光/自然光/舞台光",
        "overall_mood": "简约/活力/高端/温馨"
    },
    "scene_elements": ["列出画面中的装饰元素和道具"],
    "text_areas": [
        {
            "position": "位置描述",
            "content": "文字内容",
            "style": "字体风格描述"
        }
    ],
    "original_product": "识别出的原产品名称",
    "original_product_category": "产品类别"
}

只返回JSON，不要其他解释。"""

    return await _analyze_image_with_gemini(abs_path, prompt)


async def analyze_product_image(image_path: str) -> Dict[str, Any]:
    """分析产品图，识别产品信息和特征"""
    abs_path = os.path.abspath(image_path)
    print(f"DEBUG: Analyzer checking product path: {abs_path}")
    
    prompt = """请分析这张产品图，提取以下信息并以JSON格式返回:

{
    "product_type": "具体产品名称",
    "category": "产品大类",
    "features": ["产品外观特征", "形状", "材质"],
    "main_colors": ["产品主要颜色"],
    "style_keywords": ["复古", "现代", "简约等风格关键词"],
    "suggested_scenes": ["适合这个产品的场景建议"],
    "suggested_copy": ["适合这个产品的营销文案建议"]
}

只返回JSON，不要其他解释。"""

    return await _analyze_image_with_gemini(abs_path, prompt)


async def generate_replacement_prompt(
    reference_analysis: Dict[str, Any],
    product_analysis: Dict[str, Any],
    custom_text: Optional[str] = None
) -> str:
    """
    根据分析结果生成用于图片生成的 Prompt
    
    Args:
        reference_analysis: 参考图分析结果
        product_analysis: 产品图分析结果
        custom_text: 用户自定义文案（可选）
        
    Returns:
        生成图片用的 Prompt
    """
    layout = reference_analysis.get("layout", {})
    style = reference_analysis.get("style", {})
    product = product_analysis.get("product_type", "产品")
    category = product_analysis.get("category", "商品")
    features = product_analysis.get("features", [])
    suggested_scenes = product_analysis.get("suggested_scenes", [])
    
    # 构建 Prompt
    prompt = f"""Create a professional e-commerce product image:

COMPOSITION (follow this layout):
- Product position: {layout.get('product_position', 'center')}
- Product should take up approximately {layout.get('product_size_ratio', 0.5)*100:.0f}% of the frame
- Layout style: {layout.get('composition', '居中构图')}

PRODUCT (this is the main subject):
- Product type: {product} ({category})
- Product features: {', '.join(features[:3]) if features else 'modern design'}
- The product should be the clear focus of the image

SCENE & STYLE:
- Background style: {style.get('background_type', 'clean gradient')}
- Color palette: {', '.join(style.get('main_colors', ['warm tones']))}
- Lighting: {style.get('lighting', 'soft studio lighting')}
- Overall mood: {style.get('overall_mood', 'professional')}
- Scene elements that suit a {category}: {', '.join(suggested_scenes[:2]) if suggested_scenes else 'minimal decoration'}

TEXT/COPY PLACEMENT:
"""
    
    # 添加文案信息
    if custom_text:
        prompt += f"- Include text: \"{custom_text}\" in a prominent position\n"
    else:
        text_areas = reference_analysis.get("text_areas", [])
        if text_areas:
            prompt += f"- Keep text placement similar to reference: {text_areas[0].get('position', 'top')}\n"
            suggested_copy = product_analysis.get("suggested_copy", [])
            if suggested_copy:
                prompt += f"- Suggested copy style: {suggested_copy[0]}\n"
    
    prompt += """
IMPORTANT REQUIREMENTS:
- Professional e-commerce quality, 4K resolution
- Clean, high-contrast product photography style
- The product must be clearly visible and the hero of the image
- No distortion or unusual proportions
- NO watermarks, NO extra limbs or deformations
"""
    
    return prompt


async def _analyze_image_with_gemini(image_path: str, prompt: str) -> Dict[str, Any]:
    """
    调用 Gemini Vision API 分析图片
    """
    # 读取图片并转为 base64
    abs_path = os.path.abspath(image_path)
    print(f"[Analyzer] 尝试读取图片: {abs_path}")
    
    if not os.path.exists(abs_path):
        print(f"[Analyzer] !!! 图片不存在: {abs_path}")
        return {"error": f"图片不存在: {abs_path}"}
    
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")
    
    # 根据扩展名判断 MIME 类型
    ext = os.path.splitext(image_path)[1].lower()
    mime_type = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp"
    }.get(ext, "image/png")
    
    url = f"{config.YUNWU_BASE_URL}/v1beta/models/{config.GEMINI_FLASH_MODEL}:generateContent"
    
    headers = {
        "Authorization": f"Bearer {config.GEMINI_FLASH_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": image_data
                        }
                    },
                    {"text": prompt}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "topP": 0.8,
            "maxOutputTokens": 2000
        }
    }
    
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            print(f"[Analyzer] 分析图片: {os.path.basename(image_path)}")
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            
            result = response.json()
            
            if "candidates" in result and len(result["candidates"]) > 0:
                content = result["candidates"][0].get("content", {})
                parts = content.get("parts", [])
                
                # 遍历所有 parts，跳过 thought 部分，找到实际内容
                for part in parts:
                    # 跳过 thought 部分
                    if part.get("thought"):
                        continue
                    
                    text = part.get("text", "")
                    if not text:
                        continue
                    
                    # 提取 JSON
                    json_match = re.search(r'\{[\s\S]*\}', text)
                    if json_match:
                        try:
                            parsed = json.loads(json_match.group())
                            print(f"[Analyzer] 分析完成: {list(parsed.keys())}")
                            return parsed
                        except json.JSONDecodeError:
                            continue
            
            return {"error": "无法解析分析结果", "raw": str(result)[:500]}
            
    except Exception as e:
        import traceback
        print(f"[Analyzer] 分析失败: {e}")
        traceback.print_exc()
        return {"error": str(e)}
