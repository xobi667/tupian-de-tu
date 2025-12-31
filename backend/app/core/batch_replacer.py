
import asyncio
import datetime
import os
import uuid
from typing import Any, Dict

from ..config import config
from ..utils.smart_parser import smart_parse_excel
from .analyzer import analyze_product_image, analyze_reference_image, generate_replacement_prompt
from .replacer import generate_replacement_image

# 全局存储批量任务状态 (内存中)
BATCH_JOBS: Dict[str, Dict[str, Any]] = {}

class BatchReplacementManager:
    """批量替换任务管理器"""

    @staticmethod
    def _safe_filename(text: str, fallback: str) -> str:
        cleaned = "".join([c for c in (text or "") if c.isalnum() or c in (" ", "-", "_")]).strip()
        if not cleaned:
            cleaned = fallback
        return cleaned[:80]

    @staticmethod
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
    
    @staticmethod
    async def create_job(file_path: str) -> Dict[str, Any]:
        """创建新任务"""
        job_id = str(uuid.uuid4())
        
        # 初步解析 Excel 预览数据
        try:
            parsed_data = await smart_parse_excel(file_path, mode="replace")
        except Exception as e:
            return {"error": f"解析 Excel 失败: {str(e)}"}
            
        if not parsed_data:
            return {"error": "未识别到有效数据，请检查 Excel 是否包含参考图和产品图路径"}
            
        # 初始化任务状态
        output_dir_name = f"batch_{job_id[:8]}"
        output_dir = os.path.join(os.path.abspath(config.OUTPUT_DIR), output_dir_name)
        job_state = {
            "id": job_id,
            "status": "pending",  # pending, processing, completed, failed
            "created_at": datetime.datetime.now().isoformat(),
            "total": len(parsed_data),
            "processed": 0,
            "success_count": 0,
            "failed_count": 0,
            "items": parsed_data, # 原始数据
            "results": [],        # 处理结果
            "output_dir": output_dir,
            "output_dir_name": output_dir_name,
        }
        
        BATCH_JOBS[job_id] = job_state
        return job_state

    @staticmethod
    async def start_job(job_id: str):
        """开始后台处理任务"""
        if job_id not in BATCH_JOBS:
            raise ValueError("Job not found")
            
        job = BATCH_JOBS[job_id]
        if job["status"] == "processing":
            return
            
        job["status"] = "processing"
        
        # 启动异步任务
        asyncio.create_task(BatchReplacementManager._process_task(job_id))

    @staticmethod
    async def _process_task(job_id: str):
        """后台处理逻辑"""
        job = BATCH_JOBS.get(job_id)
        if not job:
            return
            
        output_dir = os.path.abspath(job["output_dir"])
        os.makedirs(output_dir, exist_ok=True)
        
        print(f"[Batch] 开始任务 {job_id}, 总数: {job['total']}")
        
        # 根据配置动态调整并发数 (3个并发任务,提升处理速度)
        max_concurrent = getattr(config, 'BATCH_CONCURRENT', 3)
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def process_one(index, item):
            async with semaphore:
                # 检查状态，如果已完成则跳过 (暂不支持断点续传，这里主要为逻辑完整性)
                if item.get("status") in ["success", "failed"]:
                    return
                
                ref_img = item.get("reference_image")
                prod_img = item.get("product_image")
                
                # 简单验证路径
                if not ref_img or not prod_img or not os.path.exists(ref_img) or not os.path.exists(prod_img):
                    item["status"] = "failed"
                    item["error"] = "图片路径不存在"
                    job["failed_count"] += 1
                    job["processed"] += 1
                    return
                
                try:
                    # 生成输出文件名
                    prod_name = item.get("product_name") or f"item_{index + 1}"
                    safe_name = BatchReplacementManager._safe_filename(str(prod_name), f"item_{index + 1}")
                    timestamp = datetime.datetime.now().strftime("%H%M%S")
                    output_filename = f"{safe_name}_{timestamp}.png"
                    output_path = os.path.join(output_dir, output_filename)

                    custom_text = (item.get("custom_text") or "").strip() or None
                    requirements = (item.get("requirements") or "").strip() or None

                    # 优先使用表格中给定的 requirements（适合 AI Copilot 直接写入完整 Prompt）
                    if requirements:
                        generation_prompt = requirements
                    else:
                        ref_analysis = await analyze_reference_image(ref_img)
                        if "error" in ref_analysis:
                            raise Exception(f"参考图分析失败: {ref_analysis.get('error')}")

                        prod_analysis = await analyze_product_image(prod_img)
                        if "error" in prod_analysis:
                            raise Exception(f"产品图分析失败: {prod_analysis.get('error')}")

                        generation_prompt = await generate_replacement_prompt(
                            reference_analysis=ref_analysis,
                            product_analysis=prod_analysis,
                            custom_text=custom_text,
                        )

                    result = await generate_replacement_image(
                        product_image_path=prod_img,
                        reference_image_path=ref_img,
                        generation_prompt=generation_prompt,
                        custom_text=custom_text,
                        output_path=output_path,
                    )

                    if not result.get("success"):
                        raise Exception(result.get("message") or "图片生成失败")

                    item["status"] = "success"
                    item["output_path"] = result.get("image_path") or output_path
                    item["output_url"] = BatchReplacementManager._to_output_url(item["output_path"])
                    job["success_count"] += 1
                        
                except Exception as e:
                    print(f"[Batch] Item {index} failed: {e}")
                    item["status"] = "failed"
                    item["error"] = str(e)
                    job["failed_count"] += 1
                
                job["processed"] += 1

        # 逐个处理 (或者根据信号量并发)
        tasks = []
        for i, item in enumerate(job["items"]):
            tasks.append(process_one(i, item))
            
        await asyncio.gather(*tasks)
        
        job["status"] = "completed"
        print(f"[Batch] 任务 {job_id} 完成")

    @staticmethod
    def get_job(job_id: str):
        return BATCH_JOBS.get(job_id)

    @staticmethod
    def pause_job(job_id: str):
        """暂停任务"""
        if job_id in BATCH_JOBS:
            job = BATCH_JOBS[job_id]
            if job["status"] == "processing":
                job["status"] = "paused"
                return {"success": True, "message": "任务已暂停"}
        return {"success": False, "message": "任务不存在或无法暂停"}

    @staticmethod
    async def resume_job(job_id: str):
        """恢复任务"""
        if job_id in BATCH_JOBS:
            job = BATCH_JOBS[job_id]
            if job["status"] == "paused":
                job["status"] = "processing"
                asyncio.create_task(BatchReplacementManager._process_task(job_id))
                return {"success": True, "message": "任务已恢复"}
        return {"success": False, "message": "任务不存在或无法恢复"}

    @staticmethod
    def get_job_progress(job_id: str):
        """获取任务进度详情"""
        job = BATCH_JOBS.get(job_id)
        if not job:
            return None

        progress_percent = (job["processed"] / job["total"] * 100) if job["total"] > 0 else 0

        return {
            "job_id": job_id,
            "status": job["status"],
            "total": job["total"],
            "processed": job["processed"],
            "success_count": job["success_count"],
            "failed_count": job["failed_count"],
            "progress_percent": round(progress_percent, 2),
            "created_at": job["created_at"],
            "output_dir_name": job.get("output_dir_name")
        }

    @staticmethod
    def export_results(job_id: str):
        """导出任务结果为下载链接列表"""
        job = BATCH_JOBS.get(job_id)
        if not job:
            return {"error": "任务不存在"}

        results = []
        for item in job["items"]:
            if item.get("status") == "success" and item.get("output_url"):
                results.append({
                    "product_name": item.get("product_name"),
                    "download_url": item.get("output_url"),
                    "output_path": item.get("output_path")
                })

        return {
            "job_id": job_id,
            "total_success": len(results),
            "results": results
        }

batch_manager = BatchReplacementManager()
