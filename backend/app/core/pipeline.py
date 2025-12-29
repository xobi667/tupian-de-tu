"""
Pipeline Orchestrator - 流水线调度器
串联 Director → Painter → Inspector 的完整生产流程
"""
import asyncio
import os
import time
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from enum import Enum

from .director import compile_prompt, enhance_prompt_with_gemini, validate_sku_data
from .painter import generate_image, save_image, PainterError
from .inspector import inspect_image, QualityStatus
from ..utils.excel_parser import SKUData
from ..config import config


class TaskStatus(Enum):
    PENDING = "pending"
    GENERATING = "generating"
    INSPECTING = "inspecting"
    RETRYING = "retrying"
    SUCCESS = "success"
    FAILED = "failed"


@dataclass
class TaskResult:
    """单个 SKU 的处理结果"""
    sku_id: str
    product_name: str
    status: TaskStatus
    image_path: Optional[str] = None
    prompt_used: str = ""
    retry_count: int = 0
    error_message: str = ""
    inspection_result: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    completed_at: Optional[str] = None


@dataclass
class BatchJob:
    """批量任务"""
    batch_id: str
    total_count: int
    completed_count: int = 0
    success_count: int = 0
    failed_count: int = 0
    status: str = "pending"  # pending, running, completed
    tasks: List[TaskResult] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    completed_at: Optional[str] = None


# 全局任务存储 (MVP 简化版，生产环境应使用数据库)
_batch_jobs: Dict[str, BatchJob] = {}


async def process_single_sku(
    sku: SKUData,
    batch_id: str,
    use_gemini_enhance: bool = True,
    on_progress: Optional[Callable[[TaskResult], None]] = None
) -> TaskResult:
    """
    处理单个 SKU 的完整流程
    
    Args:
        sku: SKU 数据
        batch_id: 批次 ID
        use_gemini_enhance: 是否使用 Gemini 增强 Prompt
        on_progress: 进度回调函数
        
    Returns:
        TaskResult
    """
    result = TaskResult(
        sku_id=sku.id,
        product_name=sku.product_name,
        status=TaskStatus.PENDING
    )
    
    try:
        # Step 1: 校验数据
        is_valid, error = await validate_sku_data(sku.to_dict())
        if not is_valid:
            result.status = TaskStatus.FAILED
            result.error_message = error
            return result
        
        # Step 2: Director - 编译 Prompt
        result.status = TaskStatus.GENERATING
        if on_progress:
            on_progress(result)
        
        if use_gemini_enhance:
            prompt_result = await enhance_prompt_with_gemini(sku.to_dict())
        else:
            prompt_result = await compile_prompt(sku.to_dict())
        
        result.prompt_used = prompt_result["prompt"]
        print(f"[Pipeline] SKU {sku.id}: Prompt compiled")
        
        # Step 3: Painter - 生成图片 (带重试机制)
        max_retries = config.MAX_RETRY_COUNT
        current_retry = 0
        image_result = None
        
        while current_retry <= max_retries:
            try:
                # 使用不同 seed 进行重试
                seed = int(time.time() * 1000) % 1000000 + current_retry * 1000
                
                image_result = await generate_image(
                    prompt=prompt_result["prompt"],
                    negative_prompt=prompt_result.get("negative_prompt", ""),
                    seed=seed
                )
                
                if not image_result.get("success"):
                    raise PainterError(image_result.get("message", "Unknown error"))
                
                # 保存图片
                output_dir = os.path.join(config.OUTPUT_DIR, batch_id)
                os.makedirs(output_dir, exist_ok=True)
                
                ext = ".png" if "png" in image_result.get("mime_type", "") else ".jpg"
                image_path = os.path.join(output_dir, f"{sku.id}_{current_retry}{ext}")
                
                await save_image(image_result, image_path)
                
                # Step 4: Inspector - 质检
                result.status = TaskStatus.INSPECTING
                if on_progress:
                    on_progress(result)
                
                inspection = await inspect_image(
                    image_base64=image_result.get("image_data"),
                    image_path=image_path if not image_result.get("image_data") else None
                )
                
                result.inspection_result = inspection
                print(f"[Pipeline] SKU {sku.id}: Quality check = {inspection['status']}")
                
                if inspection["status"] == QualityStatus.PASS.value:
                    # 质检通过
                    result.status = TaskStatus.SUCCESS
                    result.image_path = image_path
                    result.retry_count = current_retry
                    result.completed_at = datetime.now().isoformat()
                    print(f"[Pipeline] SKU {sku.id}: ✅ SUCCESS")
                    break
                else:
                    # 质检失败，需要重试
                    result.status = TaskStatus.RETRYING
                    if on_progress:
                        on_progress(result)
                    
                    current_retry += 1
                    result.retry_count = current_retry
                    
                    if current_retry <= max_retries:
                        print(f"[Pipeline] SKU {sku.id}: Quality failed, retrying ({current_retry}/{max_retries})...")
                        # 删除失败的图片
                        if os.path.exists(image_path):
                            os.remove(image_path)
                    else:
                        # 超过重试次数
                        result.status = TaskStatus.FAILED
                        result.error_message = f"Quality check failed after {max_retries} retries: {inspection.get('reason', '')}"
                        result.completed_at = datetime.now().isoformat()
                        print(f"[Pipeline] SKU {sku.id}: ❌ FAILED after {max_retries} retries")
                        
            except PainterError as e:
                current_retry += 1
                if current_retry > max_retries:
                    result.status = TaskStatus.FAILED
                    result.error_message = str(e)
                    result.completed_at = datetime.now().isoformat()
                    break
                print(f"[Pipeline] SKU {sku.id}: Painter error, retrying... ({e})")
                await asyncio.sleep(2)
        
    except Exception as e:
        result.status = TaskStatus.FAILED
        result.error_message = str(e)
        result.completed_at = datetime.now().isoformat()
        print(f"[Pipeline] SKU {sku.id}: ❌ ERROR: {e}")
    
    return result


async def process_batch(
    sku_list: List[SKUData],
    batch_id: Optional[str] = None,
    concurrency: int = 3,  # 并发数
    use_gemini_enhance: bool = True,
    on_progress: Optional[Callable[[BatchJob], None]] = None
) -> BatchJob:
    """
    批量处理 SKU 列表
    
    Args:
        sku_list: SKU 数据列表
        batch_id: 批次 ID (可选，会自动生成)
        concurrency: 并发处理数量
        use_gemini_enhance: 是否使用 Gemini 增强 Prompt
        on_progress: 进度回调
        
    Returns:
        BatchJob
    """
    if not batch_id:
        batch_id = f"batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    
    # 创建批次任务
    batch = BatchJob(
        batch_id=batch_id,
        total_count=len(sku_list),
        status="running"
    )
    _batch_jobs[batch_id] = batch
    
    print(f"[Pipeline] Starting batch {batch_id} with {len(sku_list)} SKUs (concurrency={concurrency})")
    
    # 创建信号量控制并发
    semaphore = asyncio.Semaphore(concurrency)
    
    async def process_with_semaphore(sku: SKUData) -> TaskResult:
        async with semaphore:
            return await process_single_sku(
                sku, 
                batch_id, 
                use_gemini_enhance,
                on_progress=lambda r: None  # 单任务进度暂不处理
            )
    
    # 并发执行所有任务
    tasks = [process_with_semaphore(sku) for sku in sku_list]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # 汇总结果
    for result in results:
        if isinstance(result, Exception):
            # 未捕获的异常
            batch.failed_count += 1
            batch.tasks.append(TaskResult(
                sku_id="unknown",
                product_name="unknown",
                status=TaskStatus.FAILED,
                error_message=str(result)
            ))
        else:
            batch.tasks.append(result)
            batch.completed_count += 1
            if result.status == TaskStatus.SUCCESS:
                batch.success_count += 1
            elif result.status == TaskStatus.FAILED:
                batch.failed_count += 1
    
    batch.status = "completed"
    batch.completed_at = datetime.now().isoformat()
    
    print(f"[Pipeline] Batch {batch_id} completed: {batch.success_count}/{batch.total_count} success")
    
    if on_progress:
        on_progress(batch)
    
    return batch


def get_batch_status(batch_id: str) -> Optional[BatchJob]:
    """获取批次状态"""
    return _batch_jobs.get(batch_id)


def list_batches() -> List[Dict[str, Any]]:
    """列出所有批次"""
    return [
        {
            "batch_id": b.batch_id,
            "total": b.total_count,
            "success": b.success_count,
            "failed": b.failed_count,
            "status": b.status,
            "created_at": b.created_at
        }
        for b in _batch_jobs.values()
    ]
