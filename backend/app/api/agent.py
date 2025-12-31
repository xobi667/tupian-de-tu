
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import httpx
import traceback
import re
from ..config import config
from ..core.batch_replacer import BATCH_JOBS

router = APIRouter(prefix="/api/chat", tags=["Agent Chat"])

class ChatRequest(BaseModel):
    """聊天请求模型"""
    job_id: Optional[str] = None
    message: str
    history: List[Dict[str, Any]] = []
    references: Optional[List[Dict[str, Any]]] = None
    # 新增参数
    quality: Optional[str] = None
    aspect_ratio: Optional[str] = None
    final_trigger: Optional[bool] = False  # 是否为最终生成指令

class ChatResponse(BaseModel):
    response: str
    action: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

class ExpandPromptRequest(BaseModel):
    """Prompt 扩展请求模型"""
    brief: str

class ExpandPromptResponse(BaseModel):
    """Prompt 扩展响应模型"""
    expanded_prompt: str

# ========== Xobi 终极底层核心红线 (System Base Prompt v2.1) ==========
BASE_PROMPT_TEMPLATE = (
    "Role: Senior E-commerce Visual Architect (10+ years experience). "
    "Core Subject: {product_desc}. "
    "Mandatory Constraints: Strict 1:1 physical scale, zero geometric deformation, "
    "original material authenticity (metal/glass/plastic texture preservation). "
    "Visual Style: High-end studio commercial photography, ray-traced soft lighting, "
    "cinematic depth of field, golden ratio composition (product centered but breathable). "
    "Text & Typography: Clean minimalist layout, adaptive commercial fonts, "
    "STRICTLY NO PUNCTUATION in any visible text. "
    "Environment & Context: {user_instruction}. "
    "Final Goal: A professional, ready-to-use brand visual that seamlessly integrates the product into the scene."
)

@router.post("/", response_model=ChatResponse)
async def chat_with_agent(request: ChatRequest):
    """Chat with the Xobi Agent utilizing Dual-Layer Prompt Architecture"""
    
    # ========== 日志：请求入口 ==========
    print(f"\n{'='*20} 收到对话请求 (双层引擎) {'='*20}")
    print(f"用户消息: {request.message[:100]}...")
    print(f"Final Trigger: {request.final_trigger}")
    
    # ========== 参数解析 ==========
    quality = request.quality or '1K'
    aspect_ratio = request.aspect_ratio or 'auto'
    if aspect_ratio == 'auto': aspect_ratio = '1:1'
    
    try:
        job = BATCH_JOBS.get(request.job_id) if request.job_id else None

        # ========== 系统提示词 (极限洗脑加固版) ==========
        system_prompt = """## ROLE: Xobi 视觉顾问 (严禁输出英文)
## RULES:
1. **100% 中文**：严禁出现任何英文单词（专有名词除外）。
2. **三条原则**：你的回复【只能】包含一句中文确认和三个 [建议N: xxx] 格式的按钮。
3. **严禁泄密**：绝对禁止向用户输出任何形如 "Role:", "Core Subject:", "Prompt:" 的技术代码。
4. **建议精简**：每个建议按钮描述不得超过 12 个汉字。

示例回复：
好的，为您策划了三个视觉方案：
[建议1: 金属拉丝背景，极简冷淡风]
[建议2: 晨曦暖阳透过百叶窗，温馨感]
[建议3: 动态水花飞溅，夏日清凉视觉]
您中意哪个方向？
"""

        # ========== 调用 AI 进行创意咨询 (带容错重试, 使用 OpenAI 兼容格式) ==========
        url = f"{config.get_base_url()}/v1/chat/completions"
        headers = {"Authorization": f"Bearer {config.get_api_key('flash')}", "Content-Type": "application/json"}

        # 构建消息历史 (OpenAI 格式)
        messages = [{"role": "system", "content": system_prompt}]
        for h in request.history[-8:]:
            role = "user" if h.get('role') == 'user' else "assistant"
            content = h.get('parts', [{}])[0].get('text', '') if 'parts' in h else h.get('content', '')
            if content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": request.message})

        payload = {
            "model": config.get_model('flash'),
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 300
        }
        
        ai_reply = ""
        # 显式 Timeout 设置: 60s 读超时, 10s 连接超时
        custom_timeout = httpx.Timeout(60.0, connect=10.0)
        
        print(f"DEBUG: [LINK] 正在连接 AI 大脑 (API: {config.GEMINI_FLASH_MODEL})...")
        
        async with httpx.AsyncClient(timeout=custom_timeout) as client:
            for attempt in range(2): # 最多尝试 2 次
                try:
                    response = await client.post(url, headers=headers, json=payload)
                    if response.status_code == 200:
                        ai_data = response.json()
                        # OpenAI 兼容格式的响应解析
                        ai_reply = ai_data["choices"][0]["message"]["content"].strip()
                        print(f"DEBUG: [LINK] AI 响应成功 (Attempt {attempt+1})")
                        break
                    else:
                        print(f"WARNING: AI 返回状态码 {response.status_code}, 正在尝试重试...")
                except (httpx.ReadTimeout, httpx.ConnectTimeout) as e:
                    print(f"WARNING: AI 连接超时 ({str(e)}), 第 {attempt+1} 次尝试中...")
                    if attempt == 1: # 最后一次尝试也失败
                        ai_reply = "抱歉，AI 大脑目前排队人数较多。您可以点击下方按钮直接开始生成，或稍后重试。"
                except Exception as e:
                    print(f"ERROR: 发生非预期错误: {str(e)}")
                    break
            
            if not ai_reply: ai_reply = "好的，正在为您深度构思中，由于云端连接稍慢，请稍后..."

        # ========== 后端回复脱敏与黑名单清理逻辑 ==========
        
        def clean_prompt_text(text):
            """剔除文本中的 UI 触发词和系统术语"""
            blacklist = [
                r'方案已定', r'立即生成', r'开始生成', r'确定生成', r'开始', r'制作', r'生成',
                r'好的', r'可以', r'确认', r'建议\d', r'顾问', r'收到', r'指令', r'渲染', r'打造'
            ]
            for kw in blacklist:
                text = re.sub(kw, '', text)
            # 移除多余空白和符号
            text = re.sub(r'[，。！？\s\[\]]+$', '', text).strip()
            return text

        user_msg_clean = request.message.strip().lower()
        
        # 判定是否触发生成
        is_final_confirmation = request.final_trigger or \
                                 any(kw in user_msg_clean for kw in ['方案已定', '立即生成', '开始生成', '确定生成']) or \
                                 (len(user_msg_clean) < 8 and any(kw in user_msg_clean for kw in ['开始', '制作', '生成']))

        action_response = None
        action_data = None

        if is_final_confirmation:
            print("DEBUG: [静默生成] 确认生图，正在执行深度清洗...")
            
            # --- 精准提取逻辑 ---
            # 向前回溯历史，寻找第一个非 UI 指令的长句作为视觉描述
            candidates = []
            # 包含当前消息和历史记录
            all_turns = request.history + [{"role": "user", "parts": [{"text": request.message}]}]
            for turn in reversed(all_turns):
                if turn.get("role") != "user": continue
                text = turn.get("parts", [{}])[0].get("text", "")
                # 移除 UI 标签
                text = re.sub(r'\[建议\d:\s*.*?\]', '', text)
                text = re.sub(r'@[^\s]+', '', text).strip()
                # 过滤黑名单
                cleaned = clean_prompt_text(text)
                if len(cleaned) > 5: # 描述性长句
                    candidates.append(cleaned)
                    break # 找到最近的描述性即停止
            
            user_instruction = candidates[0] if candidates else "Pro studio photography"
            
            # --- 文字层物理锁死 ---
            typography_text = "Empty, no text"
            # 仅当用户明确包含“文案是”等指令时才提取
            text_match = re.search(r'(?:文字|文案|内容)(?:是|写|为|：)\s*[\"\']?([^，。！？\s\"\'\[\]]{1,20})[\"\']?', request.message)
            if text_match:
                typography_text = text_match.group(1)

            # --- 产品一致性 ---
            product_desc = "premium product"
            if job and job.get("items"):
                product_desc = job["items"][0].get("product_name", product_desc)

            # --- 拼装 Final Prompt (不回传给前端) ---
            final_prompt = (
                f"Role: Senior Architect. Subject: {product_desc}. "
                f"Typography & Text: {typography_text}. "
                f"Visual Style: Professional commercial studio. "
                f"Environment: {user_instruction}. "
                f"Goal: High-end brand visual."
            )
            
            print(f"--- [SECURE] Final Prompt Built: {final_prompt} ---")

            # 强制脱敏：返回给前端的 message 必须简短且无代码
            ai_reply = "⚡ 视觉方案已锁定，正在为您打造大师级渲染图..."
            
            if job:
                for item in job["items"]: item["requirements"] = final_prompt
                action_response = "start_job"
                action_data = {"count": len(job["items"]), "prompt": final_prompt}
            else:
                action_response = "generate"
                action_data = {"custom_prompt": final_prompt, "quality": quality, "aspect_ratio": aspect_ratio}
        else:
            # 咨询阶段的回应逻辑（已由前面的 Gemini 调用处理，此处保持其原样，但增加一层正则清理）
            ai_reply = re.sub(r'Role:.*?Goal:.*?\.', '', ai_reply, flags=re.DOTALL).strip()
            if not ai_reply: ai_reply = "好的，为您提供以下设计方向："

            # 在咨询阶段也生成预览用的 prompt
            # 向前回溯历史，寻找第一个非 UI 指令的长句作为视觉描述
            candidates = []
            all_turns = request.history + [{"role": "user", "parts": [{"text": request.message}]}]
            for turn in reversed(all_turns):
                if turn.get("role") != "user": continue
                text = turn.get("parts", [{}])[0].get("text", "")
                text = re.sub(r'\[建议\d:\s*.*?\]', '', text)
                text = re.sub(r'@[^\s]+', '', text).strip()
                cleaned = clean_prompt_text(text)
                if len(cleaned) > 5:
                    candidates.append(cleaned)
                    break

            user_instruction = candidates[0] if candidates else "Pro studio photography"

            # 产品一致性
            product_desc = "premium product"
            if job and job.get("items"):
                product_desc = job["items"][0].get("product_name", product_desc)

            # 构建预览 prompt
            preview_prompt = (
                f"Role: Senior Architect. Subject: {product_desc}. "
                f"Visual Style: Professional commercial studio. "
                f"Environment: {user_instruction}. "
                f"Goal: High-end brand visual."
            )

            action_response = None
            action_data = {"custom_prompt": preview_prompt}

        return ChatResponse(response=ai_reply, action=action_response, data=action_data)

    except httpx.TimeoutException:
        print("!!! 后端报错详情如下 !!!")
        print("错误类型: API 请求超时")
        traceback.print_exc()
        return ChatResponse(
            response="AI 响应超时，云雾 API 可能繁忙，请稍后重试",
            action=None,
            data=None
        )
        
    except Exception as e:
        print("!!! 后端报错详情如下 !!!")
        traceback.print_exc()
        # 返回错误信息给前端，而不是抛出 500
        return ChatResponse(
            response=f"服务器内部错误: {str(e)}",
            action=None,
            data=None
        )


@router.post("/expand-prompt", response_model=ExpandPromptResponse)
async def expand_prompt(request: ExpandPromptRequest):
    """
    将用户的简短描述扩展成完整的电商主图生成 Prompt

    Args:
        request: 包含简短描述的请求对象

    Returns:
        包含扩展后完整描述的响应对象
    """

    print(f"\n{'='*20} 收到 Prompt 扩展请求 {'='*20}")
    print(f"简短描述: {request.brief}")

    try:
        # ========== System Prompt: Prompt 扩展专用 ==========
        system_prompt = """## ROLE: 电商视觉 Prompt 专家

## TASK: 将用户的简短产品描述扩展成专业的电商主图生成指令

## EXPANSION FORMAT (必须按此顺序):
产品类别 + 核心卖点 + 使用场景 + 视觉风格要求

## RULES:
1. **字数控制**: 扩展后的描述必须在 50-80 字之间
2. **专业性**: 强调电商主图的专业性，使用商业摄影术语
3. **具体化**: 将模糊描述转化为具体的视觉指令
4. **场景化**: 必须包含明确的使用场景
5. **风格化**: 必须包含清晰的视觉风格要求
6. **纯中文输出**: 除专有名词外，全部使用中文

## EXAMPLES:
输入: 无线耳机，降噪
输出: 专业降噪无线耳机，主打主动降噪技术，适合通勤族在地铁、办公室等嘈杂环境使用，视觉风格要求科技感、简约时尚，突出降噪功能，展示佩戴舒适性

输入: 护肤品，保湿
输出: 高端保湿护肤精华，主打深层补水锁水功效，适合干性肌肤女性日常护理使用，视觉风格要求轻奢优雅、清新自然，突出产品质地细腻，展示晶莹剔透的护肤效果

输入: 运动鞋，跑步
输出: 专业跑步运动鞋，主打轻量化缓震设计，适合户外慢跑和健身房训练场景，视觉风格要求动感活力、年轻时尚，突出鞋底科技，展示运动中的流畅感

## OUTPUT: 直接输出扩展后的描述，不要有任何前缀或解释
"""

        # ========== 调用 Gemini Flash 进行 Prompt 扩展 ==========
        url = f"{config.get_base_url()}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {config.get_api_key('flash')}",
            "Content-Type": "application/json"
        }

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": request.brief}
        ]

        payload = {
            "model": config.get_model('flash'),
            "messages": messages,
            "temperature": 0.3,  # 适中的创造性
            "max_tokens": 200    # 足够生成 50-80 字的中文描述
        }

        print(f"DEBUG: 正在调用 Gemini Flash 扩展 Prompt...")

        # 设置超时: 30s 读超时, 10s 连接超时
        custom_timeout = httpx.Timeout(30.0, connect=10.0)

        async with httpx.AsyncClient(timeout=custom_timeout) as client:
            response = await client.post(url, headers=headers, json=payload)

            if response.status_code != 200:
                error_msg = f"API 返回错误状态码: {response.status_code}"
                print(f"ERROR: {error_msg}")
                raise Exception(error_msg)

            ai_data = response.json()
            expanded = ai_data["choices"][0]["message"]["content"].strip()

            print(f"DEBUG: 扩展成功")
            print(f"扩展后描述: {expanded}")

            return ExpandPromptResponse(expanded_prompt=expanded)

    except httpx.TimeoutException:
        print("ERROR: API 请求超时")
        traceback.print_exc()
        raise Exception("AI 响应超时，请稍后重试")

    except Exception as e:
        print(f"ERROR: Prompt 扩展失败: {str(e)}")
        traceback.print_exc()
        raise Exception(f"Prompt 扩展失败: {str(e)}")


