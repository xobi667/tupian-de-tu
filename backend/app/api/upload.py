"""
Xobi API - Upload Endpoint
处理 Excel 文件上传和预览
"""
import os
import shutil
import tempfile
import uuid
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import JSONResponse

from ..utils.excel_parser import parse_excel, validate_excel_structure
from ..utils.smart_parser import smart_parse_excel
from ..config import config

router = APIRouter(prefix="/api/upload", tags=["Upload"])


@router.post("")
async def upload_excel(
    file: UploadFile = File(...),
    smart_mode: bool = Query(True, description="启用智能解析模式")
):
    """
    上传 Excel/CSV 文件
    
    Args:
        file: Excel/CSV 文件
        smart_mode: 是否启用 AI 智能解析 (默认开启)
    
    返回:
    - batch_id: 批次 ID
    - preview: 前几行数据预览
    - total_rows: 总行数
    """
    # 验证文件类型
    filename = file.filename or "unknown"
    ext = os.path.splitext(filename)[1].lower()
    
    if ext not in [".xlsx", ".xls", ".csv"]:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件格式: {ext}。请上传 .xlsx, .xls 或 .csv 文件"
        )
    
    # 生成批次 ID
    batch_id = f"batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    
    # 确保输入目录存在
    input_dir = os.path.abspath(config.INPUT_DIR)
    os.makedirs(input_dir, exist_ok=True)
    
    # 保存文件
    safe_filename = f"{batch_id}{ext}"
    file_path = os.path.join(input_dir, safe_filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件保存失败: {str(e)}")
    finally:
        file.file.close()
    
    # 先尝试标准验证
    validation = validate_excel_structure(file_path)
    
    if validation.get("valid"):
        # 标准格式，直接返回
        return JSONResponse({
            "success": True,
            "batch_id": batch_id,
            "file_path": file_path,
            "original_filename": filename,
            "total_rows": validation.get("total_rows", 0),
            "columns": validation.get("columns", []),
            "mapped_columns": validation.get("mapped_columns", {}),
            "preview": validation.get("preview", []),
            "parse_mode": "standard"
        })
    
    # 标准验证失败，尝试智能解析
    if smart_mode:
        try:
            print(f"[Upload] 标准解析失败，启用智能解析: {filename}")
            products = await smart_parse_excel(file_path)
            
            if products and len(products) > 0:
                # 保存解析结果到 JSON
                import json
                result_path = file_path + ".parsed.json"
                with open(result_path, "w", encoding="utf-8") as f:
                    json.dump(products, f, ensure_ascii=False, indent=2)
                
                return JSONResponse({
                    "success": True,
                    "batch_id": batch_id,
                    "file_path": file_path,
                    "parsed_file": result_path,
                    "original_filename": filename,
                    "total_rows": len(products),
                    "columns": ["product_name", "selling_point", "color", "category"],
                    "mapped_columns": {"product_name": "AI识别"},
                    "preview": products[:3],
                    "parse_mode": "smart_ai"
                })
        except Exception as e:
            print(f"[Upload] 智能解析失败: {e}")
    
    # 都失败了
    os.remove(file_path)
    raise HTTPException(
        status_code=400,
        detail=f"文件格式错误: {', '.join(validation.get('errors', ['未知错误']))}。请确保表格包含产品信息。"
    )


@router.post("/smart")
async def upload_smart(file: UploadFile = File(...)):
    """
    强制使用智能解析模式上传
    即使表格格式混乱也能识别
    """
    return await upload_excel(file, smart_mode=True)


@router.post("/validate")
async def validate_file(file: UploadFile = File(...)):
    """
    仅验证文件结构，不保存
    用于前端上传前的预检查
    """
    temp_path = None
    ext = os.path.splitext(file.filename or "")[1].lower()

    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", delete=False, prefix="xobi_validate_", suffix=ext
        ) as tmp:
            shutil.copyfileobj(file.file, tmp)
            temp_path = tmp.name
        
        validation = validate_excel_structure(temp_path)
        return JSONResponse(validation)
        
    finally:
        file.file.close()
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
