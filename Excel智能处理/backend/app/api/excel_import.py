"""
Excel/CSV 批量导入导出 API
支持电商表格批量处理
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.responses import JSONResponse as FastAPIJSONResponse
from pydantic import BaseModel
import pandas as pd
import openpyxl
from openpyxl import Workbook
import os
import uuid
from datetime import datetime
from typing import Optional
import logging
import json
import math
import numpy as np


class SafeJSONResponse(FastAPIJSONResponse):
    """自定义JSON响应，处理numpy/pandas类型"""

    def render(self, content) -> bytes:
        def default_encoder(obj):
            """处理特殊类型"""
            try:
                if obj is None:
                    return ''
                elif pd.isna(obj):
                    return ''
                elif isinstance(obj, (np.integer, np.int64, np.int32)):
                    return int(obj)
                elif isinstance(obj, (np.floating, np.float64, np.float32, float)):
                    if math.isnan(obj) or math.isinf(obj):
                        return ''
                    return float(obj)
                elif isinstance(obj, np.ndarray):
                    return obj.tolist()
                elif isinstance(obj, (np.bool_, bool)):
                    return bool(obj)
            except (TypeError, ValueError):
                return ''
            raise TypeError(f"Type {type(obj)} not serializable")

        # 递归清理content中的所有NaN值
        def deep_clean(obj):
            if isinstance(obj, dict):
                return {str(k): deep_clean(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [deep_clean(item) for item in obj]
            elif obj is None:
                return ''
            elif isinstance(obj, (np.floating, np.float64, np.float32)):
                try:
                    if np.isnan(obj) or np.isinf(obj):
                        return ''
                    return float(obj)
                except:
                    return ''
            elif isinstance(obj, float):
                try:
                    if math.isnan(obj) or math.isinf(obj):
                        return ''
                    return obj
                except:
                    return ''
            elif isinstance(obj, (np.integer, np.int64, np.int32)):
                return int(obj)
            else:
                # 最后尝试检查是否为pandas NA
                try:
                    if pd.isna(obj):
                        return ''
                except:
                    pass
                return obj

        cleaned_content = deep_clean(content)

        return json.dumps(
            cleaned_content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            default=default_encoder,
            separators=(",", ":"),
        ).encode("utf-8")

router = APIRouter(tags=["Excel导入导出"])
logger = logging.getLogger(__name__)

# 临时文件存储目录
TEMP_DIR = os.path.abspath("./data/temp_uploads")
OUTPUT_DIR = os.path.abspath("./data/outputs")
os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)


def clean_for_json(obj):
    """递归清理对象中的NaN值以确保JSON序列化"""
    if isinstance(obj, dict):
        return {str(k): clean_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_for_json(item) for item in obj]
    elif obj is None:
        return ''
    elif isinstance(obj, (float, np.floating)):
        # 检查是否为NaN或无穷大
        try:
            if math.isnan(obj) or math.isinf(obj):
                return ''
        except (TypeError, ValueError):
            pass
        return float(obj)
    elif isinstance(obj, (np.integer, np.int64, np.int32)):
        return int(obj)
    elif isinstance(obj, np.ndarray):
        return clean_for_json(obj.tolist())
    else:
        # 最后检查是否为pandas NA值
        try:
            if pd.isna(obj):
                return ''
        except (TypeError, ValueError):
            pass
        return obj


class ColumnMapping(BaseModel):
    """字段映射配置"""
    skuid_column: Optional[str] = None
    title_column: Optional[str] = None
    image_column: Optional[str] = None
    price_column: Optional[str] = None
    category_column: Optional[str] = None
    # 可选：新字段列名
    new_title_column: str = "新标题"
    new_image_column: str = "新图片URL"


class ParseRequest(BaseModel):
    """解析请求"""
    file_id: str
    mapping: ColumnMapping


class ExportRequest(BaseModel):
    """导出请求"""
    file_id: str
    data: list  # 处理后的数据


@router.post("/api/excel/upload")
async def upload_excel(file: UploadFile = File(...)):
    """
    上传 Excel/CSV 文件并返回预览数据

    支持格式:
    - .xlsx
    - .csv
    - .xls (需要xlrd)

    返回:
    - file_id: 文件唯一标识（用于后续操作）
    - columns: 列名列表
    - preview_rows: 前10行数据
    - total_rows: 总行数
    """
    try:
        # 生成唯一文件ID
        file_id = f"batch_{uuid.uuid4().hex[:8]}"
        file_ext = os.path.splitext(file.filename)[1].lower()

        # 保存上传的文件
        file_path = os.path.join(TEMP_DIR, f"{file_id}{file_ext}")
        content = await file.read()

        with open(file_path, 'wb') as f:
            f.write(content)

        logger.info(f"[Excel上传] 文件已保存: {file_path}")

        # 解析文件
        if file_ext == '.csv':
            df = pd.read_csv(file_path, encoding='utf-8-sig')
        elif file_ext in ['.xlsx', '.xls']:
            df = pd.read_excel(file_path)
        else:
            raise HTTPException(status_code=400, detail=f"不支持的文件格式: {file_ext}")

        # 提取列名，确保处理NaN列名
        columns = []
        for col in df.columns:
            if pd.isna(col):
                columns.append("")
            else:
                columns.append(str(col))

        # 使用pandas的to_dict方法，然后清理
        preview_rows = []
        for i in range(min(10, len(df))):
            row_dict = {}
            for j, col_name in enumerate(columns):
                try:
                    val = df.iloc[i, j]
                    # 使用更严格的NaN检测
                    cleaned_val = ""
                    try:
                        if pd.isna(val):
                            cleaned_val = ""
                        elif isinstance(val, bool):
                            cleaned_val = val
                        elif isinstance(val, (int, np.integer)):
                            cleaned_val = int(val)
                        elif isinstance(val, (float, np.floating)):
                            # 必须先检查NaN再转换
                            if math.isnan(float(val)) or math.isinf(float(val)):
                                cleaned_val = ""
                            else:
                                cleaned_val = float(val)
                        else:
                            cleaned_val = str(val) if val else ""
                    except:
                        cleaned_val = ""

                    row_dict[col_name] = cleaned_val
                except Exception as e:
                    logger.warning(f"处理单元格[{i},{j}]时出错: {e}")
                    row_dict[col_name] = ""
            preview_rows.append(row_dict)

        # 总行数
        total_rows = int(len(df))

        logger.info(f"[Excel上传] 解析成功: {total_rows} 行, {len(columns)} 列")

        # 最后一次检查：确保所有数据都是JSON安全的
        response = {
            "success": True,
            "file_id": str(file_id),
            "filename": str(file.filename),
            "columns": columns,  # 已经是字符串列表
            "preview_rows": preview_rows,  # 已手动清理
            "total_rows": total_rows,  # 整数
            "message": f"成功上传 {file.filename}，共 {total_rows} 行数据"
        }

        logger.info(f"[Excel上传] 返回响应，preview_rows数量: {len(preview_rows)}")

        # 最终验证：检查preview_rows中是否有NaN
        for i, row in enumerate(preview_rows):
            for key, val in row.items():
                try:
                    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                        logger.error(f"发现NaN值! row={i}, key={key}, val={val}")
                        preview_rows[i][key] = ""
                except:
                    pass

        # 直接使用json.dumps，设置allow_nan=False来捕获任何遗漏的NaN
        try:
            json_str = json.dumps(response, ensure_ascii=False, allow_nan=False)
            return Response(content=json_str, media_type="application/json")
        except ValueError as e:
            # 如果还有NaN，使用ultra_clean深度清理
            logger.warning(f"首次序列化失败: {e}，使用深度清理")

            def ultra_clean(obj):
                if isinstance(obj, dict):
                    return {str(k): ultra_clean(v) for k, v in obj.items()}
                elif isinstance(obj, list):
                    return [ultra_clean(item) for item in obj]
                elif isinstance(obj, str):
                    return obj
                elif isinstance(obj, bool):
                    return obj
                elif isinstance(obj, int):
                    return obj
                elif obj is None:
                    return ""
                else:
                    try:
                        if pd.isna(obj):
                            return ""
                        if isinstance(obj, float):
                            if math.isnan(obj) or math.isinf(obj):
                                return ""
                            return obj
                        return str(obj)
                    except:
                        return ""

            cleaned_response = ultra_clean(response)
            json_str = json.dumps(cleaned_response, ensure_ascii=False, allow_nan=False)
            return Response(content=json_str, media_type="application/json")
        except Exception as e:
            logger.error(f"JSON序列化失败: {str(e)}")
            logger.error(f"Response结构: {type(response)}, keys: {response.keys() if isinstance(response, dict) else 'N/A'}")
            raise HTTPException(status_code=500, detail=f"数据序列化失败: {str(e)}")

    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="文件为空或格式错误")
    except Exception as e:
        logger.error(f"[Excel上传] 失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"文件处理失败: {str(e)}")


@router.post("/api/excel/parse")
async def parse_excel(request: ParseRequest):
    """
    解析 Excel 文件，提取完整数据

    根据用户指定的字段映射，提取所有行数据。
    支持:
    - 多图URL解析（逗号分隔）
    - 数据类型转换
    - 缺失值处理
    """
    try:
        # 查找文件
        file_pattern = os.path.join(TEMP_DIR, f"{request.file_id}.*")
        import glob
        files = glob.glob(file_pattern)

        if not files:
            raise HTTPException(status_code=404, detail="文件不存在或已过期")

        file_path = files[0]
        file_ext = os.path.splitext(file_path)[1].lower()

        # 读取文件
        if file_ext == '.csv':
            df = pd.read_csv(file_path, encoding='utf-8-sig')
        else:
            df = pd.read_excel(file_path)

        # CRITICAL: 立即清理所有NaN/inf值
        df = df.fillna('').replace([np.inf, -np.inf], '')

        logger.info(f"[Excel解析] 开始解析: {file_path}")

        # 构建数据列表
        result_data = []

        for idx, row in df.iterrows():
            item = {}

            # 提取基础字段
            mapping = request.mapping
            if mapping.skuid_column:
                item['skuid'] = str(row.get(mapping.skuid_column, '')).strip()

            if mapping.title_column:
                item['title'] = str(row.get(mapping.title_column, '')).strip()

            if mapping.image_column:
                image_str = str(row.get(mapping.image_column, '')).strip()
                # 解析多图URL（逗号分隔）
                if image_str:
                    item['images'] = [url.strip() for url in image_str.split(',') if url.strip()]
                    item['main_image'] = item['images'][0] if item['images'] else ''
                else:
                    item['images'] = []
                    item['main_image'] = ''

            if mapping.price_column:
                try:
                    item['price'] = float(row.get(mapping.price_column, 0))
                except:
                    item['price'] = 0

            if mapping.category_column:
                item['category'] = str(row.get(mapping.category_column, '')).strip()

            # 保留原始行数据（用于导出，NaN已经被清理）
            item['_original'] = row.to_dict()
            item['_row_index'] = int(idx)

            result_data.append(item)

        logger.info(f"[Excel解析] 完成: 共 {len(result_data)} 条数据")

        response = {
            "success": True,
            "data": result_data,
            "total": len(result_data),
            "message": f"成功解析 {len(result_data)} 条商品数据"
        }

        # 手动序列化
        try:
            def ultra_clean(obj):
                if isinstance(obj, dict):
                    return {str(k): ultra_clean(v) for k, v in obj.items()}
                elif isinstance(obj, list):
                    return [ultra_clean(item) for item in obj]
                elif isinstance(obj, str):
                    return obj
                elif isinstance(obj, bool):
                    return obj
                elif isinstance(obj, int):
                    return obj
                elif obj is None:
                    return ""
                else:
                    try:
                        if pd.isna(obj):
                            return ""
                        if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
                            return ""
                        return str(obj)
                    except:
                        return str(obj)

            cleaned_response = ultra_clean(response)
            json_str = json.dumps(cleaned_response, ensure_ascii=False)
            return Response(content=json_str, media_type="application/json")
        except Exception as e:
            logger.error(f"JSON序列化失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"数据序列化失败: {str(e)}")

    except Exception as e:
        logger.error(f"[Excel解析] 失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"解析失败: {str(e)}")


@router.post("/api/excel/export")
async def export_excel(request: ExportRequest):
    """
    导出处理后的数据为 Excel 文件

    接收前端传来的处理后数据，生成新的Excel文件。
    新Excel包含:
    - 原始列
    - 新标题列
    - 新图片URL列
    """
    try:
        # 查找原始文件
        file_pattern = os.path.join(TEMP_DIR, f"{request.file_id}.*")
        import glob
        files = glob.glob(file_pattern)

        if not files:
            raise HTTPException(status_code=404, detail="原始文件不存在")

        file_path = files[0]
        file_ext = os.path.splitext(file_path)[1].lower()

        # 读取原始文件
        if file_ext == '.csv':
            df_original = pd.read_csv(file_path, encoding='utf-8-sig')
        else:
            df_original = pd.read_excel(file_path)

        logger.info(f"[Excel导出] 开始导出: {len(request.data)} 条数据")

        # 创建新的DataFrame
        df_export = df_original.copy()

        # 添加新列
        df_export['新标题'] = ''
        df_export['新图片URL'] = ''
        df_export['处理状态'] = ''

        # 更新数据
        for item in request.data:
            row_idx = item.get('_row_index')
            if row_idx is not None and row_idx < len(df_export):
                if 'new_title' in item:
                    df_export.at[row_idx, '新标题'] = item['new_title']
                if 'new_image' in item:
                    df_export.at[row_idx, '新图片URL'] = item['new_image']
                if 'status' in item:
                    df_export.at[row_idx, '处理状态'] = item['status']

        # 生成输出文件
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"processed_{request.file_id}_{timestamp}.xlsx"
        output_path = os.path.join(OUTPUT_DIR, output_filename)

        # 保存为Excel
        df_export.to_excel(output_path, index=False, engine='openpyxl')

        logger.info(f"[Excel导出] 成功: {output_path}")

        return {
            "success": True,
            "filename": output_filename,
            "download_url": f"/outputs/{output_filename}",
            "message": "导出成功"
        }

    except Exception as e:
        logger.error(f"[Excel导出] 失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"导出失败: {str(e)}")


@router.get("/api/excel/download/{filename}")
async def download_excel(filename: str):
    """下载导出的Excel文件"""
    file_path = os.path.join(OUTPUT_DIR, filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")

    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


@router.delete("/api/excel/cleanup/{file_id}")
async def cleanup_temp_files(file_id: str):
    """清理临时文件"""
    try:
        file_pattern = os.path.join(TEMP_DIR, f"{file_id}.*")
        import glob
        files = glob.glob(file_pattern)

        for file_path in files:
            os.remove(file_path)
            logger.info(f"[清理] 已删除临时文件: {file_path}")

        return {"success": True, "message": "临时文件已清理"}

    except Exception as e:
        logger.error(f"[清理] 失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"清理失败: {str(e)}")
