"""
Xobi - 表格驱动的电商图像自动化流水线
FastAPI 主入口
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from .api import upload, batch, replace, agent
from .config import config


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时创建必要目录
    os.makedirs(os.path.abspath(config.INPUT_DIR), exist_ok=True)
    os.makedirs(os.path.abspath(config.OUTPUT_DIR), exist_ok=True)
    print(f"[Xobi] 输入目录: {os.path.abspath(config.INPUT_DIR)}")
    print(f"[Xobi] 输出目录: {os.path.abspath(config.OUTPUT_DIR)}")
    print("[Xobi] 服务已启动 [OK]")
    yield
    print("[Xobi] 服务已关闭")


# 创建 FastAPI 应用
app = FastAPI(
    title="Xobi - 电商图像自动化流水线",
    description="""
    电商主图智能替换系统
    
    核心功能:
    - 单图替换: 参考图 + 产品图 -> 新主图
    - 批量处理: Excel 驱动批量生成
    - Gemini Vision 智能分析构图风格
    - Gemini Image 高质量图片生成
    """,
    version="2.0.0",
    lifespan=lifespan
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # MVP 阶段允许所有来源
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(upload.router)
app.include_router(batch.router)
app.include_router(replace.router)
app.include_router(agent.router)  # 新增: 对话助手接口





@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy"}


# 挂载静态文件 (输出图片)
output_dir = os.path.abspath(config.OUTPUT_DIR)
if os.path.exists(output_dir):
    app.mount("/outputs", StaticFiles(directory=output_dir), name="outputs")

# 挂载前端页面 (放在最后，作为根路径)
# e:\xobi666\backend\app\main.py -> e:\xobi666\frontend
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../frontend"))
if os.path.exists(frontend_dir):
    print(f"[Xobi] 前端目录已挂载: {frontend_dir}")
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

