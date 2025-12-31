"""
智能对话 Agent
增强版 AI 助手,支持上下文理解、平台识别、智能指令等
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import httpx
import re
from ..config import config
from ..core.platform_specs import get_platform_list, get_spec

router = APIRouter(prefix="/api/smart-chat", tags=["Smart Agent"])


class SmartChatRequest(BaseModel):
    """智能聊天请求"""
    message: str
    history: List[Dict[str, Any]] = []
    context: Optional[Dict[str, Any]] = None  # 上下文信息（平台、产品等）


class SmartChatResponse(BaseModel):
    """智能聊天响应"""
    response: str
    action: Optional[str] = None
    suggestions: Optional[List[str]] = None  # AI 建议的下一步操作
    extracted_info: Optional[Dict[str, Any]] = None  # 提取的信息
    data: Optional[Dict[str, Any]] = None


def extract_platform_intent(message: str) -> Optional[str]:
    """从用户消息中提取平台意图"""
    message_lower = message.lower()

    platform_keywords = {
        "amazon": ["亚马逊", "amazon", "amz"],
        "shopee": ["shopee", "虾皮", "东南亚"],
        "tiktok": ["tiktok", "抖音", "tt"],
        "facebook": ["facebook", "fb", "脸书"],
        "instagram": ["instagram", "ins", "ig"],
        "lazada": ["lazada", "来赞达"],
        "aliexpress": ["aliexpress", "速卖通", "全球速卖通"]
    }

    for platform, keywords in platform_keywords.items():
        if any(keyword in message_lower for keyword in keywords):
            return platform

    return None


def extract_image_requirements(message: str) -> Dict[str, Any]:
    """从用户消息中提取图片需求"""
    requirements = {}

    # 提取尺寸要求
    size_patterns = [
        r'(\d+)\s*[xX×]\s*(\d+)',  # 1920x1080
        r'(\d+)\s*乘\s*(\d+)',       # 1920乘1080
    ]

    for pattern in size_patterns:
        match = re.search(pattern, message)
        if match:
            requirements['width'] = int(match.group(1))
            requirements['height'] = int(match.group(2))
            break

    # 提取宽高比
    ratio_patterns = [
        r'(\d+)\s*:\s*(\d+)\s*(比例|宽高比)',
        r'(方图|正方形)',
        r'(横图|横向)',
        r'(竖图|竖向|竖版)'
    ]

    for pattern in ratio_patterns:
        match = re.search(pattern, message)
        if match:
            text = match.group(0)
            if '方图' in text or '正方形' in text:
                requirements['aspect_ratio'] = '1:1'
            elif '横图' in text or '横向' in text:
                requirements['aspect_ratio'] = '16:9'
            elif '竖图' in text or '竖向' in text or '竖版' in text:
                requirements['aspect_ratio'] = '9:16'
            else:
                requirements['aspect_ratio'] = f"{match.group(1)}:{match.group(2)}"
            break

    # 提取风格要求
    style_keywords = {
        '简约': 'minimalist',
        '高端': 'luxury',
        '清新': 'fresh',
        '复古': 'vintage',
        '科技': 'tech',
        '温馨': 'warm',
        '冷淡': 'cool',
    }

    for keyword, style in style_keywords.items():
        if keyword in message:
            requirements['style'] = style
            break

    return requirements


@router.post("/", response_model=SmartChatResponse)
async def smart_chat(request: SmartChatRequest):
    """
    智能对话接口
    支持:
    - 平台识别
    - 需求提取
    - 上下文理解
    - 智能建议
    """

    try:
        # 提取用户意图
        platform = extract_platform_intent(request.message)
        image_requirements = extract_image_requirements(request.message)

        # 构建增强的系统提示词
        system_prompt = """你是 Xobi 智能图片生成助手。你的任务是:

1. **理解用户需求**: 识别用户想要生成什么样的图片
2. **平台适配**: 如果用户提到电商平台,推荐相应的规格
3. **提供建议**: 给出3个具体的视觉方案建议
4. **简洁回复**: 用中文,不超过100字

支持的平台: Amazon, Shopee, TikTok, Facebook, Instagram, Lazada, AliExpress

回复格式示例:
好的,为您准备{平台}主图方案:
[建议1: 简约白底,产品居中]
[建议2: 场景化背景,温馨家居]
[建议3: 科技感渐变,未来风格]
"""

        # 如果识别到平台,添加平台信息到提示词
        if platform:
            platforms_list = get_platform_list()
            if platform in platforms_list:
                spec = get_spec(platform, 'main')
                system_prompt += f"\n\n用户目标平台: {platform}\n推荐规格: {spec.width}x{spec.height} ({spec.aspect_ratio})"

        # 构建消息历史
        messages = [{"role": "system", "content": system_prompt}]
        for h in request.history[-8:]:
            role = "user" if h.get('role') == 'user' else "assistant"
            content = h.get('parts', [{}])[0].get('text', '') if 'parts' in h else h.get('content', '')
            if content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": request.message})

        # 调用 AI
        url = f"{config.get_base_url()}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {config.get_api_key('flash')}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": config.get_model('flash'),
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 400
        }

        ai_response = ""
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=headers, json=payload)

            if response.status_code == 200:
                ai_data = response.json()
                ai_response = ai_data["choices"][0]["message"]["content"].strip()
            else:
                ai_response = "抱歉,AI 暂时无法响应,请稍后重试。"

        # 生成智能建议
        suggestions = []
        if platform:
            suggestions.append(f"查看{platform}平台规格")
            suggestions.append(f"生成{platform}主图")

        # 提取的信息
        extracted_info = {
            "platform": platform,
            "image_requirements": image_requirements
        }

        # 判断是否需要触发行动
        action = None
        action_data = None

        # 如果用户说"开始生成"、"确定"等,触发生成
        trigger_keywords = ['开始生成', '立即生成', '确定生成', '生成图片', '开始制作']
        if any(keyword in request.message for keyword in trigger_keywords):
            action = "generate"
            action_data = {
                "platform": platform,
                "requirements": image_requirements
            }

        return SmartChatResponse(
            response=ai_response,
            action=action,
            suggestions=suggestions,
            extracted_info=extracted_info,
            data=action_data
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        return SmartChatResponse(
            response=f"抱歉,处理请求时出错: {str(e)}",
            action=None,
            suggestions=None,
            extracted_info=None,
            data=None
        )


@router.post("/expand-prompt")
async def expand_prompt(message: str, platform: Optional[str] = None):
    """
    Prompt 扩展接口
    将简单的用户需求扩展为详细的生成提示词
    """

    system_prompt = """你是专业的电商图片 Prompt 工程师。
将用户的简单描述扩展为详细的图片生成提示词。

要求:
1. 保持产品原貌
2. 详细描述场景、光线、构图
3. 专业商业摄影风格
4. 输出英文 prompt

示例输入: 白底简约风
示例输出: Professional product photography, clean white background, minimalist composition, soft studio lighting, product centered, high-end commercial style, 8K resolution
"""

    try:
        url = f"{config.get_base_url()}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {config.get_api_key('flash')}",
            "Content-Type": "application/json"
        }

        user_message = f"用户需求: {message}"
        if platform:
            spec = get_spec(platform, 'main')
            user_message += f"\n目标平台: {platform}, 规格: {spec.width}x{spec.height}"

        payload = {
            "model": config.get_model('flash'),
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            "temperature": 0.7,
            "max_tokens": 300
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=payload)

            if response.status_code == 200:
                ai_data = response.json()
                expanded_prompt = ai_data["choices"][0]["message"]["content"].strip()
                return {"success": True, "expanded_prompt": expanded_prompt}
            else:
                return {"success": False, "error": "AI 服务暂时不可用"}

    except Exception as e:
        return {"success": False, "error": str(e)}
