"""
Xobi API - Batch Processing Endpoint
批量任务控制与状态查询
"""
import os
import zipfile
import asyncio
from typing import Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel

from ..utils.excel_parser import parse_excel
from ..core.pipeline import process_batch, get_batch_status, list_batches, TaskStatus
from ..config import config

router = APIRouter(prefix="/api/batch", tags=["Batch"])


class StartBatchRequest(BaseModel):
    batch_id: str
    file_path: Optional[str] = None
    concurrency: int = 3
    use_gemini_enhance: bool = True


# 存储正在运行的任务
_running_tasks = {}


@router.post("/{batch_id}/start")
async def start_batch(batch_id: str, request: StartBatchRequest, background_tasks: BackgroundTasks):
    """
    启动批量生成任务
    
    Args:
        batch_id: 批次 ID (来自 upload 接口)
        request: 启动参数
    """
    # 检查是否已在运行
    existing = get_batch_status(batch_id)
    if existing and existing.status == "running":
        raise HTTPException(status_code=400, detail="该批次正在处理中")
    
    # 查找对应的 Excel 文件
    input_dir = os.path.abspath(config.INPUT_DIR)
    file_path = request.file_path
    
    if not file_path:
        # 自动查找
        for ext in [".xlsx", ".xls", ".csv"]:
            candidate = os.path.join(input_dir, f"{batch_id}{ext}")
            if os.path.exists(candidate):
                file_path = candidate
                break
    
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"未找到批次文件: {batch_id}")
    
    # 检查是否有智能解析的 JSON 结果
    parsed_json_path = file_path + ".parsed.json"
    sku_list = []
    
    if os.path.exists(parsed_json_path):
        # 使用智能解析的结果
        import json
        try:
            with open(parsed_json_path, "r", encoding="utf-8") as f:
                products = json.load(f)
            
            # 转换为 SKUData 格式
            from ..utils.excel_parser import SKUData
            for p in products:
                sku_list.append(SKUData(
                    id=p.get("id", ""),
                    product_name=p.get("product_name", ""),
                    selling_point=p.get("selling_point", ""),
                    color=p.get("color", ""),
                    category=p.get("category", "")
                ))
            print(f"[Batch] 使用智能解析结果: {len(sku_list)} 个 SKU")
        except Exception as e:
            print(f"[Batch] 读取智能解析结果失败: {e}")
            sku_list = []
    
    # 如果没有智能解析结果，使用标准解析
    if not sku_list:
        try:
            sku_list = parse_excel(file_path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Excel 解析失败: {str(e)}")
    
    if not sku_list:
        raise HTTPException(status_code=400, detail="Excel 中没有有效的 SKU 数据")
    
    # 在后台启动处理任务
    async def run_batch():
        await process_batch(
            sku_list=sku_list,
            batch_id=batch_id,
            concurrency=request.concurrency,
            use_gemini_enhance=request.use_gemini_enhance
        )
    
    background_tasks.add_task(asyncio.create_task, run_batch())
    
    return JSONResponse({
        "success": True,
        "batch_id": batch_id,
        "total_skus": len(sku_list),
        "status": "started",
        "message": f"开始处理 {len(sku_list)} 个 SKU"
    })


@router.get("/{batch_id}/status")
async def get_status(batch_id: str):
    """获取批次处理状态"""
    batch = get_batch_status(batch_id)
    
    if not batch:
        raise HTTPException(status_code=404, detail=f"批次不存在: {batch_id}")
    
    # 构建任务详情
    tasks_summary = []
    for task in batch.tasks:
        tasks_summary.append({
            "sku_id": task.sku_id,
            "product_name": task.product_name,
            "status": task.status.value,
            "retry_count": task.retry_count,
            "error": task.error_message if task.status == TaskStatus.FAILED else None,
            "image_path": task.image_path
        })
    
    return JSONResponse({
        "batch_id": batch.batch_id,
        "status": batch.status,
        "total": batch.total_count,
        "completed": batch.completed_count,
        "success": batch.success_count,
        "failed": batch.failed_count,
        "progress": round(batch.completed_count / batch.total_count * 100, 1) if batch.total_count > 0 else 0,
        "created_at": batch.created_at,
        "completed_at": batch.completed_at,
        "tasks": tasks_summary
    })


@router.get("/{batch_id}/download")
async def download_results(batch_id: str):
    """
    下载批次结果 (ZIP 打包)
    只包含成功生成的图片
    """
    batch = get_batch_status(batch_id)
    
    if not batch:
        raise HTTPException(status_code=404, detail=f"批次不存在: {batch_id}")
    
    if batch.status != "completed":
        raise HTTPException(status_code=400, detail="批次尚未完成处理")
    
    # 收集成功的图片
    output_dir = os.path.join(os.path.abspath(config.OUTPUT_DIR), batch_id)
    
    if not os.path.exists(output_dir):
        raise HTTPException(status_code=404, detail="输出目录不存在")
    
    # 创建 ZIP 文件
    zip_path = os.path.join(output_dir, f"{batch_id}_results.zip")
    
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for task in batch.tasks:
            if task.status == TaskStatus.SUCCESS and task.image_path:
                if os.path.exists(task.image_path):
                    arcname = os.path.basename(task.image_path)
                    zipf.write(task.image_path, arcname)
    
    return FileResponse(
        path=zip_path,
        filename=f"{batch_id}_results.zip",
        media_type="application/zip"
    )


@router.get("")
async def list_all_batches():
    """列出所有批次"""
    batches = list_batches()
    return JSONResponse({
        "batches": batches,
        "total": len(batches)
    })
