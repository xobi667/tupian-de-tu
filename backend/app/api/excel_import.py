"""
Excel Import APIs
用于批量工厂：上传 Excel/CSV -> 字段映射解析任务行
"""

from __future__ import annotations

import glob
import math
import os
import re
import uuid
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..config import config

router = APIRouter(tags=["Excel"])


def _get_data_dir() -> str:
    return os.path.dirname(os.path.abspath(config.INPUT_DIR))


TEMP_DIR = os.path.join(_get_data_dir(), "temp_uploads")
os.makedirs(TEMP_DIR, exist_ok=True)


def _read_table(file_path: str) -> pd.DataFrame:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        last_error: Exception | None = None
        for encoding in ("utf-8-sig", "utf-8", "gbk", "gb2312"):
            try:
                return pd.read_csv(file_path, encoding=encoding)
            except Exception as e:  # noqa: PERF203
                last_error = e
        raise HTTPException(status_code=400, detail=f"CSV 解析失败: {last_error}")
    if ext in (".xlsx", ".xls"):
        try:
            return pd.read_excel(file_path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Excel 解析失败: {e}")
    raise HTTPException(status_code=400, detail=f"不支持的文件格式: {ext}")


def _safe_str(value: object) -> str:
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass
    return str(value).strip()


def _clean_cell(value: object):
    try:
        if value is None or pd.isna(value):
            return ""
    except Exception:
        if value is None:
            return ""
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        try:
            if math.isnan(float(value)) or math.isinf(float(value)):
                return ""
        except Exception:
            return ""
        return float(value)
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    return str(value) if value else ""


class ReplaceColumnMapping(BaseModel):
    reference_image_column: Optional[str] = None
    product_image_column: Optional[str] = None
    product_name_column: Optional[str] = None
    custom_text_column: Optional[str] = None
    requirements_column: Optional[str] = None


class ParseReplaceRequest(BaseModel):
    file_id: str
    mapping: ReplaceColumnMapping


class ColumnMapping(BaseModel):
    """通用解析字段映射（Excel智能处理风格）"""

    skuid_column: Optional[str] = None
    title_column: Optional[str] = None
    image_column: Optional[str] = None
    price_column: Optional[str] = None
    category_column: Optional[str] = None


class ParseRequest(BaseModel):
    file_id: str
    mapping: ColumnMapping


class ExportOverwrite(BaseModel):
    title_column: Optional[str] = None
    image_column: Optional[str] = None


class ExportRequest(BaseModel):
    file_id: str
    data: list[dict]
    format: Optional[str] = None  # csv|xlsx
    overwrite: Optional[ExportOverwrite] = None


@router.post("/api/excel/upload")
async def upload_excel(file: UploadFile = File(...)):
    """
    上传 Excel/CSV 文件并返回列名 + 预览行

    返回:
    - file_id
    - filename
    - columns
    - preview_rows (前10行)
    - total_rows
    """
    filename = file.filename or "upload.xlsx"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in (".xlsx", ".xls", ".csv"):
        raise HTTPException(status_code=400, detail="只支持 .xlsx/.xls/.csv")

    file_id = f"excel_{uuid.uuid4().hex[:10]}"
    file_path = os.path.join(TEMP_DIR, f"{file_id}{ext}")
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    df = _read_table(file_path)

    columns = ["" if pd.isna(c) else str(c) for c in df.columns]
    preview_rows = []
    for i in range(min(10, len(df))):
        row_dict = {}
        for j, col_name in enumerate(columns):
            try:
                row_dict[col_name] = _clean_cell(df.iloc[i, j])
            except Exception:
                row_dict[col_name] = ""
        preview_rows.append(row_dict)

    return JSONResponse(
        {
            "success": True,
            "file_id": file_id,
            "filename": filename,
            "columns": columns,
            "preview_rows": preview_rows,
            "total_rows": int(len(df)),
        }
    )


@router.post("/api/excel/parse-replace")
async def parse_excel_replace(request: ParseReplaceRequest):
    """
    按字段映射解析整表数据（批量替换模式）

    输出 item 字段:
    - id (行号)
    - product_name
    - reference_image
    - product_image
    - custom_text
    - requirements
    - _row_index (0-based)
    """
    file_pattern = os.path.join(TEMP_DIR, f"{request.file_id}.*")
    import glob

    files = glob.glob(file_pattern)
    if not files:
        raise HTTPException(status_code=404, detail="文件不存在或已过期")

    file_path = files[0]
    df = _read_table(file_path)
    df = df.fillna("").replace([np.inf, -np.inf], "")

    mapping = request.mapping
    result_data = []
    for idx, row in df.iterrows():
        item = {
            "id": str(idx + 1),
            "product_name": _safe_str(row.get(mapping.product_name_column, "")) if mapping.product_name_column else "",
            "reference_image": _safe_str(row.get(mapping.reference_image_column, "")) if mapping.reference_image_column else "",
            "product_image": _safe_str(row.get(mapping.product_image_column, "")) if mapping.product_image_column else "",
            "custom_text": _safe_str(row.get(mapping.custom_text_column, "")) if mapping.custom_text_column else "",
            "requirements": _safe_str(row.get(mapping.requirements_column, "")) if mapping.requirements_column else "",
            "_row_index": int(idx),
        }

        # 支持逗号分隔：取第一个
        if item["reference_image"] and "," in item["reference_image"]:
            item["reference_image"] = item["reference_image"].split(",")[0].strip()
        if item["product_image"] and "," in item["product_image"]:
            item["product_image"] = item["product_image"].split(",")[0].strip()

        has_images = bool(item["reference_image"] or item["product_image"])
        if not has_images:
            continue

        result_data.append(item)

    return JSONResponse(
        {
            "success": True,
            "data": result_data,
            "total": len(result_data),
        }
    )


@router.post("/api/excel/parse")
async def parse_excel(request: ParseRequest):
    """
    解析 Excel/CSV（Excel智能处理风格：SKUID/标题/图片/价格）。

    输出字段:
    - skuid
    - title
    - images (list[str])
    - main_image (str)
    - price
    - category
    - _row_index (0-based)
    """
    file_pattern = os.path.join(TEMP_DIR, f"{request.file_id}.*")
    files = glob.glob(file_pattern)
    if not files:
        raise HTTPException(status_code=404, detail="文件不存在或已过期")

    file_path = files[0]
    df = _read_table(file_path)
    df = df.fillna("").replace([np.inf, -np.inf], "")

    mapping = request.mapping
    result_data: list[dict] = []

    for idx, row in df.iterrows():
        item = {
            "skuid": _safe_str(row.get(mapping.skuid_column, "")) if mapping.skuid_column else "",
            "title": _safe_str(row.get(mapping.title_column, "")) if mapping.title_column else "",
            "images": [],
            "main_image": "",
            "price": _clean_cell(row.get(mapping.price_column, "")) if mapping.price_column else "",
            "category": _safe_str(row.get(mapping.category_column, "")) if mapping.category_column else "",
            "_row_index": int(idx),
        }

        if mapping.image_column:
            image_str = _safe_str(row.get(mapping.image_column, ""))
            if image_str:
                images = [s.strip() for s in str(image_str).split(",") if s.strip()]
                item["images"] = images
                item["main_image"] = images[0] if images else ""

        result_data.append(item)

    return JSONResponse({"success": True, "data": result_data, "total": len(result_data)})


@router.post("/api/excel/export")
async def export_excel(request: ExportRequest):
    """
    Export processed rows.

    Modes:
    - Default legacy: append columns and export xlsx
    - Overwrite mode: overwrite existing title/image columns and export csv/xlsx
    """
    file_pattern = os.path.join(TEMP_DIR, f"{request.file_id}.*")
    files = glob.glob(file_pattern)
    if not files:
        raise HTTPException(status_code=404, detail="原始文件不存在或已过期")

    file_path = files[0]
    original_ext = os.path.splitext(file_path)[1].lower()
    df_original = _read_table(file_path)
    df_original = df_original.fillna("").replace([np.inf, -np.inf], "")

    export_format = (request.format or "").strip().lower()
    if export_format not in ("", "csv", "xlsx"):
        raise HTTPException(status_code=400, detail="format 仅支持 csv/xlsx")
    if not export_format:
        export_format = "csv" if original_ext == ".csv" else "xlsx"

    overwrite = request.overwrite
    overwrite_mode = bool(overwrite) or export_format == "csv"

    def _auto_detect_title_column(columns: list[str]) -> Optional[str]:
        for col in columns:
            if not col:
                continue
            if re.search(r"(title|标题|名称|产品名|商品名)", str(col), re.I):
                return str(col)
        return str(columns[0]) if columns else None

    def _auto_detect_image_column(columns: list[str]) -> Optional[str]:
        for col in columns:
            if not col:
                continue
            if re.search(r"(image|img|图片|主图|链接|url)", str(col), re.I):
                return str(col)
        return None

    if overwrite_mode:
        df_export = df_original.copy()

        cols = [str(c) for c in df_export.columns]
        title_col = (overwrite.title_column if overwrite else None) or _auto_detect_title_column(cols)
        image_col = (overwrite.image_column if overwrite else None) or _auto_detect_image_column(cols)

        if not title_col or title_col not in df_export.columns:
            raise HTTPException(status_code=400, detail="无法确定标题列，请在前端选择/传入 title_column")
        if not image_col or image_col not in df_export.columns:
            raise HTTPException(status_code=400, detail="无法确定图片列，请在前端选择/传入 image_column")

        for item in request.data or []:
            row_idx = item.get("_row_index")
            if row_idx is None:
                continue
            try:
                row_idx = int(row_idx)
            except Exception:
                continue
            if row_idx < 0 or row_idx >= len(df_export):
                continue

            new_title = (item.get("new_title") or "").strip()
            new_image = (item.get("new_image") or "").strip()

            if new_title:
                df_export.at[row_idx, title_col] = new_title
            if new_image:
                df_export.at[row_idx, image_col] = new_image

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        suffix = "csv" if export_format == "csv" else "xlsx"
        output_filename = f"processed_{request.file_id}_{timestamp}.{suffix}"
        output_path = os.path.join(os.path.abspath(config.OUTPUT_DIR), output_filename)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        try:
            if export_format == "csv":
                df_export.to_csv(output_path, index=False, encoding="utf-8-sig")
            else:
                df_export.to_excel(output_path, index=False, engine="openpyxl")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"导出失败: {e}")

        return JSONResponse(
            {
                "success": True,
                "filename": output_filename,
                "download_url": f"/outputs/{output_filename}",
                "message": "导出成功",
            }
        )

    # Legacy xlsx export: append extra columns
    df_export = df_original.copy()

    df_export["新标题"] = ""
    df_export["新图片URL"] = ""
    df_export["处理状态"] = ""

    for item in request.data or []:
        row_idx = item.get("_row_index")
        if row_idx is None:
            continue
        try:
            row_idx = int(row_idx)
        except Exception:
            continue
        if row_idx < 0 or row_idx >= len(df_export):
            continue

        if "new_title" in item:
            df_export.at[row_idx, "新标题"] = item.get("new_title") or ""
        if "new_image" in item:
            df_export.at[row_idx, "新图片URL"] = item.get("new_image") or ""
        if "status" in item:
            df_export.at[row_idx, "处理状态"] = item.get("status") or ""

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_filename = f"processed_{request.file_id}_{timestamp}.xlsx"
    output_path = os.path.join(os.path.abspath(config.OUTPUT_DIR), output_filename)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    try:
        df_export.to_excel(output_path, index=False, engine="openpyxl")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出失败: {e}")

    return JSONResponse(
        {
            "success": True,
            "filename": output_filename,
            "download_url": f"/outputs/{output_filename}",
            "message": "导出成功",
        }
    )
