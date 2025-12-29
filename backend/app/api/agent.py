
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import httpx
import traceback
import time
from ..config import config
from ..core.batch_replacer import BATCH_JOBS, batch_manager
from ..utils.smart_parser import smart_parse_excel

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

class ChatResponse(BaseModel):
    response: str
    action: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

@router.post("/", response_model=ChatResponse)
async def chat_with_agent(request: ChatRequest):
    """Chat with the Xobi Agent"""
    
    # ========== 日志：请求入口 ==========
    print(f"\n{'='*20} 收到新请求 {'='*20}")
    print(f"时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"消息: {request.message[:100]}...")
    print(f"Job ID: {request.job_id}")
    print(f"历史长度: {len(request.history)}")
    print(f"引用数量: {len(request.references) if request.references else 0}")
    
    # ========== 参数兜底 ==========
    quality = request.quality or '1K'
    aspect_ratio = request.aspect_ratio or 'auto'
    if aspect_ratio == 'auto':
        aspect_ratio = '1:1'  # 自动默认为 1:1
    
    print(f"DEBUG: 最终画质={quality}, 最终比例={aspect_ratio}")
    
    try:
        # ========== 构建上下文 ==========
        job_context = ""
        job = None
        
        if request.job_id and request.job_id in BATCH_JOBS:
            job = BATCH_JOBS[request.job_id]
            items = job.get("items", [])
            total = len(items)
            preview_data = []
            for it in items[:10]:
                preview_data.append({
                    "id": it.get("id"),
                    "product": it.get("product_name"),
                    "req": it.get("requirements") or it.get("custom_text") or "N/A"
                })
            
            job_context = f"""
            Current Job Context:
            - Job ID: {request.job_id}
            - Total Items: {total}
            - Status: {job.get('status')}
            - Data Preview: {preview_data}
            """

        # ========== 系统提示词 ==========
        system_prompt = """!!CRITICAL INSTRUCTION!!
You MUST respond ONLY in Chinese. NO English at all.
You are Xobi (小壹), an e-commerce image generation assistant.

【强制规则】
1. 必须用中文回复，禁止任何英文
2. 回复最多2句话，简短有力
3. 当用户确认开始时，回复"正在处理..."

【对话模式】
- 用户描述需求 → 回复："好的，已理解您的需求。可以开始生成吗？"
- 用户说"开始/好/可以/OK/确认" → 回复："正在处理，请稍候..."

【示例】
用户: 把背景改成海滩
你: 好的，将背景改为海滩场景。可以开始生成吗？

用户: 开始
你: 正在处理，请稍候...
"""

        # ========== 构建请求 ==========
        url = f"{config.YUNWU_BASE_URL}/v1beta/models/{config.GEMINI_FLASH_MODEL}:generateContent"
        headers = {
            "Authorization": f"Bearer {config.GEMINI_FLASH_API_KEY}",
            "Content-Type": "application/json"
        }
        
        contents = [{
            "role": "user",
            "parts": [{"text": system_prompt + "\n\nUser: " + request.message}]
        }]

        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 500
            }
        }
        
        print(f"DEBUG: 准备调用云雾 API...")
        print(f"DEBUG: URL = {url}")
        print(f"DEBUG: Model = {config.GEMINI_FLASH_MODEL}")
        
        # ========== 调用 API（带计时） ==========
        start_time = time.time()
        
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(url, headers=headers, json=payload)
            
        elapsed = time.time() - start_time
        print(f"DEBUG: API 响应耗时 = {elapsed:.2f} 秒")
        print(f"DEBUG: 状态码 = {response.status_code}")
        
        if response.status_code != 200:
            error_text = response.text[:500]
            print(f"!!! API 返回错误: {error_text}")
            return ChatResponse(
                response=f"AI 服务暂时不可用（{response.status_code}），请稍后重试",
                action=None,
                data=None
            )
        
        ai_data = response.json()
        print(f"DEBUG: 响应结构 keys = {ai_data.keys()}")
        
        # ========== 解析响应 ==========
        ai_text = ""
        if "candidates" in ai_data and ai_data["candidates"]:
            candidate = ai_data["candidates"][0]
            if "content" in candidate and "parts" in candidate["content"]:
                ai_text = candidate["content"]["parts"][0].get("text", "")
        
        if not ai_text:
            print("!!! 警告: AI 返回空文本")
            ai_text = "抱歉，我暂时无法处理这个请求。"
        
        print(f"DEBUG: AI 回复 = {ai_text[:200]}...")
        
        # ========== 强制中文过滤 ==========
        # 如果 AI 返回英文，替换为预设中文
        import re
        english_ratio = len(re.findall(r'[a-zA-Z]', ai_text)) / max(len(ai_text), 1)
        if english_ratio > 0.3:  # 超过 30% 是英文
            print("!!! 警告: AI 返回英文，强制替换")
            ai_text = "好的，已理解您的需求。可以开始生成吗？"
        
        # ========== 关键词强制触发 action ==========
        confirm_keywords = ['开始', '好的', '可以', 'ok', 'OK', '确认', '生成', '是', '好']
        user_msg_lower = request.message.strip().lower()
        force_action = any(kw.lower() in user_msg_lower for kw in confirm_keywords)
        
        if force_action:
            print("DEBUG: 检测到确认关键词，强制触发 generate action")
        
        # ========== 解析工具调用 ==========
        import json
        
        tool_match = re.search(r'```json\s*(\{.*?\})\s*```', ai_text, re.DOTALL)
        
        action_response = None
        action_data = None
        
        # 优先使用关键词检测
        if force_action:
            action_response = "generate"
            ai_text = "正在处理，请稍候..."
        
        if tool_match:
            try:
                tool_call = json.loads(tool_match.group(1))
                tool_name = tool_call.get("tool")
                print(f"DEBUG: 检测到工具调用 = {tool_name}")
                
                if tool_name == "update_items" and job:
                    updates = tool_call.get("updates", {})
                    count = len(job["items"])
                    for item in job["items"]:
                        for key, val in updates.items():
                            item[key] = val
                    
                    action_response = "update_table"
                    action_data = {"count": count}
                    ai_text = re.sub(r'```json\s*\{.*?\}\s*```', '', ai_text, flags=re.DOTALL).strip()
                    ai_text += f"\n\n(已更新 {count} 项)"

                elif tool_name == "start_job":
                    action_response = "start_job"
                    ai_text = re.sub(r'```json\s*\{.*?\}\s*```', '', ai_text, flags=re.DOTALL).strip()

            except json.JSONDecodeError as je:
                print(f"!!! JSON 解析失败: {je}")
            except Exception as e:
                print(f"!!! 工具执行失败: {e}")
        
        print(f"DEBUG: 最终 action = {action_response}")
        print(f"{'='*20} 请求处理完成 {'='*20}\n")
        
        return ChatResponse(
            response=ai_text,
            action=action_response,
            data=action_data
        )
        
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


