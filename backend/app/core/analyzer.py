"""
Analyzer Module - 使用 Gemini Vision 分析图片
分析参考主图和产品图，提取构图、风格、产品信息
"""
import httpx
import base64
import json
import os
import re
import asyncio
from typing import Dict, Any, Optional
from ..config import config


async def analyze_reference_image(image_path: str) -> Dict[str, Any]:
    """分析参考主图，提取构图、风格、场景信息"""
    abs_path = os.path.abspath(image_path)
    print(f"DEBUG: Analyzer checking reference path: {abs_path}")
    
    prompt = """请深度解析这张参考主图，严格返回JSON（只输出JSON，不要解释、不要Markdown）。需要覆盖多维度反向提炼：
{
    "subject": {
        "type": "主体类型/类别",
        "pose_state": "姿态/状态/动作",
        "key_traits": ["核心特征或卖点"]
    },
    "environment": {
        "scene": "场景与空间结构描述",
        "foreground_background": "前景/中景/背景层次与景深",
        "props": ["主要道具/装饰"],
        "cleanliness": "整洁/极简/复杂/杂物"
    },
    "art_style": {
        "style_keywords": ["艺术或设计风格，如赛博、胶片、商业摄影"],
        "finish": "写实/插画/合成/写真感"
    },
    "color_light": {
        "main_colors": ["主色调"],
        "accent_colors": ["点缀色"],
        "lighting": "光源类型与方向、硬度、色温",
        "mood": "氛围/情绪"
    },
    "composition_camera": {
        "composition": "居中/对角线/三分法/左右/上下",
        "product_position": "center/left/right/top/bottom",
        "product_size_ratio": 0.0-1.0,
        "camera_angle": "俯拍/仰拍/平视/微俯/微仰",
        "lens": "广角/标准/长焦/微距/鱼眼",
        "fov_or_focal": "视角或等效焦距",
        "depth_of_field": "景深强度/虚实关系"
    },
    "style": {
        "background_type": "纯色/渐变/实景/合成场景",
        "main_colors": ["主色调描述"],
        "lighting": "柔光/硬光/自然光/舞台光",
        "overall_mood": "简约/活力/高端/温馨"
    },
    "scene_elements": ["画面中的装饰/道具列表"],
    "materials_textures": {
        "key_materials": ["金属/玻璃/塑料/织物/皮革等"],
        "surface_detail": "纹理/拉丝/磨砂/反光/透明度"
    },
    "text_areas": [
        {
            "position": "位置描述",
            "content": "文字内容",
            "style": "字体风格、颜色、描边/阴影"
        }
    ],
    "geometry": {
        "dimensions_text": "如有OCR到的尺寸/数量标注，填入；否则null",
        "perspective_notes": "透视/消失点/地平线简述"
    },
    "original_product": "识别出的原产品名称",
    "original_product_category": "产品类别"
}"""

    return await _analyze_image_with_gemini(abs_path, prompt)


async def analyze_product_image(image_path: str) -> Dict[str, Any]:
    """分析产品图，识别产品信息和特征"""
    abs_path = os.path.abspath(image_path)
    print(f"DEBUG: Analyzer checking product path: {abs_path}")
    
    prompt = """请深度解析这张产品图，严格返回JSON（只输出JSON，不要解释、不要Markdown），多维度提炼：
{
    "product_type": "具体产品名称",
    "category": "产品大类",
    "shape": "形状/结构/开口位置/按钮接口分布",
    "features": ["外观特征", "功能或卖点"],
    "materials": ["金属/玻璃/塑料/织物/皮革等"],
    "surface_finish": "镜面/拉丝/磨砂/软胶/透明度",
    "defects": ["噪点/划痕/脏污/摩尔纹/压缩痕迹，如无写null"],
    "main_colors": ["主体颜色"],
    "accent_colors": ["点缀色"],
    "style_keywords": ["复古/现代/极简/科技/户外等"],
    "lighting": "原图光源方向/硬度/色温",
    "camera_view": "俯拍/仰拍/平视/微距/长焦等",
    "suggested_scenes": ["适合该产品的场景建议"],
    "suggested_copy": ["营销文案建议"],
    "text_detection": ["若有文字/Logo/OCR结果，否则空数组"]
}"""

    return await _analyze_image_with_gemini(abs_path, prompt)


async def generate_replacement_prompt(
    reference_analysis: Dict[str, Any],
    product_analysis: Dict[str, Any],
    custom_text: Optional[str] = None,
    generation_params: Optional[Dict[str, Any]] = None,
) -> str:
    """
    v4 Prompt 生成：结合草图流程，固定提示词 + 机器人建议 + 用户/参数补充 + 参考/产品分析
    """
    def _join(values, default=""):
        if isinstance(values, list):
            vals = [str(v) for v in values if v]
            return ", ".join(vals) if vals else default
        return str(values) if values else default

    layout = reference_analysis.get("layout", {})
    style = reference_analysis.get("style", {})
    product = product_analysis.get("product_type", "产品")
    category = product_analysis.get("category", "商品")
    features = product_analysis.get("features", [])
    materials = product_analysis.get("materials", [])
    colors = product_analysis.get("main_colors", [])
    defects = product_analysis.get("defects", [])
    ref_main_colors = style.get("main_colors", [])
    ref_lighting = style.get("lighting", "")
    text_areas = reference_analysis.get("text_areas", [])

    robot_suggestions = [
        f"构图遵循参考：{layout.get('composition', '居中/三分/对角')}，主体放在 {layout.get('product_position', 'center')}，占比约 {layout.get('product_size_ratio', 0.5)*100:.0f}%",
        f"光影匹配：保持参考光源“{ref_lighting or '主光+辅光'}”方向/色温，重建AO与接触影，避免悬浮",
        f"色调贴合：沿用参考主色 { _join(ref_main_colors, '暖冷对比') }，产品色可微调但需和谐不偏色",
        f"材质强化：突出产品材质 { _join(materials, '真实材质') }，修复缺陷 { _join(defects, '污点/划痕需清理') }，抗锯齿",
        f"文字布局：沿用参考文字区域 { _join([t.get('position') for t in text_areas], '参考图文字区域') }，字体/描边/阴影跟参考一致；无文案则移除所有文字",
    ]

    params = generation_params or {}
    param_lines = []
    quality_map = {"1K": "HD (1K+)", "2K": "2K ultra clear", "4K": "4K ultra clear"}
    if params.get("quality"):
        param_lines.append(f"质量：{quality_map.get(params['quality'], params['quality'])}")
    if params.get("aspect_ratio") and params["aspect_ratio"] != "auto":
        param_lines.append(f"宽高比：{params['aspect_ratio']}，构图并裁剪到此比例")
    if params.get("platform"):
        param_lines.append(f"平台：{params['platform']} 电商主图要求")
    if params.get("image_type"):
        param_lines.append(f"版式：{params['image_type']}")
    if params.get("image_style") and params["image_style"] not in ("自动", "auto"):
        param_lines.append(f"视觉风格：{params['image_style']}")
    if params.get("background_type"):
        param_lines.append(f"背景偏好：{params['background_type']}，但产品保持主导")
    language_map = {"zh-CN": "Simplified Chinese", "zh-TW": "Traditional Chinese", "EN": "English", "JP": "Japanese"}
    if params.get("language"):
        param_lines.append(f"文字语言：{language_map.get(params['language'], params['language'])}")

    user_copy = custom_text or "无文案时，移除所有文字保持纯净"
    param_text = "； ".join(param_lines) if param_lines else "使用默认参数（1:1，1K）"

    prompt = f"""
[VERSION] Xobi Replace v4

[参考图快照]
- 构图/机位：{layout.get('composition', '居中/三分/对角')}，主体位置 {layout.get('product_position', 'center')}，占比约 {layout.get('product_size_ratio', 0.5)*100:.0f}%
- 背景/色调：{style.get('background_type', '纯色/渐变/实景/合成')}；主色 { _join(ref_main_colors, '未识别') }；氛围 {style.get('overall_mood', '商业干净')}
- 光源：{ref_lighting or '主光+辅光'}；景深 {layout.get('depth_of_field', '遵循参考虚实')}；文字区 { _join([t.get('position') for t in text_areas], '参考文字区') }

[产品图快照]
- 主体：{product}（{category}），特征：{ _join(features, '简洁外观') }
- 材质/表面：{ _join(materials, '真实材质') }；主色：{ _join(colors, '参考产品本色') }；缺陷：{ _join(defects, '需清洁/修复') }
- 视角/比例：保持原始透视与比例，禁止拉伸/变形

[固定提示词｜一致性/精修/合成]
- 先做商业级精修：去手/杂物/噪点/褶皱/污渍，修缝线与纹理，抗锯齿，补AO与接触影，真实材质高光/反射/粗糙度
- 保持产品真实形态与比例，不改结构；重建缺失部位；避免悬浮，贴合参考地面/桌面
- 继承参考的构图、光影、色调、景深；仅替换主体，其余背景/道具/光影/色调 100% 贴合参考
- 若有文案，放在参考文字区，字体/描边/阴影/颜色跟参考一致；无文案则移除所有文字/Logo/水印
- 输出必须为可直接生图的中文提示词，无标题/解释/Markdown

[机器人建议｜针对本次素材]
- {robot_suggestions[0]}
- {robot_suggestions[1]}
- {robot_suggestions[2]}
- {robot_suggestions[3]}
- {robot_suggestions[4]}

[用户/参数上下文]
- 文案/话术：{user_copy}
- 参数：{param_text}

[输出要求]
- 先按上方精修后再合成；保持参考图构图光影；文字使用用户文案或移除
- 直接输出最终生图 Prompt，一行或分段均可，无解释
"""

    return prompt
async def _analyze_image_with_gemini(image_path: str, prompt: str) -> Dict[str, Any]:
    """
    调用 Gemini Vision API 分析图片
    """
    # 读取图片并转为 base64
    abs_path = os.path.abspath(image_path)
    print(f"[Analyzer] 尝试读取图片: {abs_path}")
    
    if not os.path.exists(abs_path):
        print(f"[Analyzer] !!! 图片不存在: {abs_path}")
        return {"error": f"图片不存在: {abs_path}"}
    
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")
    
    # 根据扩展名判断 MIME 类型
    ext = os.path.splitext(image_path)[1].lower()
    mime_type = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp"
    }.get(ext, "image/png")
    
    # 使用 OpenAI 兼容格式的识图接口
    url = f"{config.get_base_url()}/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {config.get_api_key('flash')}",
        "Content-Type": "application/json"
    }

    # 构建 multimodal content (text + image)
    payload = {
        "model": config.get_model('flash'),
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{image_data}"
                    }
                }
            ]
        }],
        "temperature": 0.2,
        "max_tokens": 2000
    }

    # 增加重试与超时，减少短暂网络波动导致的失败
    attempts = 3
    for attempt in range(attempts):
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                print(f"[Analyzer] 分析图片(尝试 {attempt + 1}/{attempts}): {os.path.basename(image_path)} -> {url}")
                response = await client.post(url, headers=headers, json=payload)
                if response.status_code != 200:
                    print(f"[Analyzer][HTTP {response.status_code}] {response.text[:500]}")
                    response.raise_for_status()
                
                result = response.json()

                # 使用 OpenAI 兼容格式的响应解析
                if "choices" in result and len(result["choices"]) > 0:
                    content = result["choices"][0]["message"]["content"]
                    # 宽松返回：直接把 content 回传给上层，避免因格式差异报错
                    if isinstance(content, dict):
                        print(f"[Analyzer] 分析完成(dict): {list(content.keys())}")
                        return content
                    else:
                        print(f"[Analyzer] 分析完成(raw str), len={len(str(content))}")
                        return {"raw": str(content)}
                
                return {"error": "无有效choices返回", "raw": str(result)[:500]}
            
        except httpx.TimeoutException as e:
            print(f"[Analyzer] 超时，尝试 {attempt + 1}/{attempts}: {e}")
            if attempt < attempts - 1:
                await asyncio.sleep(1 * (attempt + 1))
                continue
            return {"error": f"分析超时({attempts}次): {e}"}
        except Exception as e:
            import traceback
            print(f"[Analyzer] 分析失败: {e}")
            traceback.print_exc()
            if attempt < attempts - 1:
                await asyncio.sleep(1 * (attempt + 1))
                continue
            return {"error": str(e)}
