"""
Title rewrite API.
Used by the batch factory page to rewrite product titles via Yunwu chat-completions.
"""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..config import config

router = APIRouter(tags=["Title Rewrite"])
logger = logging.getLogger(__name__)


class TitleRewriteRequest(BaseModel):
    original_title: str = Field(..., min_length=1)
    language: str = "zh"  # zh, th, en
    style: str = "simple"  # simple, catchy, localized, shein, amazon
    requirements: str = ""
    max_length: int = 100


def _build_prompt(req: TitleRewriteRequest) -> str:
    lang_map = {"zh": "中文", "th": "泰语", "en": "英语"}
    style_map = {
        "simple": "简洁清晰，直接表达产品核心卖点",
        "catchy": "吸引眼球，营销感强，突出关键词，但不要堆砌符号",
        "localized": "符合目标市场表达习惯，更地道本地化",
        "shein": "SHEIN风格：年轻潮流、快时尚、简洁有力、偏社媒氛围",
        "amazon": "Amazon风格：结构清晰、搜索友好、包含关键规格/材质/场景词，避免过度营销词",
    }

    target_lang = lang_map.get((req.language or "").strip(), "中文")
    target_style = style_map.get((req.style or "").strip(), style_map["simple"])
    max_length = int(req.max_length or 100)

    extra_req = (req.requirements or "").strip()
    extra_line = f"5. 额外要求：{extra_req}\n" if extra_req else ""

    # NOTE: Keep prompt deterministic: ask for only the rewritten title.
    return f"""请将以下电商商品标题改写为{target_lang}。
要求：
1. 风格：{target_style}
2. 保持产品不变（不改品类/不编造参数）
3. 语义清晰、可读性强，避免夸张词与虚假承诺
4. 长度不超过{max_length}字
{extra_line}6. 直接返回改写后的标题，不要任何解释、引号或多余文字

原标题：{req.original_title}

改写后的标题："""


@router.post("/api/title/rewrite")
async def rewrite_title(request: TitleRewriteRequest, raw: Request):
    try:
        api_key = (
            raw.headers.get("X-API-Key")
            or raw.headers.get("X-Yunwu-Api-Key")
            or config.get_api_key("flash")
        )
        if not api_key:
            raise HTTPException(status_code=400, detail="缺少 API Key")

        prompt = _build_prompt(request)

        url = f"{config.get_base_url()}/v1/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {
            "model": config.get_model("flash"),
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7,
            "max_tokens": 200,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=payload)

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code, detail=f"API 调用失败: {response.text}"
            )

        result = response.json()
        new_title = (result.get("choices") or [{}])[0].get("message", {}).get("content", "")
        new_title = str(new_title or "").strip()
        new_title = new_title.strip("\"'“”‘’《》「」『』【】")

        if request.max_length and len(new_title) > request.max_length:
            new_title = new_title[: request.max_length] + "..."

        return {
            "success": True,
            "new_title": new_title,
            "usage": result.get("usage", {}),
            "model": payload["model"],
            "message": "标题改写成功",
        }

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="API 请求超时")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[TitleRewrite] Failed: %s", e)
        raise HTTPException(status_code=500, detail=f"标题改写失败: {e}")

