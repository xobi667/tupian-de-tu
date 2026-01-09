"""
Batch style generation (CSV-driven).

Goal:
- Keep product (from image URL/path) consistent
- Keep copy text (title/subtitle) the same unless user requests translation
- Generate a new main image in a selected platform style preset
"""

from __future__ import annotations

import asyncio
import datetime
import json
import logging
import mimetypes
import os
import re
import uuid
from typing import Any, Dict, Optional

import httpx

from ..config import config
from .replacer import generate_styled_image

logger = logging.getLogger(__name__)

STYLE_JOBS: Dict[str, Dict[str, Any]] = {}
_JOB_SAVE_LOCK = asyncio.Lock()
_JOB_FILENAME = "job.json"


def _is_http_url(value: str) -> bool:
    return value.startswith("http://") or value.startswith("https://")


def _is_output_url(value: str) -> bool:
    s = (value or "").strip().replace("\\", "/")
    return s.startswith("/outputs/") or s.startswith("outputs/")


def _output_url_to_local_path(value: str) -> str:
    """Map /outputs/... url to a local file path under OUTPUT_DIR (safe-guarded)."""
    s = (value or "").strip().replace("\\", "/").lstrip("/")
    if not s.startswith("outputs/"):
        return ""
    rel = s[len("outputs/") :]

    output_root = os.path.abspath(config.OUTPUT_DIR)
    candidate = os.path.abspath(os.path.join(output_root, rel))
    try:
        if os.path.commonpath([output_root, candidate]) != output_root:
            return ""
    except Exception:
        return ""
    return candidate


def _job_json_path(output_dir: str) -> str:
    return os.path.join(os.path.abspath(output_dir), _JOB_FILENAME)


async def _persist_job(job: Dict[str, Any]) -> None:
    """Persist a job state to disk so it survives server restarts."""
    try:
        output_dir = os.path.abspath(job.get("output_dir") or "")
        if not output_dir:
            return
        os.makedirs(output_dir, exist_ok=True)
        path = _job_json_path(output_dir)
        tmp = path + ".tmp"

        job["updated_at"] = datetime.datetime.now().isoformat()

        async with _JOB_SAVE_LOCK:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(job, f, ensure_ascii=False, separators=(",", ":"))
            os.replace(tmp, path)
    except Exception:
        logger.exception("[StyleBatch] Failed to persist job")


def _load_existing_jobs() -> None:
    """Load persisted jobs from OUTPUT_DIR/style_*/job.json into memory."""
    try:
        output_root = os.path.abspath(config.OUTPUT_DIR)
        if not os.path.exists(output_root):
            return

        candidates: list[tuple[float, str]] = []
        for name in os.listdir(output_root):
            if not name.startswith("style_"):
                continue
            output_dir = os.path.join(output_root, name)
            job_path = _job_json_path(output_dir)
            if not os.path.isfile(job_path):
                continue
            try:
                mtime = os.path.getmtime(job_path)
            except Exception:
                mtime = 0.0
            candidates.append((mtime, job_path))

        # Load newest first (cap to avoid huge memory on long-running machines)
        candidates.sort(key=lambda x: x[0], reverse=True)
        for _, job_path in candidates[:200]:
            try:
                with open(job_path, "r", encoding="utf-8") as f:
                    job = json.load(f)
                if not isinstance(job, dict) or not job.get("id"):
                    continue

                # If the server restarted mid-processing, mark as interrupted.
                if job.get("status") == "processing":
                    job["status"] = "interrupted"

                STYLE_JOBS[str(job["id"])] = job
            except Exception:
                logger.exception("[StyleBatch] Failed to load job: %s", job_path)
    except Exception:
        logger.exception("[StyleBatch] Failed to load existing jobs")


def _detect_language(text: str) -> str:
    s = (text or "").strip()
    if not s:
        return "en"
    if any("\u0E00" <= ch <= "\u0E7F" for ch in s):
        return "th"
    if any("\u4e00" <= ch <= "\u9fff" for ch in s):
        return "zh"
    return "en"


async def _translate_text(text: str, target_lang: str, source_lang: Optional[str] = None) -> str:
    value = (text or "").strip()
    if not value:
        return ""

    src = source_lang or _detect_language(value)
    if target_lang in ("", "same", src):
        return value

    lang_map = {"zh": "中文", "th": "泰语", "en": "英语"}
    src_name = lang_map.get(src, src)
    tgt_name = lang_map.get(target_lang, target_lang)

    prompt = f"""请将以下电商文案从{src_name}翻译成{tgt_name}。
要求：
1) 保持意思不变、语气符合电商
2) 保留专有名词/型号/数字/单位，不要乱改
3) 只输出翻译后的文本，不要解释、不加引号

原文：
{value}

译文："""

    url = f"{config.get_base_url()}/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {config.get_api_key('flash')}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": config.get_model("flash"),
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "max_tokens": 400,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
    if resp.status_code != 200:
        raise RuntimeError(f"翻译失败: HTTP {resp.status_code}: {resp.text}")

    data = resp.json()
    out = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    return str(out or "").strip().strip('"\'“”‘’')


async def _download_image(url: str, dest_dir: str) -> str:
    os.makedirs(dest_dir, exist_ok=True)

    async with httpx.AsyncClient(verify=False, follow_redirects=True, timeout=30.0) as client:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
        }
        lower = url.lower()
        if "shopee" in lower:
            headers["Referer"] = "https://shopee.tw/"
        elif "taobao" in lower or "tmall" in lower:
            headers["Referer"] = "https://www.taobao.com/"
        elif "jd.com" in lower:
            headers["Referer"] = "https://www.jd.com/"
        else:
            headers["Referer"] = "https://www.google.com/"
        resp = await client.get(url, headers=headers)
    if resp.status_code != 200:
        raise RuntimeError(f"下载图片失败: HTTP {resp.status_code}")

    content_type = resp.headers.get("content-type") or ""
    ext = mimetypes.guess_extension(content_type.split(";", 1)[0].strip()) or ""

    if not ext:
        ext = os.path.splitext(url.split("?", 1)[0])[1]
    if not ext:
        ext = ".jpg"
    if ext.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
        ext = ".jpg"

    filename = f"img_{uuid.uuid4().hex[:10]}{ext}"
    path = os.path.join(dest_dir, filename)
    with open(path, "wb") as f:
        f.write(resp.content)
    return path


def _style_preset_prompt(preset: str) -> tuple[str, str]:
    p = (preset or "").strip().lower()
    if p in ("shein", "shien"):
        return (
            "SHEIN 风格：年轻化、时尚、干净但有设计感；可用轻柔渐变/软阴影；色彩高级不过度；整体更潮流。",
            "字体排版：现代无衬线，标题更粗更醒目，副标题更细，留白充足。",
        )
    if p in ("amazon", "amz"):
        return (
            "Amazon 风格：极简干净、产品突出、光照均匀；背景偏纯色/浅色，避免花哨；信息清晰易读。",
            "字体排版：清晰易读，层级明确，不要夸张装饰，文字不要过多。",
        )
    if p in ("tiktok", "douyin"):
        return (
            "短视频平台风格：更有冲击力与对比度，可用动感构图与更强光影；但保持电商主图干净。",
            "字体排版：标题有冲击力，可用强调色块/描边，但保持清晰。",
        )
    return (
        "通用电商主图风格：干净、商业摄影质感、主体突出、构图规整、背景简洁。",
        "字体排版：标题/副标题层级清晰，保持统一风格。",
    )


def _build_generation_prompt(
    preset: str,
    options: dict[str, Any] | None,
    requirements: str | None,
    aspect_ratio: str | None,
) -> tuple[str, str]:
    style_prompt, copy_hint = _style_preset_prompt(preset)
    opts = options or {}

    parts: list[str] = []
    parts.append(style_prompt)
    parts.append("目标：生成全新的电商主图，只改变画面风格与背景氛围，产品本体保持一致且真实，不要变形。")

    if aspect_ratio:
        parts.append(f"画幅比例：{aspect_ratio}。")

    if opts.get("replace_background"):
        parts.append("替换背景：生成符合风格的新背景/场景，主体清晰，边缘干净。")
    if opts.get("change_angle"):
        parts.append("换产品角度：允许轻微改变展示角度，但必须保持产品结构真实，不可变形。")
    if opts.get("change_lighting"):
        parts.append("调整光影：更符合目标风格的主光方向与阴影，质感更商业。")
    if opts.get("add_scene_props"):
        parts.append("可加入少量风格化道具点缀，但不能遮挡产品与文字。")

    if requirements:
        clean_req = re.sub(r"\s+", " ", str(requirements)).strip()
        if clean_req:
            parts.append(f"额外要求：{clean_req}")

    parts.append("文字要求：仅使用提供的文案，不要新增任何文字/Logo/水印；排版与字体风格请保持统一且高级。")
    parts.append("输出：仅返回生成图片的数据URI（data:image/png;base64,...），不要任何解释。")
    return "\n".join(parts), copy_hint


class BatchStyleManager:
    @staticmethod
    def get_job(job_id: str) -> Optional[Dict[str, Any]]:
        return STYLE_JOBS.get(job_id)

    @staticmethod
    def list_jobs(limit: int = 50) -> list[dict]:
        jobs = list(STYLE_JOBS.values())
        jobs.sort(key=lambda j: str(j.get("created_at") or ""), reverse=True)

        out: list[dict] = []
        for job in jobs[: max(1, int(limit or 50))]:
            out.append(
                {
                    "id": job.get("id"),
                    "status": job.get("status"),
                    "created_at": job.get("created_at"),
                    "updated_at": job.get("updated_at"),
                    "total": job.get("total", 0),
                    "processed": job.get("processed", 0),
                    "success_count": job.get("success_count", 0),
                    "failed_count": job.get("failed_count", 0),
                    "style_preset": job.get("style_preset"),
                    "target_language": job.get("target_language"),
                    "aspect_ratio": job.get("aspect_ratio"),
                    "output_dir_name": job.get("output_dir_name"),
                }
            )
        return out

    @staticmethod
    async def create_job_from_items(
        items: list[dict],
        *,
        style_preset: str,
        options: dict[str, Any] | None,
        requirements: str | None,
        target_language: str | None,
        aspect_ratio: str | None,
    ) -> Dict[str, Any]:
        if not items:
            return {"error": "items 不能为空"}

        normalized_items: list[dict] = []
        for idx, raw in enumerate(items):
            if not isinstance(raw, dict):
                continue
            image_url = str(raw.get("image_url") or raw.get("main_image") or "").strip()
            title = str(raw.get("title") or "").strip()
            subtitle = str(raw.get("subtitle") or "").strip()
            if not image_url:
                continue
            normalized_items.append(
                {
                    "id": str(raw.get("id") or (idx + 1)),
                    "title": title,
                    "subtitle": subtitle,
                    "image_url": image_url,
                    "_row_index": raw.get("_row_index"),
                    "status": "pending",
                }
            )

        if not normalized_items:
            return {"error": "未识别到有效的图片URL列"}

        job_id = str(uuid.uuid4())
        output_dir_name = f"style_{job_id[:8]}"
        output_dir = os.path.join(os.path.abspath(config.OUTPUT_DIR), output_dir_name)

        job_state: Dict[str, Any] = {
            "id": job_id,
            "status": "pending",
            "created_at": datetime.datetime.now().isoformat(),
            "total": len(normalized_items),
            "processed": 0,
            "success_count": 0,
            "failed_count": 0,
            "items": normalized_items,
            "output_dir": output_dir,
            "output_dir_name": output_dir_name,
            "style_preset": style_preset,
            "options": options or {},
            "requirements": requirements or "",
            "target_language": target_language or "same",
            "aspect_ratio": aspect_ratio or "1:1",
        }

        STYLE_JOBS[job_id] = job_state
        await _persist_job(job_state)
        return job_state

    @staticmethod
    async def cancel_job(job_id: str) -> Optional[Dict[str, Any]]:
        job = STYLE_JOBS.get(job_id)
        if not job:
            return None

        if str(job.get("status") or "").lower() in ("completed", "cancelled", "canceled"):
            return job

        job["status"] = "cancelled"
        await _persist_job(job)
        return job

    @staticmethod
    async def start_job(job_id: str) -> None:
        job = STYLE_JOBS.get(job_id)
        if not job:
            raise ValueError("Job not found")
        if job.get("status") == "processing":
            return
        job["status"] = "processing"
        await _persist_job(job)
        asyncio.create_task(BatchStyleManager._process_task(job_id))

    @staticmethod
    async def _process_task(job_id: str) -> None:
        job = STYLE_JOBS.get(job_id)
        if not job:
            return

        output_dir = os.path.abspath(job["output_dir"])
        inputs_dir = os.path.join(output_dir, "_inputs")
        os.makedirs(output_dir, exist_ok=True)
        os.makedirs(inputs_dir, exist_ok=True)
        await _persist_job(job)

        max_concurrent = getattr(config, "BATCH_CONCURRENT", 3)
        semaphore = asyncio.Semaphore(max_concurrent)

        generation_prompt, copy_style_hint = _build_generation_prompt(
            str(job.get("style_preset") or ""),
            job.get("options") or {},
            str(job.get("requirements") or ""),
            str(job.get("aspect_ratio") or ""),
        )
        target_language = str(job.get("target_language") or "same")

        async def process_one(index: int, item: dict) -> None:
            async with semaphore:
                if job.get("status") in ("cancelled", "canceled"):
                    return
                if item.get("status") in ("success", "failed"):
                    return
                item["status"] = "processing"
                await _persist_job(job)

                try:
                    image_url = str(item.get("image_url") or "").strip()
                    if not image_url:
                        raise RuntimeError("缺少图片URL")

                    if _is_http_url(image_url):
                        product_path = await _download_image(image_url, inputs_dir)
                    elif _is_output_url(image_url):
                        product_path = _output_url_to_local_path(image_url)
                        if not product_path or not os.path.exists(product_path):
                            raise RuntimeError("输出图片不存在")
                    else:
                        product_path = os.path.abspath(image_url)
                        if not os.path.exists(product_path):
                            raise RuntimeError("本地图片不存在")

                    title = str(item.get("title") or "").strip()
                    subtitle = str(item.get("subtitle") or "").strip()

                    translated_title = title
                    translated_subtitle = subtitle
                    if target_language and target_language != "same":
                        src_lang = _detect_language(f"{title} {subtitle}".strip())
                        if target_language != src_lang:
                            translated_title = await _translate_text(title, target_language, src_lang) if title else ""
                            translated_subtitle = await _translate_text(subtitle, target_language, src_lang) if subtitle else ""
                            # Translation is only used for image text rendering.
                            # Do NOT write into new_title/new_subtitle here, otherwise CSV export would overwrite titles.
                            item["image_title"] = translated_title
                            if translated_subtitle:
                                item["image_subtitle"] = translated_subtitle

                    custom_text = (translated_title or "").strip()
                    if translated_subtitle:
                        custom_text = (custom_text + "\n" + translated_subtitle).strip()

                    safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", str(item.get("id") or index))
                    output_path = os.path.join(output_dir, f"{safe_name}_{index+1}.png")

                    result = await generate_styled_image(
                        product_image_path=product_path,
                        generation_prompt=generation_prompt,
                        custom_text=custom_text or None,
                        copy_style_hint=copy_style_hint,
                        output_path=output_path,
                    )

                    if not result.get("success"):
                        raise RuntimeError(result.get("message") or "生成失败")

                    item["status"] = "success"
                    item["output_path"] = result.get("image_path")
                    item["output_url"] = _to_output_url(result.get("image_path") or "")
                    job["success_count"] += 1
                except Exception as e:
                    item["status"] = "failed"
                    item["error"] = str(e)
                    job["failed_count"] += 1
                finally:
                    job["processed"] += 1
                    await _persist_job(job)

        await asyncio.gather(*[process_one(i, it) for i, it in enumerate(job.get("items") or [])])

        if job.get("status") not in ("cancelled", "canceled"):
            job["status"] = "completed"
        await _persist_job(job)


def _to_output_url(path: str) -> str:
    try:
        output_root = os.path.abspath(config.OUTPUT_DIR)
        abs_path = os.path.abspath(path)
        if os.path.commonpath([output_root, abs_path]) != output_root:
            return ""
        rel = os.path.relpath(abs_path, output_root)
        return "/outputs/" + rel.replace(os.sep, "/")
    except Exception:
        return ""


style_batch_manager = BatchStyleManager()
_load_existing_jobs()
