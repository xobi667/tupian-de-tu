"""
Smart Excel Parser - 使用 Gemini 智能识别乱表格
自动理解任意格式的 Excel 并提取产品信息
"""
import httpx
import json
import pandas as pd
import os
from typing import List, Dict, Any, Optional
from ..config import config


async def smart_parse_excel(file_path: str, mode: str = "sku") -> List[Dict[str, Any]]:
    """
    使用 Gemini 智能解析任意格式的 Excel 文件
    
    Args:
        file_path: Excel/CSV 文件路径
        
    Returns:
        标准化的 SKU 数据列表
    """
    # 1. 读取原始数据
    ext = os.path.splitext(file_path)[1].lower()
    
    if ext in [".xlsx", ".xls"]:
        df = pd.read_excel(file_path, engine="openpyxl", header=None)
    elif ext == ".csv":
        for encoding in ["utf-8", "gbk", "gb2312", "utf-8-sig"]:
            try:
                df = pd.read_csv(file_path, encoding=encoding, header=None)
                break
            except UnicodeDecodeError:
                continue
    else:
        raise ValueError(f"不支持的文件格式: {ext}")
    
    # 2. 将表格转为文本给 Gemini 分析
    # 只取前 20 行作为样本（避免 token 过多）
    sample_rows = min(20, len(df))
    table_text = df.head(sample_rows).to_string(index=False, header=False)
    
    # 3. 调用 Gemini 分析表格结构
    analysis = await analyze_table_with_gemini(table_text, list(df.columns), mode)
    
    if not analysis.get("success"):
        print(f"[Smart Parser] Gemini 分析失败: {analysis.get('error')}")
        # 回退到简单解析
        return simple_fallback_parse(df, mode)
    
    # 4. 根据 Gemini 的分析提取数据
    return extract_products_by_analysis(df, analysis, mode)


async def analyze_table_with_gemini(table_text: str, columns: list, mode: str = "sku") -> Dict[str, Any]:
    """
    让 Gemini 分析表格结构，找出哪些列是产品信息
    """
    if mode == "replace":
        prompt = f"""You are a strict data processing machine. Your ONLY task is to return a valid JSON object.
DO NOT output any conversational text, markdown formatting (outside the JSON block), or explanations. 
DO NOT start with "Here is the analysis". Just the JSON.

Table Data (first 20 rows):
```
{table_text}
```

Analyze the headers and data to identify column indices (0-based) for:
1. "reference_image" (Keywords: 参考图, 底图, 背景, Ref, BG) - Must look like a file path
2. "product_image" (Keywords: 产品图, 原图, Product, Item) - Must look like a file path
3. "product_name" (Keywords: 品名, 名称, Name)
4. "custom_text" (Keywords: 文案, 标题, Text)
5. "requirements" (Keywords: 需求, 要求, Prompt)

Return STRICTLY this JSON format:
{{
    "header_row": 0 or null,
    "data_start_row": 1,
    "columns": {{
        "reference_image": index or null,
        "product_image": index or null, 
        "product_name": index or null,
        "custom_text": index or null,
        "requirements": index or null
    }},
    "detected_products": [] 
}}"""
    else:
        # SKU 模式 (原有的)
        prompt = f"""你是一个数据分析专家。请分析以下表格数据，识别出产品相关信息的位置。

表格内容 (前20行):
```
{table_text}
```

请分析这个表格，找出：
1. 哪一行是表头（如果有的话）？行号从0开始
2. 哪一列最可能是"产品名称"？
3. 哪一列最可能是"卖点/特点/描述"？
4. 哪一列最可能是"颜色"？
5. 哪一列最可能是"类别/分类"？
6. 数据从第几行开始？

请用JSON格式回复：
{{
    "header_row": 0或null（如果没有表头）,
    "data_start_row": 1,
    "columns": {{
        "product_name": 列索引或null,
        "selling_point": 列索引或null,
        "color": 列索引或null,
        "category": 列索引或null
    }},
    "detected_products": []
}}

如果某列不存在，设为null。列索引从0开始。只返回JSON。"""

    url = f"{config.YUNWU_BASE_URL}/v1beta/models/{config.GEMINI_FLASH_MODEL}:generateContent"
    
    headers = {
        "Authorization": f"Bearer {config.GEMINI_FLASH_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}]
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "topP": 0.8,
            "maxOutputTokens": 2000
        }
    }
    
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            
            result = response.json()
            
            if "candidates" in result and len(result["candidates"]) > 0:
                content = result["candidates"][0].get("content", {})
                parts = content.get("parts", [])
                if parts:
                    text = parts[0].get("text", "")
                    
                    # 尝试多种方式提取 JSON
                    # 1. 尝试提取 ```json ... ``` 块
                    import re
                    json_block = re.search(r'```json\s*(\{[\s\S]*?\})\s*```', text)
                    if not json_block:
                         # 2. 尝试提取 ``` ... ``` 块 (不带json标记)
                        json_block = re.search(r'```\s*(\{[\s\S]*?\})\s*```', text)
                        
                    if json_block:
                        json_str = json_block.group(1)
                    else:
                        # 3. 尝试直接提取最外层的 {}
                        # 注意：如果文本中有多个 {}，这种贪婪匹配可能会出错，但对于 structured output 通常还好
                        # 我们改用非贪婪匹配找到第一个看起来像 JSON 的大括号块
                        json_match = re.search(r'\{[\s\S]*\}', text)
                        json_str = json_match.group() if json_match else ""

                    if json_str:
                        try:
                            # 清理可能的注释 //
                            # json_str = re.sub(r'//.*', '', json_str) # 简单清理，小心误伤 url
                            parsed = json.loads(json_str)
                            parsed["success"] = True
                            print(f"[Smart Parser] Gemini 分析成功 ({mode}): {parsed.get('columns')}")
                            return parsed
                        except json.JSONDecodeError as je:
                             print(f"[Smart Parser] JSON Decode Error: {je} in {json_str[:100]}...")

            print(f"[Smart Parser] Gemini 分析无法解析 JSON: {text[:200]}...")
            return {"success": False, "error": "无法解析 Gemini 响应"}
            
    except Exception as e:
        return {"success": False, "error": str(e)}


def extract_products_by_analysis(df: pd.DataFrame, analysis: Dict[str, Any], mode: str = "sku") -> List[Dict[str, Any]]:
    """
    根据 Gemini 分析结果提取产品数据
    """
    products = []
    
    header_row = analysis.get("header_row")
    data_start = analysis.get("data_start_row", 1)
    columns = analysis.get("columns", {})
    
    # 如果 Gemini 提供了检测到的产品，直接使用
    detected = analysis.get("detected_products", [])
    if detected and len(detected) > 0:
        # Gemini 已经帮我们提取了，直接用
        for i, product in enumerate(detected):
            products.append({
                "id": str(i + 1),
                "product_name": product.get("product_name", ""),
                "selling_point": product.get("selling_point", ""),
                "color": product.get("color", ""),
                "category": product.get("category", "")
            })
        
        # 如果检测到的少于实际数据，继续用列索引提取
        if len(detected) < len(df) - data_start:
            products = extract_by_column_index(df, data_start, columns, mode)
    else:
        # 如果分析成功但 columns 为空 (或全是null)，尝试基于规则的 fallback
        if mode == "replace" and all(v is None for v in columns.values()):
            print("[Smart Parser] Gemini 返回全 null 列，尝试规则匹配...")
            columns = rule_based_column_match(df, analysis.get("header_row"), mode)
            
        products = extract_by_column_index(df, data_start, columns, mode)
    
    return products

def rule_based_column_match(
    df: pd.DataFrame, header_row: Optional[int], mode: str
) -> Dict[str, Optional[int]]:
    """基于规则匹配列名 (作为 AI 的备选)"""
    columns = {}
    if header_row is None:
        header_row = 0
    
    if header_row >= len(df):
        return columns
        
    headers = [str(x).strip() for x in df.iloc[header_row].tolist()]
    print(f"[Smart Parser] Rule Match Headers: {headers}")
    
    def find_col(keywords):
        for i, h in enumerate(headers):
            h_lower = h.lower()
            if any(str(k).lower() in h_lower for k in keywords):
                return i
        return None

    if mode == "replace":
        columns["reference_image"] = find_col(["参考", "底图", "背景", "ref", "bg"])
        columns["product_image"] = find_col(["产品", "商品", "原图", "prod", "item"])
        columns["product_name"] = find_col(["品名", "名称", "name", "title"])
        columns["custom_text"] = find_col(["文案", "标题", "text", "copy"])
        columns["requirements"] = find_col(["需求", "要求", "备注", "req", "prompt"])
    
    print(f"[Smart Parser] Rule Match Results: {columns}")
    return columns

def extract_by_column_index(df: pd.DataFrame, data_start: int, columns: Dict[str, Any], mode: str = "sku") -> List[Dict[str, Any]]:
    """
    根据列索引提取数据
    """
    products = []
    
    
    # 提取共有字段
    product_col = columns.get("product_name")
    
    # SKU 模式字段
    selling_col = columns.get("selling_point")
    color_col = columns.get("color")
    category_col = columns.get("category")
    
    # Replacement 模式字段
    ref_img_col = columns.get("reference_image")
    prod_img_col = columns.get("product_image")
    custom_text_col = columns.get("custom_text")
    requirements_col = columns.get("requirements")
    
    for idx in range(data_start, len(df)):
        row = df.iloc[idx]
        
        # 共有: 产品名称 (如果没有产品名，但在Replace模式下可能有图片，也算有效)
        product_name = ""
        if product_col is not None and product_col < len(row):
            product_name = str(row.iloc[product_col]) if pd.notna(row.iloc[product_col]) else ""
        
        # 基础数据结构
        product = {
            "id": str(idx + 1),
            "product_name": product_name
        }
        
        if mode == "sku":
            # SKU 模式逻辑...
            if not product_name or product_name == "nan":
                continue
                
            if selling_col is not None and selling_col < len(row):
                val = row.iloc[selling_col]
                product["selling_point"] = str(val) if pd.notna(val) else ""
            
            if color_col is not None and color_col < len(row):
                val = row.iloc[color_col]
                product["color"] = str(val) if pd.notna(val) else ""
            
            if category_col is not None and category_col < len(row):
                val = row.iloc[category_col]
                product["category"] = str(val) if pd.notna(val) else ""
                
        elif mode == "replace":
            # Replace 模式逻辑
            # 必须有参考图或产品图才算有效行
            has_images = False
            
            if ref_img_col is not None and ref_img_col < len(row):
                val = row.iloc[ref_img_col]
                if pd.notna(val):
                    product["reference_image"] = str(val).strip()
                    has_images = True
            
            if prod_img_col is not None and prod_img_col < len(row):
                val = row.iloc[prod_img_col]
                if pd.notna(val):
                    product["product_image"] = str(val).strip()
                    has_images = True
            
            if not has_images:
                continue
                
            if custom_text_col is not None and custom_text_col < len(row):
                val = row.iloc[custom_text_col]
                product["custom_text"] = str(val) if pd.notna(val) else ""
                
            if requirements_col is not None and requirements_col < len(row):
                val = row.iloc[requirements_col]
                product["requirements"] = str(val) if pd.notna(val) else ""
        
        products.append(product)
    
    return products


def simple_fallback_parse(df: pd.DataFrame, mode: str = "sku") -> List[Dict[str, Any]]:
    """
    简单回退：把第一列当产品名
    """
    products = []
    
    for idx, row in df.iterrows():
        if idx == 0:  # 跳过可能的表头
            continue
        
        product_name = str(row.iloc[0]) if pd.notna(row.iloc[0]) else ""
        if not product_name or product_name == "nan":
            continue
        
        product = {
            "id": str(idx),
            "product_name": product_name,
            "selling_point": str(row.iloc[1]) if len(row) > 1 and pd.notna(row.iloc[1]) else "",
            "color": "",
            "category": ""
        }
        products.append(product)
    
    return products
