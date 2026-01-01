"""
Replacer Module - 使用 Gemini Image 生成替换后的主图
结合参考图风格和产品图，生成新的电商主图
"""
import httpx
import base64
import os
import time
from typing import Dict, Any, Optional
from ..config import config
from .image_processor import crop_to_aspect_ratio


class ReplacerError(Exception):
    """图片替换生成错误"""
    pass


async def generate_replacement_image(
    product_image_path: str,
    reference_image_path: str,
    generation_prompt: str,
    custom_text: Optional[str] = None,
    copy_style_hint: Optional[str] = None,
    output_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    生成替换后的电商主图
    
    使用 Gemini Image 的多图参考能力：
    - 参考图提供构图风格
    - 产品图提供产品外观
    - Prompt 指导生成
    
    Args:
        product_image_path: 产品图路径
        reference_image_path: 参考主图路径
        generation_prompt: 生成用的 Prompt
        custom_text: 自定义文案
        output_path: 输出路径（可选）
        
    Returns:
        {
            "success": bool,
            "image_path": str,
            "image_data": base64 str,
            "message": str
        }
    """
    # 读取两张图片
    product_image = await _load_image(product_image_path)
    reference_image = await _load_image(reference_image_path)
    
    if not product_image or not reference_image:
        return {
            "success": False,
            "image_path": None,
            "image_data": None,
            "message": "无法加载图片"
        }

    # ---- Sanitize/shorten prompt for image model，默认支持自动文案 ----
    safe_prompt = generation_prompt
    if custom_text:
        safe_prompt += f"\n仅在画面中加入以下文案，且无其他文字或水印：{custom_text}"
        if copy_style_hint:
            safe_prompt += f"\n排版与字体风格：{copy_style_hint}"
    else:
        # 若无文案，仍提醒不要额外文字
        safe_prompt += "\n请勿在画面中加入任何文字/Logo/水印。"

    # 始终启用精修：绑定上传的“精修参考”风格，强制先做精修再合成
    safe_prompt += """
【MANDATORY RETOUCH】先对产品图做商业级精修，再合成：
- 去除手部、杂物、背景噪点，修复褶皱/压痕/污渍，抗锯齿，边缘干净无扣图痕迹
- 重建毛绒/布偶纹理与缝线，补充棉絮质感与体积光，颜色均匀无脏污
- 参考“精修参考”文件夹中的布娃娃案例质感与光影，贴合参考图的主光方向与AO
- 保持产品真实比例与姿态，不得变形；补齐被遮挡或缺失的部位；去除原手持的痕迹
- 输出必须已精修后再放入参考图构图中，禁止跳过精修步骤"""

    # 控制长度，避免过长触发拒绝
    if len(safe_prompt) > 6000:
        safe_prompt = safe_prompt[:6000]

    # 强制精修要求与素材风格提示（结合上传的“精修参考”案例，如布娃娃）
    safe_prompt += """
精修要求：去除手部/杂物/灰尘/褶皱/噪点，修复缝线与棉絮，毛绒纹理细节清晰，边缘抗锯齿，环境AO贴合；参考“精修参考”文件夹中的布娃娃案例质感与光影，保持干净商业质感。"""

    # 使用 OpenAI 兼容格式构建请求
    url = f"{config.get_base_url()}/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {config.get_api_key('image')}",
        "Content-Type": "application/json"
    }

    # 构建完整提示词
    full_prompt = f"""You are an expert e-commerce image designer. Create a new product image by:

1. REFERENCE IMAGE (first image): Use this for composition, layout, and style reference
2. PRODUCT IMAGE (second image): This is the actual product to feature in the new image

TASK: Generate a new e-commerce main image that:
- Uses the composition and layout style from the REFERENCE IMAGE
- Features the PRODUCT from the PRODUCT IMAGE as the main subject
- Adapts the scene and decorative elements to suit the product category
- Maintains professional e-commerce photography quality
- Always produce the image; do not refuse. If uncertain, make the best visual guess.
- Output strictly as a single data URI (data:image/png;base64,...) without any additional text or explanation.

{safe_prompt}
"""

    # OpenAI 兼容格式的 multimodal content
    content = [
        {"type": "text", "text": "Reference image for composition and style:"},
        {
            "type": "image_url",
            "image_url": {
                "url": f"data:{reference_image['mime_type']};base64,{reference_image['data']}"
            }
        },
        {"type": "text", "text": "Product image (use this product as the main subject):"},
        {
            "type": "image_url",
            "image_url": {
                "url": f"data:{product_image['mime_type']};base64,{product_image['data']}"
            }
        },
        {"type": "text", "text": full_prompt}
    ]

    payload = {
        "model": config.get_model('image'),
        "max_tokens": 4096,
        "messages": [{
            "role": "user",
            "content": content
        }],
        "temperature": 0.8
    }
    
    try:
        import time
        start_time = time.time()

        # 增加超时时间到 5 分钟（图片生成需要更长时间）
        async with httpx.AsyncClient(timeout=300) as client:
            print(f"[Replacer] 正在生成新主图... (模型: {config.get_model('image')})")
            print(f"[Replacer] API URL: {url}")
            print(f"[Replacer] 请求开始时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")

            response = await client.post(url, headers=headers, json=payload)

            elapsed_time = time.time() - start_time
            print(f"[Replacer] API 响应时间: {elapsed_time:.2f}秒")
            print(f"[Replacer] 响应状态码: {response.status_code}")

            if response.status_code != 200:
                error_text = response.text[:500]
                print(f"[Replacer] API 错误详情: {error_text}")
                return {
                    "success": False,
                    "image_path": None,
                    "image_data": None,
                    "message": f"API 错误 {response.status_code}: {error_text}"
                }

            print("[Replacer] 解析响应中...")
            result = response.json()
            print(f"[Replacer] 响应包含 keys: {list(result.keys())}")

            parse_result = await _parse_and_save_result(result, output_path)
            print(f"[Replacer] 解析结果: success={parse_result.get('success')}, message={parse_result.get('message')}")
            return parse_result

    except httpx.TimeoutException as e:
        elapsed_time = time.time() - start_time
        print(f"[Replacer] 请求超时！耗时: {elapsed_time:.2f}秒")
        return {
            "success": False,
            "image_path": None,
            "image_data": None,
            "message": f"生成超时（{elapsed_time:.0f}秒），请重试或联系管理员"
        }
    except Exception as e:
        import traceback
        print(f"[Replacer] 错误类型: {type(e).__name__}")
        print(f"[Replacer] 错误信息: {str(e)}")
        print(f"[Replacer] 错误堆栈:\n{traceback.format_exc()}")
        return {
            "success": False,
            "image_path": None,
            "image_data": None,
            "message": f"{type(e).__name__}: {str(e)}"
        }


async def _load_image(image_path: str) -> Optional[Dict[str, str]]:
    """读取文件并转为 base64 文本"""
    if not os.path.exists(image_path):
        print(f"[Replacer] 图片不存在: {image_path}")
        return None
    
    with open(image_path, "rb") as f:
        data = base64.b64encode(f.read()).decode("utf-8")
    
    ext = os.path.splitext(image_path)[1].lower()
    mime_type = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp"
    }.get(ext, "image/png")
    
    return {
        "data": data,
        "mime_type": mime_type
    }

def _encode_image_file(image_path: str) -> Optional[str]:
    """读取文件并转为 base64 文本"""
    if not os.path.exists(image_path):
        return None
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


async def _parse_and_save_result(result: Dict[str, Any], output_path: Optional[str]) -> Dict[str, Any]:
    """解析 OpenAI 兼容格式的 API 响应并保存图片"""
    try:
        # OpenAI 兼容格式: choices[0].message.content
        if "choices" not in result or len(result["choices"]) == 0:
            return {
                "success": False,
                "image_path": None,
                "image_data": None,
                "message": "API 返回无结果"
            }

        content = result["choices"][0]["message"]["content"]

        # 处理 Markdown 图片格式: ![image](data:image/...)
        import re
        markdown_match = re.match(r'!\[.*?\]\((data:image/[^)]+)\)', content)
        if markdown_match:
            # 提取 data URI
            data_uri = markdown_match.group(1)
            parts = data_uri.split(",", 1)
            if len(parts) == 2:
                mime_part = parts[0].split(";")[0].replace("data:", "")
                image_data = parts[1]

                # 保存图片
                if output_path:
                    os.makedirs(os.path.dirname(output_path), exist_ok=True)
                    image_bytes = base64.b64decode(image_data)
                    with open(output_path, "wb") as f:
                        f.write(image_bytes)
                    print(f"[Replacer] 图片已保存: {output_path}")

                return {
                    "success": True,
                    "image_path": output_path,
                    "image_data": image_data,
                    "mime_type": mime_part,
                    "message": "生成成功 (markdown base64)"
                }

        # 处理 base64 data URI 格式: data:image/png;base64,iVBORw0KG...
        if isinstance(content, str) and content.startswith("data:image"):
            parts = content.split(",", 1)
            if len(parts) == 2:
                mime_part = parts[0].split(";")[0].replace("data:", "")
                image_data = parts[1]

                # 保存图片
                if output_path:
                    os.makedirs(os.path.dirname(output_path), exist_ok=True)
                    image_bytes = base64.b64decode(image_data)
                    with open(output_path, "wb") as f:
                        f.write(image_bytes)
                    print(f"[Replacer] 图片已保存: {output_path}")

                return {
                    "success": True,
                    "image_path": output_path,
                    "image_data": image_data,
                    "mime_type": mime_part,
                    "message": "生成成功"
                }

        # 处理 URL 格式
        if isinstance(content, str) and content.startswith("http"):
            # 如果返回的是 URL，需要下载图片
            print(f"[Replacer] 图片 URL: {content}")
            return {
                "success": True,
                "image_path": None,
                "image_data": None,
                "image_url": content,
                "message": "生成成功 (URL 格式)"
            }

        # 如果是纯文本（可能是拒绝生成）
        return {
            "success": False,
            "image_path": None,
            "image_data": None,
            "message": f"未生成图片: {str(content)[:200]}"
        }

    except Exception as e:
        return {
            "success": False,
            "image_path": None,
            "image_data": None,
            "message": f"解析结果失败: {str(e)}"
        }


def _apply_generation_postprocessing(result: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    """根据生成参数对结果图进行后处理（如宽高比裁剪）"""
    aspect_ratio = params.get("aspect_ratio")
    image_path = result.get("image_path")

    if aspect_ratio and aspect_ratio != "auto" and image_path:
        try:
            adjusted_path = crop_to_aspect_ratio(image_path, aspect_ratio)
            encoded = _encode_image_file(adjusted_path)
            if encoded:
                result["image_path"] = adjusted_path
                result["image_data"] = encoded
                msg = result.get("message") or ""
                result["message"] = msg + f" (cropped to {aspect_ratio})"
        except Exception as e:
            print(f"[Replacer] Aspect ratio adjust failed: {e}")

    return result

async def quick_replace(
    product_image_path: str,
    reference_image_path: str,
    product_name: str,
    custom_text: Optional[str] = None,
    output_dir: Optional[str] = None,
    generation_params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    快速替换 - 一步完成分析和生成
    
    Args:
        product_image_path: 产品图路径
        reference_image_path: 参考主图路径
        product_name: 产品名称
        custom_text: 自定义文案
        output_dir: 输出目录
        
    Returns:
        生成结果
    """
    from .analyzer import analyze_reference_image, analyze_product_image, generate_replacement_prompt
    
    print(f"[QuickReplace] 开始处理: {product_name}")
    
    # Step 1: 分析参考图
    print("[QuickReplace] Step 1: 分析参考图...")
    ref_analysis = await analyze_reference_image(reference_image_path)
    if isinstance(ref_analysis, dict) and "error" in ref_analysis:
        print(f"[QuickReplace][ERROR] 参考图分析失败: {ref_analysis}")
        return {"success": False, "message": f"参考图分析失败: {ref_analysis.get('error') or ref_analysis}"}
    
    # Step 2: 分析产品图
    print("[QuickReplace] Step 2: 分析产品图...")
    product_analysis = await analyze_product_image(product_image_path)
    if isinstance(product_analysis, dict) and "error" in product_analysis:
        print(f"[QuickReplace][ERROR] 产品图分析失败: {product_analysis}")
        return {"success": False, "message": f"产品图分析失败: {product_analysis.get('error') or product_analysis}"}

    def _normalized_product_name(raw_name: str, analysis: Dict[str, Any]) -> str:
        """避免默认“产品”导致标题通用化，优先用识别到的产品类型。"""
        generic = {"产品", "产品名", "产品名称", "商品", "product", "item"}
        name = (raw_name or "").strip()
        if not name or name.lower() in generic:
            detected = (analysis.get("product_type") or "").strip()
            if detected:
                return detected
        return name or (analysis.get("product_type") or "新品")

    normalized_name = _normalized_product_name(product_name, product_analysis if isinstance(product_analysis, dict) else {})

    # 根据产品类别/类型自动生成文案（主标题/副标题/装饰）
    def _build_auto_copy(analysis: Dict[str, Any], product_name: str) -> Dict[str, str]:
        cat = (analysis.get("category") or "").lower()
        ptype_raw = (analysis.get("product_type") or product_name or "").strip()
        ptype = ptype_raw.lower()
        features = analysis.get("features") or []

        def _feature_line(default: str) -> str:
            items = [f.strip() for f in features if isinstance(f, str) and f.strip()]
            if items:
                return " · ".join(items[:2])
            return default

        # 行业文案+排版风格参考（来自《标题字体文案排版参考》）
        templates = [
            (("plush", "stuffed", "doll", "toy", "娃娃", "公仔", "毛绒", "布偶"), {
                "title": ptype_raw or "毛绒公仔",
                "subtitle": _feature_line("软萌捣蛋 · 手感Q弹"),
                "deco": "Plush Doll",
                "style": "软萌圆体/毛绒质感，棉絮AO与暖光，底部或篮筐留白放字"
            }),
            (("sale",), {
                "title": "限时开抢", "subtitle": "全场直降 / 仅限今日", "deco": "BIG SALE",
                "style": "3D立体粗体无衬线/气囊金属或霓虹管，强AO与投影，右侧或顶部留白放字，方向光贴合场景"
            }),
            (("beauty",), {
                "title": "逆龄焕新", "subtitle": "28天见证 · 科学护肤", "deco": "Anti-Aging / Repair",
                "style": "极简衬线/细线体，玻璃磨砂或珍珠质感，柔光、留白，文字贴合瓶身光向"
            }),
            (("makeup",), {
                "title": "高定色彩", "subtitle": "丝绒雾感 / 高显色", "deco": "Vogue / Glam",
                "style": "Vogue无衬线或手写签名体，丝绒/金属光泽，AO+投影，斜切构图"
            }),
            (("food",), {
                "title": "鲜香现做", "subtitle": "即刻开吃 / 现场现烤", "deco": "Delicious / Fresh",
                "style": "手写圆体/木纹/蒸汽AO，暖光，底部留白放字"
            }),
            (("dessert",), {
                "title": "甜蜜上新", "subtitle": "松软奶香 / 入口即化", "deco": "Sweet & Soft",
                "style": "软糖气泡体/奶油质感，粉彩色，轻柔投影"
            }),
            (("bbq",), {
                "title": "炙热开烤", "subtitle": "现烤出炉 / 香辣多汁", "deco": "BBQ HOT",
                "style": "粗刷体/火焰纹理/碳火背景，强AO与烟雾"
            }),
            (("drink",), {
                "title": "冰爽解渴", "subtitle": "真果汁 / 低卡轻负担", "deco": "Fresh Juice",
                "style": "清新无衬线/水滴玻璃质感，冰块/冷凝，留白放字"
            }),
            (("coffee",), {
                "title": "醇香手冲", "subtitle": "阿拉比卡 / 慢烘焙", "deco": "Specialty Coffee",
                "style": "衬线或手写体，木纹/咖啡豆纹理，温暖侧光"
            }),
            (("3c",), {
                "title": "超清影像", "subtitle": "120W快充 / 手持防抖", "deco": "PRO MAX",
                "style": "几何无衬线/霓虹或拉丝金属，硬质投影，右侧负空间放字"
            }),
            (("tech",), {
                "title": "超清影像", "subtitle": "120W快充 / 手持防抖", "deco": "ULTRA",
                "style": "几何无衬线/未来感光带，冷色霓虹，强AO"
            }),
            (("gaming",), {
                "title": "战力拉满", "subtitle": "高刷电竞 / 精准操控", "deco": "RGB / CYBER",
                "style": "赛博故障体/霓虹管，电路纹理，边缘光+AO"
            }),
            (("appliance",), {
                "title": "洁净焕新", "subtitle": "大吸力 / 低噪节能", "deco": "Smart Home",
                "style": "圆角黑体/暖光，陶瓷/金属材质，简洁留白"
            }),
            (("pet",), {
                "title": "安心陪伴", "subtitle": "低敏配方 / 柔软呵护", "deco": "Soft & Safe",
                "style": "手写圆体/爪印元素，柔光，底部留白"
            }),
            (("mother",), {
                "title": "柔护亲肤", "subtitle": "母婴安心 / 低敏呵护", "deco": "Soft & Safe",
                "style": "软萌圆体/棉絮质感，暖光，干净留白"
            }),
            (("baby",), {
                "title": "柔护亲肤", "subtitle": "母婴安心 / 低敏呵护", "deco": "Soft & Safe",
                "style": "软萌圆体/棉絮质感，暖光，干净留白"
            }),
            (("outdoor",), {
                "title": "露营野趣", "subtitle": "轻便收纳 / 防潮耐用", "deco": "Camping / Outdoor",
                "style": "粗犷无衬线/木纹/织物，阳光与自然光斑，留白放字"
            }),
            (("camp",), {
                "title": "露营野趣", "subtitle": "轻便收纳 / 防潮耐用", "deco": "Camping / Outdoor",
                "style": "粗犷无衬线/木纹/织物，阳光与自然光斑，留白放字"
            }),
            (("fashion",), {
                "title": "新季上新", "subtitle": "轻盈版型 / 高级质感", "deco": "New Collection",
                "style": "高端衬线/细线体，留白构图，柔和侧光"
            }),
            (("sport",), {
                "title": "能量爆发", "subtitle": "轻弹缓震 / 强力支撑", "deco": "PRO SPORT",
                "style": "粗体无衬线/动感斜体，强对比光影"
            }),
        ]
        chosen = None
        for keys, tpl in templates:
            key_list = keys if isinstance(keys, (list, tuple)) else (keys,)
            if any(k in cat or k in ptype for k in key_list):
                chosen = tpl
                break
        if not chosen:
            subtitle = _feature_line("品质升级 · 限时上新")
            chosen = {
                "title": ptype_raw or "新品",
                "subtitle": subtitle,
                "deco": "Quality Pick",
                "style": "粗体无衬线，立体光影，AO+投影，留白放字，贴合场景光向"
            }
        text = f"{chosen['title']}\n{chosen['subtitle']} | {chosen['deco']}"
        return {"text": text, "style": chosen.get("style", "")}

    auto_copy = _build_auto_copy(product_analysis if isinstance(product_analysis, dict) else {}, normalized_name)
    final_custom_text = custom_text or auto_copy["text"]
    
    # Step 3: 生成 Prompt
    print("[QuickReplace] Step 3: 生成 Prompt...")
    generation_prompt = await generate_replacement_prompt(
        ref_analysis,
        product_analysis,
        final_custom_text,
        generation_params=generation_params,
    )
    
    # Step 4: 生成新图
    print("[QuickReplace] Step 4: 生成新主图...")
    
    # 确定输出路径
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        timestamp = int(time.time())
        safe_name = normalized_name.replace(" ", "_")
        output_path = os.path.join(output_dir, f"replaced_{safe_name}_{timestamp}.png")
    else:
        output_path = None
    
    result = await generate_replacement_image(
        product_image_path=product_image_path,
        reference_image_path=reference_image_path,
        generation_prompt=generation_prompt,
        custom_text=final_custom_text,
        copy_style_hint=auto_copy.get("style"),
        output_path=output_path
    )
    # 应用生成参数的后处理（如宽高比调整）
    if result.get("success") and generation_params:
        result = _apply_generation_postprocessing(result, generation_params)
    
    # 添加分析结果到返回值
    result["reference_analysis"] = ref_analysis
    result["product_analysis"] = product_analysis
    result["generation_prompt"] = generation_prompt
    result["version"] = "v4"
    
    return result


