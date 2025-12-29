"""
Inspector Module - Gemini 3 Flash Vision for Quality Gate
负责视觉质检，确保生成图片符合电商标准
"""
import httpx
import base64
import os
from typing import Dict, Any, Optional
from enum import Enum
from ..config import config


class QualityStatus(Enum):
    PASS = "PASS"
    RETRY = "RETRY"
    REJECT = "REJECT"  # 多次重试后仍失败


# 质检 Prompt - 严格的电商选品标准
INSPECTOR_PROMPT = """你是一个严格的电商选品质检专家。请仔细检查这张产品图片:

检查项目 (请逐项判断 Yes/No):
1. 主体完整性: 产品是否完整显示,没有被裁切?
2. 形态正确性: 产品是否有变形、扭曲、多余部件?
3. 清晰度: 图片是否清晰,没有模糊、噪点?
4. 背景干净度: 背景是否干净简洁,没有杂物?
5. 文字检查: 图片中是否有乱码、错误文字? (注意: 无文字是OK的)
6. 构图合理性: 产品是否大致居中,占比合理?

评判标准:
- 如果所有项目都通过,返回 "PASS"
- 如果有1-2项轻微问题,返回 "RETRY" 并说明原因
- 如果有严重问题(变形/模糊/主体残缺),返回 "RETRY" 并说明原因

请用以下JSON格式回复:
{
    "status": "PASS 或 RETRY",
    "checks": {
        "主体完整": "Yes/No",
        "形态正确": "Yes/No", 
        "清晰度": "Yes/No",
        "背景干净": "Yes/No",
        "无乱码文字": "Yes/No",
        "构图合理": "Yes/No"
    },
    "reason": "如果是RETRY,说明具体原因"
}"""


async def inspect_image(
    image_path: Optional[str] = None,
    image_base64: Optional[str] = None,
    image_url: Optional[str] = None
) -> Dict[str, Any]:
    """
    使用 Gemini 3 Flash Vision 对生成的图片进行质检
    
    Args:
        image_path: 本地图片路径
        image_base64: Base64 编码的图片数据
        image_url: 图片 URL
        
    Returns:
        {
            "status": "PASS" | "RETRY" | "REJECT",
            "checks": {...},
            "reason": str,
            "raw_response": str
        }
    """
    # 准备图片数据
    image_part = await _prepare_image_part(image_path, image_base64, image_url)
    if not image_part:
        return {
            "status": QualityStatus.RETRY.value,
            "checks": {},
            "reason": "无法加载图片进行检查",
            "raw_response": ""
        }
    
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
                    image_part,
                    {"text": INSPECTOR_PROMPT}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,  # 低温度确保一致性判断
            "topP": 0.8,
            "maxOutputTokens": 500
        }
    }
    
    try:
        async with httpx.AsyncClient(timeout=config.REQUEST_TIMEOUT) as client:
            print("[Inspector] Analyzing image quality...")
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            
            result = response.json()
            return _parse_inspection_result(result)
            
    except Exception as e:
        print(f"[Inspector] Error: {e}")
        return {
            "status": QualityStatus.RETRY.value,
            "checks": {},
            "reason": f"质检服务调用失败: {str(e)}",
            "raw_response": ""
        }


async def _prepare_image_part(
    image_path: Optional[str],
    image_base64: Optional[str],
    image_url: Optional[str]
) -> Optional[Dict[str, Any]]:
    """准备 Gemini API 需要的图片数据格式"""
    
    if image_base64:
        return {
            "inlineData": {
                "mimeType": "image/png",
                "data": image_base64
            }
        }
    
    if image_path and os.path.exists(image_path):
        with open(image_path, "rb") as f:
            data = base64.b64encode(f.read()).decode("utf-8")
        
        # 根据扩展名判断 MIME 类型
        ext = os.path.splitext(image_path)[1].lower()
        mime_type = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp"
        }.get(ext, "image/png")
        
        return {
            "inlineData": {
                "mimeType": mime_type,
                "data": data
            }
        }
    
    if image_url:
        # 下载图片并转为 base64
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(image_url)
                response.raise_for_status()
                data = base64.b64encode(response.content).decode("utf-8")
                return {
                    "inlineData": {
                        "mimeType": "image/png",
                        "data": data
                    }
                }
        except Exception as e:
            print(f"[Inspector] Failed to download image: {e}")
            return None
    
    return None


def _parse_inspection_result(result: Dict[str, Any]) -> Dict[str, Any]:
    """解析 Gemini 质检响应"""
    import json
    import re
    
    default_result = {
        "status": QualityStatus.RETRY.value,
        "checks": {},
        "reason": "无法解析质检结果",
        "raw_response": ""
    }
    
    try:
        if "candidates" not in result or len(result["candidates"]) == 0:
            return default_result
        
        content = result["candidates"][0].get("content", {})
        parts = content.get("parts", [])
        
        if not parts:
            return default_result
        
        raw_text = parts[0].get("text", "")
        default_result["raw_response"] = raw_text
        
        # 尝试提取 JSON
        json_match = re.search(r'\{[\s\S]*\}', raw_text)
        if json_match:
            parsed = json.loads(json_match.group())
            
            status = parsed.get("status", "RETRY").upper()
            if status not in ["PASS", "RETRY", "REJECT"]:
                status = "RETRY"
            
            return {
                "status": status,
                "checks": parsed.get("checks", {}),
                "reason": parsed.get("reason", ""),
                "raw_response": raw_text
            }
        
        # 如果无法解析 JSON，尝试简单判断
        if "PASS" in raw_text.upper() and "RETRY" not in raw_text.upper():
            return {
                "status": QualityStatus.PASS.value,
                "checks": {},
                "reason": "",
                "raw_response": raw_text
            }
        
        return default_result
        
    except Exception as e:
        print(f"[Inspector] Parse error: {e}")
        default_result["reason"] = f"解析错误: {str(e)}"
        return default_result
