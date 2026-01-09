"""
Style batch API (CSV-driven).

Endpoints:
- POST /api/style/batch/create-from-items
- POST /api/style/batch/{job_id}/cancel
- GET  /api/style/batch/{job_id}
- GET  /api/style/batch/{job_id}/download
"""

from __future__ import annotations

import os
import zipfile
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..config import config
from ..core.style_batch import style_batch_manager

router = APIRouter(prefix="/api/style", tags=["Style Batch"])


class CreateStyleBatchRequest(BaseModel):
    items: list[dict]
    style_preset: str = "shein"
    options: dict[str, Any] = {}
    requirements: str = ""
    target_language: str = "same"  # same|zh|th|en
    aspect_ratio: str = "1:1"
    auto_start: bool = True


@router.post("/batch/create-from-items")
async def create_batch_from_items(request: CreateStyleBatchRequest):
    job = await style_batch_manager.create_job_from_items(
        request.items,
        style_preset=request.style_preset,
        options=request.options,
        requirements=request.requirements,
        target_language=request.target_language,
        aspect_ratio=request.aspect_ratio,
    )
    if "error" in job:
        raise HTTPException(status_code=400, detail=job["error"])

    job_id = job.get("id")
    if request.auto_start and job_id:
        await style_batch_manager.start_job(job_id)

    return {
        "job_id": job_id,
        "total": job.get("total", 0),
        "preview": (job.get("items") or [])[:5],
        "message": "任务已创建" + ("，并已开始处理" if request.auto_start else ""),
    }


@router.get("/batch/list")
async def list_style_jobs(limit: int = 50):
    return {"success": True, "jobs": style_batch_manager.list_jobs(limit=limit)}


@router.get("/batch/{job_id}")
async def get_batch_status(job_id: str):
    job = style_batch_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="任务不存在")
    return job


@router.post("/batch/{job_id}/cancel")
async def cancel_batch_job(job_id: str):
    job = await style_batch_manager.cancel_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="任务不存在")
    return {"success": True, "job_id": job_id, "status": job.get("status")}


@router.get("/batch/{job_id}/download")
async def download_batch_results(job_id: str):
    job = style_batch_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="任务不存在")

    output_root = os.path.abspath(config.OUTPUT_DIR)
    output_dir = os.path.abspath(job.get("output_dir") or "")
    if not output_dir:
        raise HTTPException(status_code=404, detail="输出目录不存在")

    try:
        if os.path.commonpath([output_root, output_dir]) != output_root:
            raise HTTPException(status_code=400, detail="输出目录不合法")
    except Exception:
        raise HTTPException(status_code=400, detail="输出目录不合法")

    items = job.get("items") or []
    success_paths: list[str] = []
    for item in items:
        if item.get("status") != "success":
            continue
        p = item.get("output_path")
        if p and os.path.exists(p):
            success_paths.append(p)

    if not success_paths:
        raise HTTPException(status_code=400, detail="暂无可下载的成功结果")

    suffix = "results" if job.get("status") == "completed" else "partial"
    zip_name = f"{job.get('output_dir_name') or ('style_' + job_id[:8])}_{suffix}.zip"
    zip_path = os.path.join(output_dir, zip_name)

    seen_names: set[str] = set()

    def _unique_name(name: str) -> str:
        if name not in seen_names:
            seen_names.add(name)
            return name
        base, ext = os.path.splitext(name)
        n = 2
        while True:
            candidate = f"{base}_{n}{ext}"
            if candidate not in seen_names:
                seen_names.add(candidate)
                return candidate
            n += 1

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zipf:
        for p in success_paths:
            arcname = _unique_name(os.path.basename(p))
            zipf.write(p, arcname=arcname)

    return FileResponse(path=zip_path, filename=zip_name, media_type="application/zip")
