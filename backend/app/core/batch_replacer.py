
import asyncio
import os
import uuid
import datetime
import pandas as pd
from typing import Dict, List, Any, Optional
from .replacer import quick_replace
from ..utils.smart_parser import smart_parse_excel

# 全局存储批量任务状态 (内存中)
BATCH_JOBS: Dict[str, Dict[str, Any]] = {}

class BatchReplacementManager:
    """批量替换任务管理器"""
    
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
            "output_dir": f"data/outputs/batch_{job_id[:8]}"
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
        
        semaphore = asyncio.Semaphore(1) # 限制并发数，避免 API 限流
        
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
                    prod_name = item.get("product_name", f"item_{index}")
                    custom_text = item.get("custom_text", "")
                    
                    # 调用单个替换逻辑
                    # 注意: quick_replace 是同步/异步? analyzer 和 replacer 内部是用 httpx async 的
                    # 但 quick_replace 封装可能不是 async。让我们检查 replacer.py
                    # 假设 quick_replace 还是同步封装的 (虽然它内部用了 async loop run) 
                    # 最好直接调用 analyzer 和 replacer 的 async 方法，或者修改 quick_replace 为 async
                    # 既然已经有 quick_replace，我们直接复用相关逻辑，但最好重写为 async 以支持真正的异步并发
                    
                    # 暂时为了稳妥，我们调用 quick_replace_async (我们需要在 replacer.py 里暴露一个 async 版本)
                    # 如果 replacer.py 没有 async 版本，我们就在这里直接用 analyzer/replacer 的类
                    
                    from .analyzer import analyze_reference_image, analyze_product_image, generate_replacement_prompt
                    from .replacer import generate_image
                    
                    # 1. 分析
                    ref_analysis = await analyze_reference_image(ref_img)
                    prod_analysis = await analyze_product_image(prod_img)
                    
                    if "error" in ref_analysis or "error" in prod_analysis:
                        raise Exception("AI 分析失败")

                    # 2. 生成 Prompt
                    final_prompt, debug_prompt = generate_replacement_prompt(
                        ref_analysis, 
                        prod_analysis, 
                        custom_text=custom_text
                    )
                    
                    # 注入额外需求
                    if item.get("requirements"):
                        final_prompt += f"\n\nAdditional Requirements: {item.get('requirements')}"

                    # 3. 生成图片
                    timestamp = datetime.datetime.now().strftime("%H%M%S")
                    safe_name = "".join([c for c in prod_name if c.isalnum() or c in (' ','-','_')]).strip()
                    output_filename = f"{safe_name}_{timestamp}.png"
                    save_path = os.path.join(output_dir, output_filename)
                    
                    images = [prod_img, ref_img] # Gemini 顺序: 产品, 参考
                    
                    generated_path = await generate_image(images, final_prompt, save_path)
                    
                    if generated_path:
                        item["status"] = "success"
                        item["output_path"] = generated_path
                        job["success_count"] += 1
                    else:
                        raise Exception("图片生成失败")
                        
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

batch_manager = BatchReplacementManager()
