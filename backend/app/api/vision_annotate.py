"""
智能视觉标注 API
使用 Gemini Flash 视觉模型分析图片并生成智能标注建议
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import httpx
import base64
from ..config import config

router = APIRouter(prefix="/api/vision", tags=["Vision Annotate"])


class VisionAnnotateRequest(BaseModel):
    """视觉标注请求"""
    image_base64: str  # Base64 编码的图片
    image_type: str = "reference"  # reference, product, result
    analysis_type: str = "annotation"  # annotation: 标注建议, description: 图片描述


class AnnotationSuggestion(BaseModel):
    """标注建议"""
    x: float  # X 坐标百分比 (0-100)
    y: float  # Y 坐标百分比 (0-100)
    text: str  # 标注描述
    category: str  # 类别: style, defect, improvement, highlight


class VisionAnnotateResponse(BaseModel):
    """视觉标注响应"""
    success: bool
    description: str  # 整体描述
    suggestions: List[AnnotationSuggestion] = []  # 标注建议
    analysis: Optional[Dict[str, Any]] = None  # 详细分析


@router.post("/analyze", response_model=VisionAnnotateResponse)
async def analyze_image(request: VisionAnnotateRequest):
    """
    分析图片并生成智能标注建议

    根据图片类型提供不同的分析：
    - reference: 分析风格元素、关键特征
    - product: 分析产品特点、可改进之处
    - result: 分析生成质量、需要修改的地方
    """

    try:
        # 构建针对不同图片类型的系统提示词
        prompts = {
            "reference": """你是专业的视觉分析师，分析这张参考图片。

任务：找出图片中最重要的 3-5 个视觉特征点。

关注重点：
1. 光线来源和氛围（例如：左上角自然光）
2. 主要配色方案（例如：整体暖色调）
3. 构图特点（例如：产品居中对称）
4. 背景风格（例如：简约白底）
5. 核心设计亮点（例如：金属质感）

要求：
- 只标注 3-5 个最关键的点
- 位置要准确（仔细观察坐标）
- 描述要简洁（5-10字）

以 JSON 格式输出：
{
  "description": "整体风格描述（30字内）",
  "suggestions": [
    {
      "x": 30.5,
      "y": 40.2,
      "text": "柔和顶部光源",
      "category": "highlight"
    }
  ]
}

严格限制：最多 5 个标注点！""",

            "product": """你是专业的产品摄影师，分析这张产品图片。

任务：找出 3-5 个最需要关注的点。

分析重点：
1. 产品位置和构图（是否居中、角度是否合适）
2. 光线问题（阴影、反光、曝光）
3. 背景瑕疵（杂物、污渍）
4. 产品细节（模糊、变形）
5. 可优化建议

要求：
- 只标注 3-5 个最关键问题或亮点
- 位置要精确
- 描述简洁实用（5-10字）

JSON 格式：
{
  "description": "产品整体评价（30字内）",
  "suggestions": [
    {
      "x": 50.0,
      "y": 30.0,
      "text": "产品略偏左",
      "category": "improvement"
    }
  ]
}

严格限制：最多 5 个标注点！""",

            "result": """你是电商图片质量检查专家，分析这张 AI 生成的图片。

任务：找出 3-5 个最需要修改的地方。

检查重点：
1. 融合问题（产品与背景是否自然）
2. 变形失真（产品形状、比例）
3. 模糊瑕疵（边缘、细节）
4. 光影不协调（阴影方向、光线一致性）
5. 颜色异常（色差、色调）

要求：
- 只标注 3-5 个最严重的问题
- 位置要准确
- 描述要具体可执行（8-15字）

JSON 格式：
{
  "description": "整体质量评价（30字内）",
  "suggestions": [
    {
      "x": 60.0,
      "y": 70.0,
      "text": "背景过渡不自然",
      "category": "defect"
    }
  ]
}

严格限制：最多 5 个标注点！"""
        }

        # 获取对应的系统提示词
        system_prompt = prompts.get(request.image_type, prompts["reference"])

        # 调用 Gemini Flash Vision API
        url = f"{config.get_base_url()}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {config.get_api_key('flash')}",
            "Content-Type": "application/json"
        }

        # 构建包含图片的消息
        payload = {
            "model": config.get_model('flash'),
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": system_prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{request.image_base64}"
                            }
                        }
                    ]
                }
            ],
            "temperature": 0.3,  # 降低随机性，保证分析准确性
            "max_tokens": 800
        }

        print(f"[Vision] 开始分析 {request.image_type} 图片...")

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=headers, json=payload)

            if response.status_code != 200:
                print(f"[Vision] API 错误: {response.status_code} - {response.text}")
                return VisionAnnotateResponse(
                    success=False,
                    description="视觉分析失败，请检查 API 配置",
                    suggestions=[]
                )

            ai_data = response.json()
            ai_response = ai_data["choices"][0]["message"]["content"].strip()

            print(f"[Vision] AI 响应: {ai_response[:200]}...")

            # 解析 AI 返回的 JSON
            import json
            import re

            # 提取 JSON 内容（可能包含在 ```json 代码块中）
            json_match = re.search(r'```json\s*(\{.*?\})\s*```', ai_response, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                # 尝试直接解析
                json_match = re.search(r'\{.*\}', ai_response, re.DOTALL)
                json_str = json_match.group(0) if json_match else ai_response

            try:
                parsed = json.loads(json_str)

                # 转换为响应格式
                suggestions = []
                for s in parsed.get("suggestions", []):
                    suggestions.append(AnnotationSuggestion(
                        x=float(s.get("x", 50)),
                        y=float(s.get("y", 50)),
                        text=s.get("text", ""),
                        category=s.get("category", "highlight")
                    ))

                # 硬限制：最多 5 个标注点
                if len(suggestions) > 5:
                    print(f"[Vision] 警告: AI 返回了 {len(suggestions)} 个标注点，截取前 5 个")
                    suggestions = suggestions[:5]

                return VisionAnnotateResponse(
                    success=True,
                    description=parsed.get("description", "分析完成"),
                    suggestions=suggestions,
                    analysis={"raw_response": ai_response}
                )

            except json.JSONDecodeError as e:
                print(f"[Vision] JSON 解析失败: {e}")
                # 返回文本描述作为后备
                return VisionAnnotateResponse(
                    success=True,
                    description=ai_response[:100],
                    suggestions=[],
                    analysis={"raw_response": ai_response, "parse_error": str(e)}
                )

    except Exception as e:
        import traceback
        traceback.print_exc()
        return VisionAnnotateResponse(
            success=False,
            description=f"分析失败: {str(e)}",
            suggestions=[]
        )


@router.post("/describe")
async def describe_image(image_base64: str, context: str = ""):
    """
    简单的图片描述接口
    返回图片的文字描述
    """

    try:
        url = f"{config.get_base_url()}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {config.get_api_key('flash')}",
            "Content-Type": "application/json"
        }

        user_prompt = "请用中文简洁描述这张图片的内容和视觉特征（不超过50字）。"
        if context:
            user_prompt += f"\n\n上下文: {context}"

        payload = {
            "model": config.get_model('flash'),
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}
                        }
                    ]
                }
            ],
            "temperature": 0.5,
            "max_tokens": 200
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=payload)

            if response.status_code == 200:
                ai_data = response.json()
                description = ai_data["choices"][0]["message"]["content"].strip()
                return {"success": True, "description": description}
            else:
                return {"success": False, "error": "API 调用失败"}

    except Exception as e:
        return {"success": False, "error": str(e)}
