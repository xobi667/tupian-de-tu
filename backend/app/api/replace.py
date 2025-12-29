"""
Xobi API - Replace Endpoint
单图产品替换接口
"""
import os
import shutil
import uuid
import base64
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional

from ..core.replacer import quick_replace, generate_replacement_image
from ..core.analyzer import analyze_reference_image, analyze_product_image, generate_replacement_prompt
from ..core.batch_replacer import batch_manager
from ..utils.smart_parser import smart_parse_excel
from ..config import config

router = APIRouter(prefix="/api/replace", tags=["Replace"])


@router.post("/single")
async def single_replace(
    product_image: UploadFile = File(..., description="产品图（白底）"),
    reference_image: UploadFile = File(..., description="参考主图"),
    product_name: str = Form("产品", description="产品名称"),
    custom_text: Optional[str] = Form(None, description="自定义文案（可选）")
):
    """
    单图替换 - 完整流程
    
    上传产品图和参考图，自动分析并生成新主图
    """
    # 创建临时目录
    temp_dir = os.path.join(os.path.abspath(config.INPUT_DIR), f"temp_{uuid.uuid4().hex[:8]}")
    os.makedirs(temp_dir, exist_ok=True)
    
    try:
        # 保存上传的图片
        product_path = os.path.join(temp_dir, f"product_{product_image.filename}")
        reference_path = os.path.join(temp_dir, f"reference_{reference_image.filename}")
        
        with open(product_path, "wb") as f:
            shutil.copyfileobj(product_image.file, f)
        
        with open(reference_path, "wb") as f:
            shutil.copyfileobj(reference_image.file, f)
        
        # 设置输出目录
        output_dir = os.path.join(os.path.abspath(config.OUTPUT_DIR), "replaced")
        
        # 执行快速替换
        result = await quick_replace(
            product_image_path=product_path,
            reference_image_path=reference_path,
            product_name=product_name,
            custom_text=custom_text,
            output_dir=output_dir
        )
        
        if result.get("success"):
            return JSONResponse({
                "success": True,
                "message": "生成成功",
                "image_path": result.get("image_path"),
                "image_data": result.get("image_data"),  # base64
                "reference_analysis": result.get("reference_analysis"),
                "product_analysis": result.get("product_analysis")
            })
        else:
            return JSONResponse({
                "success": False,
                "message": result.get("message", "生成失败")
            }, status_code=400)
            
    except Exception as e:
        return JSONResponse({
            "success": False,
            "message": str(e)
        }, status_code=500)
    
    finally:
        # 清理临时文件
        product_image.file.close()
        reference_image.file.close()


@router.post("/analyze")
async def analyze_images(
    product_image: UploadFile = File(...),
    reference_image: UploadFile = File(...)
):
    """
    仅分析图片，不生成
    用于预览分析结果
    """
    temp_dir = os.path.join(os.path.abspath(config.INPUT_DIR), f"temp_{uuid.uuid4().hex[:8]}")
    os.makedirs(temp_dir, exist_ok=True)
    
    try:
        # 保存图片
        product_path = os.path.join(temp_dir, f"product_{product_image.filename}")
        reference_path = os.path.join(temp_dir, f"reference_{reference_image.filename}")
        
        with open(product_path, "wb") as f:
            shutil.copyfileobj(product_image.file, f)
        
        with open(reference_path, "wb") as f:
            shutil.copyfileobj(reference_image.file, f)
        
        # 分析两张图
        ref_analysis = await analyze_reference_image(reference_path)
        product_analysis = await analyze_product_image(product_path)
        
        # 生成预览 Prompt
        prompt = await generate_replacement_prompt(ref_analysis, product_analysis)
        
        return JSONResponse({
            "success": True,
            "reference_analysis": ref_analysis,
            "product_analysis": product_analysis,
            "suggested_prompt": prompt
        })
        
    except Exception as e:
        return JSONResponse({
            "success": False,
            "message": str(e)
        }, status_code=500)
    
    finally:
        product_image.file.close()
        reference_image.file.close()


@router.post("/generate")
async def generate_only(
    product_image: UploadFile = File(...),
    reference_image: UploadFile = File(...),
    custom_prompt: str = Form(..., description="自定义生成 Prompt"),
    custom_text: Optional[str] = Form(None)
):
    """
    自定义 Prompt 生成
    跳过分析，直接使用自定义 Prompt 生成
    """
    temp_dir = os.path.join(os.path.abspath(config.INPUT_DIR), f"temp_{uuid.uuid4().hex[:8]}")
    os.makedirs(temp_dir, exist_ok=True)
    output_dir = os.path.join(os.path.abspath(config.OUTPUT_DIR), "replaced")
    
    try:
        product_path = os.path.join(temp_dir, f"product_{product_image.filename}")
        reference_path = os.path.join(temp_dir, f"reference_{reference_image.filename}")
        
        with open(product_path, "wb") as f:
            shutil.copyfileobj(product_image.file, f)
        
        with open(reference_path, "wb") as f:
            shutil.copyfileobj(reference_image.file, f)
        
        # 生成输出路径
        timestamp = int(datetime.now().timestamp())
        output_path = os.path.join(output_dir, f"custom_{timestamp}.png")
        os.makedirs(output_dir, exist_ok=True)
        
        result = await generate_replacement_image(
            product_image_path=product_path,
            reference_image_path=reference_path,
            generation_prompt=custom_prompt,
            custom_text=custom_text,
            output_path=output_path
        )
        
        return JSONResponse({
            "success": result.get("success"),
            "message": result.get("message"),
            "image_path": result.get("image_path"),
            "image_data": result.get("image_data")
        })
        
    except Exception as e:
        return JSONResponse({
            "success": False,
            "message": str(e)
        }, status_code=500)
    
    finally:
        product_image.file.close()
        reference_image.file.close()

# -------------------------------------------------------------------------
# 批量处理接口
# -------------------------------------------------------------------------

@router.post("/batch/upload", summary="上传Excel创建批量任务")
async def upload_batch_excel(file: UploadFile = File(...)):
    """
    上传 Excel 表格，创建批量替换任务
    返回预览数据和 job_id
    """
    if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="只支持 Excel 或 CSV 文件")
    
    # 保存临时文件
    temp_dir = "data/temp_uploads"
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, f"batch_{uuid.uuid4()}_{file.filename}")
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
        
    # 创建任务 (解析表格)
    result = await batch_manager.create_job(file_path)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
        
    return {
        "job_id": result["id"],
        "total": result["total"],
        "preview": result["items"][:5],  # 预览前5条
        "message": "解析成功，请确认信息后点击开始"
    }

@router.post("/batch/start/{job_id}", summary="开始批量任务")
async def start_batch_job(job_id: str):
    """开始执行批量任务"""
    try:
        await batch_manager.start_job(job_id)
        return {"status": "started", "message": "后台任务已启动"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/batch/{job_id}", summary="获取批量任务状态")
async def get_batch_status(job_id: str):
    """查询任务进度"""
    job = batch_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="任务不存在")
    return job
