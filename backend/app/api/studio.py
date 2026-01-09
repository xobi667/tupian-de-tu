"""
Studio planning API.

This powers the Lovart-style guided flow:
- Ask key questions (handled in frontend)
- Generate a structured plan + 3 creative directions
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..config import config

router = APIRouter(prefix="/api/studio", tags=["Studio"])


class StudioPlanRequest(BaseModel):
    profile: Dict[str, Any] = Field(default_factory=dict)
    brief: Dict[str, Any] = Field(default_factory=dict)
    assets: Dict[str, Any] = Field(default_factory=dict)


def _extract_json(text: str) -> Dict[str, Any]:
    """Extract a JSON object from an LLM response."""
    s = (text or "").strip()
    if not s:
        raise ValueError("empty response")

    # Direct JSON object
    if s.startswith("{") and s.endswith("}"):
        try:
            obj = json.loads(s)
            if isinstance(obj, dict):
                return obj
        except Exception:
            pass

    # Prefer fenced JSON blocks (with or without ```json)
    m = re.search(r"```(?:json)?\\s*(\\{.*?\\})\\s*```", s, flags=re.DOTALL | re.IGNORECASE)
    if m:
        return json.loads(m.group(1))

    # Otherwise, attempt to parse the first JSON object found anywhere in the text.
    decoder = json.JSONDecoder()
    for idx, ch in enumerate(s):
        if ch != "{":
            continue
        try:
            obj, _end = decoder.raw_decode(s[idx:])
            if isinstance(obj, dict):
                return obj
        except Exception:
            continue

    raise ValueError("no json found")


def _fallback_plan(profile: Dict[str, Any], brief: Dict[str, Any], assets: Dict[str, Any]) -> Dict[str, Any]:
    aspect = str((brief or {}).get("aspect_ratio") or "1:1")
    goal = str((brief or {}).get("goal") or "").strip()
    output_type = str((brief or {}).get("output_type") or "main")
    default_preset = str((brief or {}).get("style_preset") or (profile or {}).get("default_style_preset") or "generic")

    presets = [default_preset, "amazon", "tiktok", "shein", "generic"]
    uniq: list[str] = []
    for p in presets:
        if p and p not in uniq:
            uniq.append(p)
    uniq = (uniq + ["generic", "amazon", "tiktok"])[:3]

    product_desc = str((assets or {}).get("product_description") or "").strip()
    ref_desc = str((assets or {}).get("reference_description") or "").strip()

    base_req_parts: list[str] = []
    if goal:
        base_req_parts.append(f"目标：{goal}")
    base_req_parts.append(f"产出类型：{output_type}")
    base_req_parts.append(f"画面比例：{aspect}")
    if product_desc:
        base_req_parts.append(f"产品描述：{product_desc}")
    if ref_desc:
        base_req_parts.append(f"参考风格：{ref_desc}")
    if (profile or {}).get("brand_style_keywords"):
        base_req_parts.append(f"品牌关键词：{profile.get('brand_style_keywords')}")
    if (profile or {}).get("forbidden"):
        base_req_parts.append(f"红线：{profile.get('forbidden')}")
    base_requirements = "\n".join([p for p in base_req_parts if p])

    directions = [
        {
            "id": "A",
            "title": "极简商业棚拍",
            "summary": "干净高级、主体突出、适合电商主图",
            "style_preset": uniq[0],
            "options": {"replace_background": True, "change_angle": False, "change_lighting": True, "add_scene_props": False},
            "requirements": (base_requirements + "\n" if base_requirements else "") + "风格：极简、干净留白、商业棚拍质感，主体居中突出。",
            "recommended_aspect_ratio": aspect,
            "recommended_text": {"enabled": False, "headline": "", "subheadline": ""},
        },
        {
            "id": "B",
            "title": "平台风格强化",
            "summary": "更像平台爆款的构图与质感，但保持真实",
            "style_preset": uniq[1],
            "options": {"replace_background": True, "change_angle": True, "change_lighting": True, "add_scene_props": True},
            "requirements": (base_requirements + "\n" if base_requirements else "") + "风格：平台爆款氛围；可适度道具与场景，但不喧宾夺主。",
            "recommended_aspect_ratio": aspect,
            "recommended_text": {"enabled": False, "headline": "", "subheadline": ""},
        },
        {
            "id": "C",
            "title": "氛围场景海报",
            "summary": "更强氛围光影与场景感，适合 banner/海报",
            "style_preset": uniq[2],
            "options": {"replace_background": True, "change_angle": True, "change_lighting": True, "add_scene_props": True},
            "requirements": (base_requirements + "\n" if base_requirements else "") + "风格：更强氛围与光影层次，画面更像海报/广告视觉。",
            "recommended_aspect_ratio": aspect,
            "recommended_text": {"enabled": False, "headline": "", "subheadline": ""},
        },
    ]

    return {
        "plan": [
            {"step": 1, "title": "分析素材", "detail": "理解你提供的图片与目标，明确产品与风格边界。"},
            {"step": 2, "title": "给出3个方向", "detail": "提供 A/B/C 三种视觉方向供你选择。"},
            {"step": 3, "title": "生成候选", "detail": "默认生成 4 张候选，方向不同、构图不同。"},
            {"step": 4, "title": "挑选+精修", "detail": "你选一张后，再按标注/对话进行精修迭代。"},
        ],
        "directions": directions,
        "recommended": {"candidate_count": 4},
    }


async def _call_chat(messages: list[dict], temperature: float, max_tokens: int) -> str:
    url = f"{config.get_base_url()}/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {config.get_api_key('flash')}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": config.get_model("flash"),
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"云雾API错误: HTTP {resp.status_code}")

    data = resp.json()
    return (data.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""


@router.post("/plan")
async def studio_plan(request: StudioPlanRequest):
    """
    Return a structured plan and 3 creative directions for the current generation.
    """
    system_prompt = """你是 Xobi Studio 的创意总监与流程规划师。

目标：在用户“品牌档案/项目偏好”和“本次需求”基础上，给出一个可执行的生成计划，并提供 3 个视觉方向。

强约束（必须遵守）：
1) 产品形态/结构不可大幅重构、不可变形；颜色要尽量准确（避免偏色）。
2) 允许轻微角度变化/轻微姿态调整，但要真实、物理合理。
3) 禁止生成额外的 Logo/水印/二维码；如用户不需要文字，禁止生成任何文字。
4) 输出必须严格为 JSON（只输出 JSON，不要解释、不要 Markdown）。

输出 JSON schema（必须包含这些字段）：
{
  "plan": [
    { "step": 1, "title": "分析素材", "detail": "..." },
    { "step": 2, "title": "给出3个方向", "detail": "..." },
    { "step": 3, "title": "生成候选", "detail": "默认4张候选，可根据需求调整" },
    { "step": 4, "title": "挑选+精修", "detail": "..." }
  ],
  "directions": [
    {
      "id": "A",
      "title": "方向名称（<=10字）",
      "summary": "一句话描述（<=40字）",
      "style_preset": "generic|shein|amazon|tiktok",
      "options": {
        "replace_background": true,
        "change_angle": false,
        "change_lighting": true,
        "add_scene_props": false
      },
      "requirements": "用于图片生成的中文要求（场景/构图/光影/排版/质感等）",
      "recommended_aspect_ratio": "1:1|16:9|9:16|3:4|4:3",
      "recommended_text": {
        "enabled": true,
        "headline": "主标题（可空）",
        "subheadline": "副标题（可空）"
      }
    }
  ],
  "recommended": {
    "candidate_count": 4
  }
}

规则：
- directions 必须恰好 3 个（A/B/C）。
- 若 brief 指明不需要文字，则 recommended_text.enabled 必须为 false 且 headline/subheadline 为空。
- requirements 要可直接用于电商主图/海报/banner 的“视觉指令”，不要输出技术提示词。"""

    user_payload = {
        "profile": request.profile or {},
        "brief": request.brief or {},
        "assets": request.assets or {},
    }

    try:
        content = await _call_chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            ],
            temperature=0.4,
            max_tokens=1200,
        )

        try:
            parsed = _extract_json(content)
        except Exception:
            repair_system = (
                "You are a strict JSON formatter. Return ONLY valid JSON (no markdown, no prose). "
                "If the previous output is not JSON, regenerate from the payload."
            )
            content2 = await _call_chat(
                messages=[
                    {"role": "system", "content": repair_system},
                    {
                        "role": "user",
                        "content": (
                            "Schema keys required: plan (array), directions (array length=3), recommended (object).\n"
                            "Return a single JSON object only.\n\n"
                            f"PAYLOAD:\n{json.dumps(user_payload, ensure_ascii=False)}\n\n"
                            f"BAD_RESPONSE:\n{content}\n"
                        ),
                    },
                ],
                temperature=0.0,
                max_tokens=1400,
            )
            try:
                parsed = _extract_json(content2)
            except Exception:
                parsed = _fallback_plan(request.profile or {}, request.brief or {}, request.assets or {})

        # Minimal sanity checks
        directions = parsed.get("directions") or []
        if not isinstance(directions, list) or len(directions) != 3:
            parsed = _fallback_plan(request.profile or {}, request.brief or {}, request.assets or {})

        return {"success": True, "data": parsed}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成计划失败: {type(e).__name__}: {str(e)}")
