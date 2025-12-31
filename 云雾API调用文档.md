# 云雾 API 调用完整文档

> **本文档作为项目 API 配置的权威数据库**
> 最后更新: 2025-12-30

---

## 目录

1. [云雾API简介](#1-云雾api简介)
2. [核心优势](#2-核心优势)
3. [认证方式](#3-认证方式)
4. [基础请求格式](#4-基础请求格式)
5. [Gemini 聊天接口](#5-gemini-聊天接口)
6. [Gemini 图片生成接口](#6-gemini-图片生成接口)
7. [Gemini 识图接口](#7-gemini-识图接口)
8. [错误处理](#8-错误处理)
9. [最佳实践](#9-最佳实践)
10. [项目集成指南](#10-项目集成指南)

---

## 1. 云雾API简介

**官方网站**: https://yunwu.ai
**API 文档**: https://yunwu.apifox.cn
**Base URL**: `https://yunwu.ai`

云雾 API 是一个**模型中转站**,提供统一的 OpenAI 兼容接口访问 Google Gemini 系列模型。

### 关键特性

- **统一 API Key**: 一个 API Key 支持所有模型
- **热切换模型**: 用户可以灵活切换不同的 Gemini 模型
- **OpenAI 兼容**: 使用标准的 `/v1/chat/completions` 端点
- **无需科学上网**: 国内直连访问
- **高速响应**: 比官方快 1200 倍

---

## 2. 核心优势

1. **无需科学上网** - 国内用户可直接访问
2. **统一接口** - OpenAI Chat Completions 兼容格式
3. **一 Key 通用** - 单个 API Key 支持所有模型
4. **模型丰富** - 支持 Gemini 全系列模型:
   - `gemini-3-flash-preview` (对话/分析)
   - `gemini-2.5-pro` (高级对话)
   - `gemini-3-pro-image-preview` (图片生成)
   - `gemini-2.0-flash-exp-image-generation` (实验性图片生成)
   - `gemini-1.5-pro-latest` (视觉理解)

---

## 3. 认证方式

### Header 认证

所有 API 请求必须在请求头中包含以下信息:

```http
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY
```

### API Key 格式

- 前缀: `yw-` 或 `sk-`
- 示例: `yw-xxxxxxxxxxxxxxxxxxxxxx`

### 获取 API Key

1. 访问 https://yunwu.ai
2. 注册/登录账号
3. 进入"令牌管理"页面
4. 创建新的 API Key

---

## 4. 基础请求格式

### 统一端点

**所有请求使用同一个端点**:

```
POST https://yunwu.ai/v1/chat/completions
```

⚠️ **重要**: 云雾 API **不使用** Google 原生的 `generateContent` 格式,而是使用 OpenAI 兼容的 `/v1/chat/completions` 格式。

### 基础请求示例

```bash
curl https://yunwu.ai/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -d '{
    "model": "gemini-3-flash-preview",
    "messages": [
      {"role": "user", "content": "你好"}
    ],
    "temperature": 0.7
  }'
```

### 标准响应格式

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1677858242,
  "model": "gemini-3-flash-preview",
  "usage": {
    "prompt_tokens": 13,
    "completion_tokens": 7,
    "total_tokens": 20
  },
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "你好!有什么我可以帮助你的吗?"
      },
      "finish_reason": "stop"
    }
  ]
}
```

---

## 5. Gemini 聊天接口

### 用途

- 智能客服对话
- 文本分析
- 内容生成
- 提示词优化

### 请求参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `model` | string | 是 | 模型名称 (如 `gemini-3-flash-preview`) |
| `messages` | array | 是 | 消息数组 |
| `temperature` | number | 否 | 随机性 (0-2, 默认 1.0) |
| `max_tokens` | integer | 否 | 最大输出 token 数 |
| `top_p` | number | 否 | 核采样参数 (0-1) |
| `stream` | boolean | 否 | 是否流式输出 (默认 false) |

### Messages 格式

```json
{
  "messages": [
    {
      "role": "system",
      "content": "你是一个专业的电商视觉顾问。"
    },
    {
      "role": "user",
      "content": "帮我设计一个产品主图。"
    }
  ]
}
```

**支持的角色**:
- `system` - 系统提示词
- `user` - 用户输入
- `assistant` - AI 回复

### Python 示例

```python
import httpx

url = "https://yunwu.ai/v1/chat/completions"
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}
payload = {
    "model": "gemini-3-flash-preview",
    "messages": [
        {"role": "system", "content": "你是一个专业助手。"},
        {"role": "user", "content": "你好"}
    ],
    "temperature": 0.2,
    "max_tokens": 300
}

async with httpx.AsyncClient() as client:
    response = await client.post(url, headers=headers, json=payload)
    result = response.json()
    ai_reply = result["choices"][0]["message"]["content"]
```

### 推荐模型

| 模型名称 | 适用场景 | 特点 |
|---------|---------|------|
| `gemini-3-flash-preview` | 智能客服、快速分析 | 速度快、成本低 |
| `gemini-2.5-pro` | 复杂推理、专业咨询 | 能力强、精准度高 |
| `gemini-2.0-flash-thinking` | 需要思考链的任务 | 带思考过程输出 |

---

## 6. Gemini 图片生成接口

### 用途

- 电商主图生成
- 产品视觉创作
- 场景渲染

### 关键特性

⚠️ **重要**: 图片生成也使用 `/v1/chat/completions` 端点,**不是单独的端点**。

### 请求格式

图片生成使用 `content` 数组格式,可以同时包含文本提示和参考图片:

```json
{
  "model": "gemini-3-pro-image-preview",
  "max_tokens": 4096,
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Role: Senior Architect. Subject: premium product. Visual Style: Professional commercial studio."
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/png;base64,iVBORw0KGgoAAAANS..."
          }
        }
      ]
    }
  ]
}
```

### Content 数组说明

**支持的内容类型**:

1. **纯文本**:
   ```json
   {"type": "text", "text": "描述信息"}
   ```

2. **图片 URL**:
   ```json
   {
     "type": "image_url",
     "image_url": {
       "url": "https://example.com/image.jpg"
     }
   }
   ```

3. **Base64 编码图片**:
   ```json
   {
     "type": "image_url",
     "image_url": {
       "url": "data:image/png;base64,iVBORw0KGgo..."
     }
   }
   ```

### Python 示例

```python
import httpx
import base64

# 读取并编码图片
with open("reference.png", "rb") as f:
    image_data = base64.b64encode(f.read()).decode()

url = "https://yunwu.ai/v1/chat/completions"
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}
payload = {
    "model": "gemini-3-pro-image-preview",
    "max_tokens": 4096,
    "messages": [{
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": "Professional commercial photography, premium product in studio lighting."
            },
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{image_data}"
                }
            }
        ]
    }]
}

async with httpx.AsyncClient(timeout=60.0) as client:
    response = await client.post(url, headers=headers, json=payload)
    result = response.json()
    generated_content = result["choices"][0]["message"]["content"]
```

### 推荐模型

| 模型名称 | 适用场景 | 特点 |
|---------|---------|------|
| `gemini-3-pro-image-preview` | 高质量电商主图 | 推荐使用 |
| `gemini-2.5-flash-image` | 快速图片生成 | 速度快 |
| `gemini-2.0-flash-exp-image-generation` | 实验性功能 | 新特性测试 |

---

## 7. Gemini 识图接口

### 用途

- 图片内容分析
- 参考图风格识别
- 产品信息提取

### 请求格式

识图也使用 `/v1/chat/completions` 端点,通过 `content` 数组同时发送文本和图片:

```json
{
  "model": "gemini-1.5-pro-latest",
  "stream": false,
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "请分析这张图片的构图、色调和风格特点。"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://example.com/reference.png"
          }
        }
      ]
    }
  ],
  "temperature": 0.9,
  "max_tokens": 400
}
```

### Python 示例

```python
import httpx

url = "https://yunwu.ai/v1/chat/completions"
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}
payload = {
    "model": "gemini-1.5-pro-latest",
    "stream": False,
    "messages": [{
        "role": "user",
        "content": [
            {"type": "text", "text": "分析这张图片的构图和风格。"},
            {"type": "image_url", "image_url": {"url": image_url}}
        ]
    }],
    "temperature": 0.2,
    "max_tokens": 500
}

async with httpx.AsyncClient() as client:
    response = await client.post(url, headers=headers, json=payload)
    result = response.json()
    analysis = result["choices"][0]["message"]["content"]
```

### 推荐模型

| 模型名称 | 适用场景 |
|---------|---------|
| `gemini-1.5-pro-latest` | 详细图片分析 |
| `gemini-3-flash-preview` | 快速识图 |

---

## 8. 错误处理

### 常见 HTTP 状态码

| 状态码 | 含义 | 处理方式 |
|--------|------|---------|
| 200 | 成功 | 正常处理响应 |
| 400 | 请求参数错误 | 检查请求格式和参数 |
| 401 | API Key 无效或过期 | 检查 Authorization header |
| 403 | API Key 权限不足 | 检查账户权限 |
| 429 | 请求频率过高 | 实施重试机制 |
| 503 | 服务暂时不可用 | 稍后重试 |

### 重试策略示例

```python
async def call_api_with_retry(url, headers, payload, max_retries=2):
    for attempt in range(max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, headers=headers, json=payload)

                if response.status_code == 200:
                    return response.json()
                elif response.status_code == 503:
                    if attempt < max_retries:
                        print(f"503 错误,重试 {attempt + 1}/{max_retries}...")
                        continue
                    else:
                        return {"error": "服务暂时不可用,请稍后重试"}
                else:
                    response.raise_for_status()

        except httpx.TimeoutException:
            if attempt < max_retries:
                print(f"超时,重试 {attempt + 1}/{max_retries}...")
                continue
            else:
                return {"error": "请求超时"}
        except Exception as e:
            return {"error": f"请求失败: {str(e)}"}
```

---

## 9. 最佳实践

### 1. Timeout 设置

```python
# 推荐的超时设置
custom_timeout = httpx.Timeout(
    60.0,       # 读超时: 60秒
    connect=10.0  # 连接超时: 10秒
)

async with httpx.AsyncClient(timeout=custom_timeout) as client:
    response = await client.post(url, headers=headers, json=payload)
```

### 2. Temperature 参数选择

| 任务类型 | 推荐 Temperature |
|---------|-----------------|
| 严肃分析、数据提取 | 0.1 - 0.3 |
| 标准对话 | 0.5 - 0.7 |
| 创意生成 | 0.8 - 1.5 |

### 3. 图片编码最佳实践

```python
import base64
from pathlib import Path

def encode_image_to_base64(image_path: str) -> str:
    """将图片编码为 base64 字符串"""
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")

    # 推断图片格式
    suffix = Path(image_path).suffix.lower()
    mime_type = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp"
    }.get(suffix, "image/png")

    return f"data:{mime_type};base64,{image_data}"
```

### 4. 流式响应处理

```python
async def stream_chat(messages):
    url = "https://yunwu.ai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "gemini-3-flash-preview",
        "messages": messages,
        "stream": True  # 启用流式输出
    }

    async with httpx.AsyncClient() as client:
        async with client.stream("POST", url, headers=headers, json=payload) as response:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    # 处理流式数据
                    chunk = json.loads(data)
                    content = chunk["choices"][0]["delta"].get("content", "")
                    print(content, end="", flush=True)
```

---

## 10. 项目集成指南

### 当前项目问题诊断

❌ **错误的实现** (当前代码):

```python
# 错误: 使用了 Google 原生格式
url = f"{base_url}/v1beta/models/{model}:generateContent"
payload = {
    "contents": [...],  # Google 格式
    "generationConfig": {...}
}
```

✅ **正确的实现**:

```python
# 正确: 使用 OpenAI 兼容格式
url = f"{base_url}/v1/chat/completions"
payload = {
    "model": model_name,
    "messages": [...],  # OpenAI 格式
    "temperature": 0.2,
    "max_tokens": 300
}
```

### 需要修改的文件

1. **`backend/app/core/analyzer.py`** (第 165 行)
   - 修改 URL 为 `/v1/chat/completions`
   - 修改请求体格式为 `messages` 数组

2. **`backend/app/core/replacer.py`** (第 61-64 行)
   - 同上修改

3. **`backend/app/core/painter.py`** (第 36-40 行)
   - 同上修改

4. **`backend/app/api/agent.py`** (第 77-78 行)
   - 同上修改

5. **`backend/app/api/test_connection.py`** (第 33-51 行)
   - 同上修改

### 标准化的 API 调用函数

```python
async def call_yunwu_chat(
    api_key: str,
    model: str,
    messages: list,
    temperature: float = 0.7,
    max_tokens: int = 300,
    base_url: str = "https://yunwu.ai"
) -> dict:
    """
    调用云雾 API 聊天接口 (标准化封装)

    Args:
        api_key: 云雾 API Key
        model: 模型名称 (如 gemini-3-flash-preview)
        messages: 消息数组 [{"role": "user", "content": "..."}]
        temperature: 温度参数 (0-2)
        max_tokens: 最大输出 token 数
        base_url: API 基础 URL

    Returns:
        API 响应的 JSON 对象
    """
    url = f"{base_url}/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens
    }

    timeout = httpx.Timeout(60.0, connect=10.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()


async def call_yunwu_image_generation(
    api_key: str,
    model: str,
    prompt: str,
    reference_images: list = None,
    base_url: str = "https://yunwu.ai"
) -> dict:
    """
    调用云雾 API 图片生成接口

    Args:
        api_key: 云雾 API Key
        model: 模型名称 (如 gemini-3-pro-image-preview)
        prompt: 文本提示词
        reference_images: 参考图片列表 (Base64 编码或 URL)
        base_url: API 基础 URL

    Returns:
        API 响应的 JSON 对象
    """
    content = [{"type": "text", "text": prompt}]

    # 添加参考图片
    if reference_images:
        for img in reference_images:
            content.append({
                "type": "image_url",
                "image_url": {"url": img}
            })

    url = f"{base_url}/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model,
        "max_tokens": 4096,
        "messages": [{"role": "user", "content": content}]
    }

    timeout = httpx.Timeout(60.0, connect=10.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()
```

### 使用示例

```python
# 1. 智能客服对话
messages = [
    {"role": "system", "content": "你是一个专业的电商视觉顾问。"},
    {"role": "user", "content": "帮我设计一个产品主图。"}
]

result = await call_yunwu_chat(
    api_key=config.get_api_key('flash'),
    model=config.get_model('flash'),
    messages=messages,
    temperature=0.2
)

ai_reply = result["choices"][0]["message"]["content"]


# 2. 图片生成
prompt = "Role: Senior Architect. Subject: premium product. Visual Style: Professional commercial studio."
reference_image = encode_image_to_base64("reference.png")

result = await call_yunwu_image_generation(
    api_key=config.get_api_key('image'),
    model=config.get_model('image'),
    prompt=prompt,
    reference_images=[reference_image]
)

generated_content = result["choices"][0]["message"]["content"]


# 3. 图片分析
messages = [{
    "role": "user",
    "content": [
        {"type": "text", "text": "分析这张图片的构图和风格。"},
        {"type": "image_url", "image_url": {"url": reference_image}}
    ]
}]

result = await call_yunwu_chat(
    api_key=config.get_api_key('flash'),
    model="gemini-1.5-pro-latest",
    messages=messages,
    max_tokens=500
)

analysis = result["choices"][0]["message"]["content"]
```

---

## 总结

### 关键要点

1. ✅ **统一端点**: 所有请求使用 `https://yunwu.ai/v1/chat/completions`
2. ✅ **OpenAI 格式**: 使用 `messages` 数组,不是 Google 原生的 `contents`
3. ✅ **一 Key 通用**: 单个 API Key 支持所有模型
4. ✅ **多模态支持**: 通过 `content` 数组同时发送文本和图片
5. ✅ **重试机制**: 处理 503 等临时错误
6. ✅ **超时设置**: 读超时 60s,连接超时 10s

### 下一步行动

1. 修改项目中所有使用 `generateContent` 格式的代码
2. 统一使用 `/v1/chat/completions` 端点
3. 将请求体格式从 Google 原生改为 OpenAI 兼容
4. 实施重试机制和错误处理
5. 测试验证所有功能

---

## 参考链接

- 官方文档: https://yunwu.apifox.cn
- 令牌管理: https://yunwu.ai/token
- 余额管理: https://yunwu.ai/topup
- 在线调试: https://yunwu.apifox.cn/doc-5459006
