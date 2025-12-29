"""
Excel Parser - 解析 SKU 数据表格
支持 Excel (.xlsx) 和 CSV 文件
"""
import pandas as pd
import os
from typing import List, Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class SKUData:
    """SKU 数据结构"""
    id: str
    product_name: str
    selling_point: str = ""
    color: str = ""
    category: str = ""
    extra_fields: Dict[str, Any] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "product_name": self.product_name,
            "selling_point": self.selling_point,
            "color": self.color,
            "category": self.category,
            **(self.extra_fields or {})
        }


# 字段名映射 (支持中英文)
FIELD_MAPPINGS = {
    "product_name": ["product_name", "product", "name", "产品名称", "产品名", "商品名称", "商品名"],
    "selling_point": ["selling_point", "feature", "卖点", "核心卖点", "特点", "特性"],
    "color": ["color", "颜色", "色彩", "配色"],
    "category": ["category", "类别", "分类", "品类", "产品类别"]
}


def parse_excel(file_path: str) -> List[SKUData]:
    """
    解析 Excel 或 CSV 文件，提取 SKU 数据
    
    Args:
        file_path: 文件路径 (.xlsx, .xls, .csv)
        
    Returns:
        SKUData 列表
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"文件不存在: {file_path}")
    
    # 根据扩展名选择解析方式
    ext = os.path.splitext(file_path)[1].lower()
    
    if ext in [".xlsx", ".xls"]:
        df = pd.read_excel(file_path, engine="openpyxl")
    elif ext == ".csv":
        # 尝试多种编码
        for encoding in ["utf-8", "gbk", "gb2312", "utf-8-sig"]:
            try:
                df = pd.read_csv(file_path, encoding=encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ValueError(f"无法解析 CSV 文件编码: {file_path}")
    else:
        raise ValueError(f"不支持的文件格式: {ext}")
    
    # 标准化列名
    df = _normalize_columns(df)
    
    # 转换为 SKUData 列表
    sku_list = []
    for idx, row in df.iterrows():
        sku = _row_to_sku(row, str(idx + 1))
        if sku:
            sku_list.append(sku)
    
    print(f"[Excel Parser] 解析完成: {len(sku_list)} 条有效 SKU")
    return sku_list


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """标准化列名，映射中英文"""
    column_map = {}
    
    for standard_name, aliases in FIELD_MAPPINGS.items():
        for col in df.columns:
            col_lower = str(col).lower().strip()
            if col_lower in [a.lower() for a in aliases]:
                column_map[col] = standard_name
                break
    
    # 应用列名映射
    df = df.rename(columns=column_map)
    return df


def _row_to_sku(row: pd.Series, default_id: str) -> Optional[SKUData]:
    """将 DataFrame 行转换为 SKUData"""
    # 获取产品名称 (必填)
    product_name = _get_field(row, "product_name")
    if not product_name:
        return None
    
    # 获取 ID (如果有)
    sku_id = _get_field(row, "id") or _get_field(row, "sku_id") or _get_field(row, "sku") or default_id
    
    # 获取其他字段
    extra_fields = {}
    standard_fields = {"id", "product_name", "selling_point", "color", "category"}
    for col, value in row.items():
        if col not in standard_fields and pd.notna(value):
            extra_fields[str(col)] = str(value)
    
    return SKUData(
        id=str(sku_id),
        product_name=str(product_name),
        selling_point=str(_get_field(row, "selling_point") or ""),
        color=str(_get_field(row, "color") or ""),
        category=str(_get_field(row, "category") or ""),
        extra_fields=extra_fields if extra_fields else None
    )


def _get_field(row: pd.Series, field_name: str) -> Optional[str]:
    """安全获取字段值"""
    if field_name in row.index:
        value = row[field_name]
        if pd.notna(value):
            return str(value).strip()
    return None


def validate_excel_structure(file_path: str) -> Dict[str, Any]:
    """
    验证 Excel 文件结构，返回预览信息
    
    Returns:
        {
            "valid": bool,
            "total_rows": int,
            "columns": list,
            "mapped_columns": dict,
            "errors": list,
            "preview": list  # 前3行预览
        }
    """
    try:
        ext = os.path.splitext(file_path)[1].lower()
        
        if ext in [".xlsx", ".xls"]:
            df = pd.read_excel(file_path, engine="openpyxl", nrows=10)
        elif ext == ".csv":
            df = pd.read_csv(file_path, nrows=10)
        else:
            return {"valid": False, "errors": [f"不支持的文件格式: {ext}"]}
        
        # 检查必需列
        df_normalized = _normalize_columns(df)
        has_product_name = "product_name" in df_normalized.columns
        
        errors = []
        if not has_product_name:
            errors.append("缺少必需列: product_name (产品名称)")
        
        # 构建映射信息
        mapped = {}
        for standard, aliases in FIELD_MAPPINGS.items():
            for col in df.columns:
                if str(col).lower().strip() in [a.lower() for a in aliases]:
                    mapped[standard] = col
                    break
        
        return {
            "valid": has_product_name,
            "total_rows": len(pd.read_excel(file_path) if ext in [".xlsx", ".xls"] else pd.read_csv(file_path)),
            "columns": list(df.columns),
            "mapped_columns": mapped,
            "errors": errors,
            "preview": df.head(3).to_dict(orient="records")
        }
        
    except Exception as e:
        return {
            "valid": False,
            "errors": [str(e)]
        }
