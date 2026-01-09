"""
标题仿写 API
使用云雾 API 改写电商商品标题
支持多语言、多风格
"""
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
import httpx
from typing import Optional
import logging

from ..config import config

router = APIRouter(tags=["标题仿写"])
logger = logging.getLogger(__name__)


class TitleRewriteRequest(BaseModel):
    """单个标题仿写请求"""
    original_title: str
    language: str = "zh"  # zh, th, en
    style: str = "simple"  # simple, catchy, localized
    max_length: int = 100


class BatchTitleRewriteRequest(BaseModel):
    """批量标题仿写请求"""
    titles: list[str]
    language: str = "zh"
    style: str = "simple"
    max_length: int = 100


@router.post("/api/title/rewrite")
async def rewrite_title(request: TitleRewriteRequest, raw: Request):
    """
    单个标题仿写

    参数:
    - original_title: 原始标题
    - language: 目标语言 (zh中文/th泰语/en英语)
    - style: 风格 (simple简洁/catchy吸睛/localized本地化)
    - max_length: 最大长度

    示例:
    ```
    {
      "original_title": "[จัดส่งจากกรุงเทพฯ] สแตนเลส 304 ถ้วยน้ำจิ้ม",
      "language": "zh",
      "style": "catchy",
      "max_length": 60
    }
    ```

    返回:
    ```
    {
      "success": true,
      "new_title": "304不锈钢蘸料碗 | 曼谷直发 | 健康餐具新选择",
      "usage": {...}
    }
    ```
    """
    try:
        # 从请求头或配置获取API Key
        api_key = raw.headers.get("X-API-Key") or config.get_api_key('flash')
        if not api_key:
            raise HTTPException(status_code=400, detail="缺少 API Key")

        # 语言映射
        lang_map = {
            "zh": "中文",
            "th": "泰语",
            "en": "英语"
        }

        # 风格映射
        style_map = {
            "simple": "简洁清晰，直接表达产品核心卖点",
            "catchy": "吸引眼球，营销感强，使用符号和关键词突出优势",
            "localized": "符合目标市场的表达习惯，地道本地化"
        }

        target_lang = lang_map.get(request.language, "中文")
        target_style = style_map.get(request.style, "简洁清晰")

        # 构建提示词
        prompt = f"""请将以下电商商品标题改写为{target_lang}。

要求：
1. 风格：{target_style}
2. 保持核心产品卖点和特色
3. 吸引潜在买家点击
4. 长度不超过{request.max_length}字
5. 直接返回改写后的标题，不要任何解释、引号或额外的文字

原标题：{request.original_title}

改写后的标题："""

        # 调用云雾 API
        url = f"{config.get_base_url()}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": config.get_model('flash'),
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7,
            "max_tokens": 200
        }

        logger.info(f"[标题仿写] 原标题: {request.original_title[:50]}...")

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=payload)

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"API 调用失败: {response.text}"
                )

            result = response.json()

        # 提取新标题
        new_title = result["choices"][0]["message"]["content"].strip()

        # 移除可能的引号
        new_title = new_title.strip('"\'「」『』【】')

        # 限制长度
        if len(new_title) > request.max_length:
            new_title = new_title[:request.max_length] + "..."

        logger.info(f"[标题仿写] 新标题: {new_title}")

        return {
            "success": True,
            "new_title": new_title,
            "usage": result.get("usage", {}),
            "model": config.get_model('flash'),
            "message": "标题仿写成功"
        }

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="API 请求超时")
    except Exception as e:
        logger.error(f"[标题仿写] 失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"仿写失败: {str(e)}")


@router.post("/api/title/batch-rewrite")
async def batch_rewrite_titles(request: BatchTitleRewriteRequest, raw: Request):
    """
    批量标题仿写

    参数:
    - titles: 标题列表
    - language: 目标语言
    - style: 风格
    - max_length: 最大长度

    示例:
    ```
    {
      "titles": [
        "สแตนเลส 304 ถ้วยน้ำจิ้ม",
        "ถ้วยซอสหมี + ฝาพลาสติก"
      ],
      "language": "zh",
      "style": "catchy"
    }
    ```

    返回:
    ```
    {
      "success": true,
      "results": [
        {"index": 0, "original": "...", "new_title": "...", "success": true},
        {"index": 1, "original": "...", "new_title": "...", "success": true}
      ],
      "total": 2,
      "success_count": 2,
      "failed_count": 0
    }
    ```
    """
    try:
        api_key = raw.headers.get("X-API-Key") or config.get_api_key('flash')
        if not api_key:
            raise HTTPException(status_code=400, detail="缺少 API Key")

        logger.info(f"[批量仿写] 开始处理 {len(request.titles)} 个标题")

        results = []
        success_count = 0
        failed_count = 0

        for idx, original_title in enumerate(request.titles):
            try:
                # 调用单个仿写接口
                single_request = TitleRewriteRequest(
                    original_title=original_title,
                    language=request.language,
                    style=request.style,
                    max_length=request.max_length
                )

                result = await rewrite_title(single_request, raw)

                results.append({
                    "index": idx,
                    "original": original_title,
                    "new_title": result["new_title"],
                    "success": True,
                    "error": None
                })

                success_count += 1
                logger.info(f"[批量仿写] [{idx+1}/{len(request.titles)}] 成功")

            except Exception as e:
                results.append({
                    "index": idx,
                    "original": original_title,
                    "new_title": None,
                    "success": False,
                    "error": str(e)
                })

                failed_count += 1
                logger.error(f"[批量仿写] [{idx+1}/{len(request.titles)}] 失败: {str(e)}")

        logger.info(f"[批量仿写] 完成: 成功 {success_count}/{len(request.titles)}")

        return {
            "success": True,
            "results": results,
            "total": len(request.titles),
            "success_count": success_count,
            "failed_count": failed_count,
            "message": f"批量仿写完成: 成功 {success_count}，失败 {failed_count}"
        }

    except Exception as e:
        logger.error(f"[批量仿写] 失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"批量仿写失败: {str(e)}")
