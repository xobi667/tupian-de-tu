# API 修改总结报告

> 修改时间: 2025-12-30
> 修改范围: 将所有 Google 原生 API 格式改为 OpenAI 兼容格式

---

## 核心问题诊断

**根本原因**: 项目代码使用了 Google 原生的 `generateContent` API 格式,但云雾 API 实际使用的是 **OpenAI Chat Completions 兼容格式** (`/v1/chat/completions`)。

### 错误的实现 ❌

```python
# 错误的端点
url = f"{base_url}/v1beta/models/{model}:generateContent"

# 错误的请求格式
payload = {
    "contents": [{
        "role": "user",
        "parts": [{"text": "..."}]
    }],
    "generationConfig": {...}
}

# 错误的响应解析
result["candidates"][0]["content"]["parts"][0]["text"]
```

### 正确的实现 ✅

```python
# 正确的端点 (统一)
url = f"{base_url}/v1/chat/completions"

# 正确的请求格式
payload = {
    "model": model_name,
    "messages": [{
        "role": "user",
        "content": "..."
    }],
    "temperature": 0.2,
    "max_tokens": 300
}

# 正确的响应解析
result["choices"][0]["message"]["content"]
```

---

## 修改文件清单

### 1. backend/app/api/test_connection.py

**修改位置**: 第 33-51 行

**修改内容**:
- ✅ 端点改为 `/v1/chat/completions`
- ✅ 请求体从 `contents` 改为 `messages`
- ✅ `parts` 改为直接使用 `content` 字段
- ✅ `generationConfig` 参数平铺到顶层

**修改前**:
```python
url = f"{config.get_base_url()}/v1beta/models/{config.get_model('flash')}:generateContent"
payload = {
    "contents": [{
        "role": "user",
        "parts": [{"text": "Hello, reply with 'OK' if you receive this."}]
    }],
    "generationConfig": {"temperature": 0.1, "maxOutputTokens": 10}
}
```

**修改后**:
```python
url = f"{config.get_base_url()}/v1/chat/completions"
payload = {
    "model": config.get_model('flash'),
    "messages": [{
        "role": "user",
        "content": "Hello, reply with 'OK' if you receive this."
    }],
    "temperature": 0.1,
    "max_tokens": 10
}
```

---

### 2. backend/app/api/agent.py

**修改位置**: 第 77-110 行

**修改内容**:
- ✅ 端点改为 `/v1/chat/completions`
- ✅ 消息历史转换为 OpenAI 格式
- ✅ 添加 `system` 角色支持
- ✅ 响应解析从 `candidates[0].content.parts[0].text` 改为 `choices[0].message.content`

**关键改动**:
```python
# 修改前
url = f"{config.get_base_url()}/v1beta/models/{config.get_model('flash')}:generateContent"
contents = [{"role": "user", "parts": [{"text": f"{system_prompt}\n\n{request.message}"}]}]
payload = {"contents": contents, "generationConfig": {...}}

ai_reply = ai_data["candidates"][0]["content"]["parts"][0]["text"].strip()

# 修改后
url = f"{config.get_base_url()}/v1/chat/completions"
messages = [{"role": "system", "content": system_prompt}]
# ... 添加历史消息 ...
messages.append({"role": "user", "content": request.message})
payload = {"model": config.get_model('flash'), "messages": messages, ...}

ai_reply = ai_data["choices"][0]["message"]["content"].strip()
```

---

### 3. backend/app/core/analyzer.py

**修改位置**: 第 165-212 行

**修改内容**:
- ✅ 端点改为 `/v1/chat/completions`
- ✅ 图片传递从 `inlineData` 改为 `image_url` + base64
- ✅ Multimodal content 使用数组格式: `[{type: "text"}, {type: "image_url"}]`
- ✅ 响应解析简化

**关键改动**:
```python
# 修改前
url = f"{config.get_base_url()}/v1beta/models/{config.get_model('flash')}:generateContent"
payload = {
    "contents": [{
        "role": "user",
        "parts": [
            {"inlineData": {"mimeType": mime_type, "data": image_data}},
            {"text": prompt}
        ]
    }],
    "generationConfig": {...}
}

# 修改后
url = f"{config.get_base_url()}/v1/chat/completions"
payload = {
    "model": config.get_model('flash'),
    "messages": [{
        "role": "user",
        "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{image_data}"}}
        ]
    }],
    "temperature": 0.2,
    "max_tokens": 2000
}
```

---

### 4. backend/app/core/painter.py

**修改位置**: 第 36-160 行

**修改内容**:
- ✅ 端点改为 `/v1/chat/completions`
- ✅ 移除 Google 特有的 `responseModalities`, `imageSizeHint` 参数
- ✅ 完全重写 `parse_image_response()` 函数以支持 OpenAI 格式

**关键改动**:
```python
# 修改前
url = f"{config.get_base_url()}/v1beta/models/{config.get_model('image')}:generateContent"
payload = {
    "contents": [{"role": "user", "parts": [{"text": full_prompt}]}],
    "generationConfig": {
        "temperature": 0.8,
        "topP": 0.95,
        "responseModalities": ["image", "text"],
        "imageSizeHint": "1024x1024"
    }
}

def parse_image_response(result):
    candidate = result["candidates"][0]
    parts = candidate.get("content", {}).get("parts", [])
    for part in parts:
        if "inlineData" in part:
            return part["inlineData"]["data"]

# 修改后
url = f"{config.get_base_url()}/v1/chat/completions"
payload = {
    "model": config.get_model('image'),
    "max_tokens": 4096,
    "messages": [{"role": "user", "content": full_prompt}],
    "temperature": 0.8
}

def parse_image_response(result):
    content = result["choices"][0]["message"]["content"]

    # 支持多种格式: URL, data URI, 纯文本
    if content.startswith("http"):
        return {"image_url": content}
    elif content.startswith("data:image"):
        # 解析 data:image/png;base64,xxx
        return {"image_data": base64_part}
```

---

### 5. backend/app/core/replacer.py

**修改位置**: 第 61-236 行

**修改内容**:
- ✅ 端点改为 `/v1/chat/completions`
- ✅ 多图片请求转换为 multimodal content 数组
- ✅ 重写 `_parse_and_save_result()` 函数

**关键改动**:
```python
# 修改前
url = f"{config.get_base_url()}/v1beta/models/{config.get_model('image')}:generateContent"
payload = {
    "contents": [{
        "role": "user",
        "parts": [
            {"text": "Reference image:"},
            {"inlineData": {"mimeType": ref_mime, "data": ref_data}},
            {"text": "Product image:"},
            {"inlineData": {"mimeType": prod_mime, "data": prod_data}},
            {"text": full_prompt}
        ]
    }],
    "generationConfig": {...}
}

# 修改后
url = f"{config.get_base_url()}/v1/chat/completions"
content = [
    {"type": "text", "text": "Reference image:"},
    {"type": "image_url", "image_url": {"url": f"data:{ref_mime};base64,{ref_data}"}},
    {"type": "text", "text": "Product image:"},
    {"type": "image_url", "image_url": {"url": f"data:{prod_mime};base64,{prod_data}"}},
    {"type": "text", "text": full_prompt}
]
payload = {
    "model": config.get_model('image'),
    "max_tokens": 4096,
    "messages": [{"role": "user", "content": content}],
    "temperature": 0.8
}
```

---

## 关键技术变更总结

### 1. 统一端点

| 用途 | 旧端点 (错误) | 新端点 (正确) |
|------|--------------|--------------|
| 聊天对话 | `/v1beta/models/{model}:generateContent` | `/v1/chat/completions` |
| 图片生成 | `/v1beta/models/{model}:generateContent` | `/v1/chat/completions` |
| 图片分析 | `/v1beta/models/{model}:generateContent` | `/v1/chat/completions` |

**结论**: 所有请求都使用同一个端点 `/v1/chat/completions`

---

### 2. 请求体格式转换

| 字段 | Google 格式 | OpenAI 格式 |
|------|------------|------------|
| 根字段 | `contents` | `messages` |
| 模型指定 | URL 中 | 请求体中 `model` 字段 |
| 消息角色 | `role` (user) | `role` (system/user/assistant) |
| 消息内容 | `parts` 数组 | `content` 字符串或数组 |
| 温度参数 | `generationConfig.temperature` | 顶层 `temperature` |
| 最大 token | `generationConfig.maxOutputTokens` | 顶层 `max_tokens` |
| Top-P | `generationConfig.topP` | 顶层 `top_p` |

---

### 3. Multimodal Content (图片 + 文本)

**Google 格式**:
```python
"parts": [
    {"inlineData": {"mimeType": "image/png", "data": "base64..."}},
    {"text": "Describe this image"}
]
```

**OpenAI 格式**:
```python
"content": [
    {"type": "text", "text": "Describe this image"},
    {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
]
```

---

### 4. 响应格式转换

| 数据 | Google 格式 | OpenAI 格式 |
|------|------------|------------|
| 响应列表 | `candidates` | `choices` |
| 消息内容 | `candidates[0].content` | `choices[0].message` |
| 文本内容 | `content.parts[0].text` | `message.content` |
| 图片数据 | `parts[x].inlineData.data` | `message.content` (data URI 或 URL) |

---

## 测试建议

### 1. 测试连接功能

访问 `http://127.0.0.1:8001/settings.html`:
1. 输入云雾 API Key
2. 点击 "🔌 测试连接" 按钮
3. 应该显示 "✓ 连接成功！API Key 有效，模型响应正常"

### 2. 测试智能客服

访问 `http://127.0.0.1:8001/single.html`:
1. 在聊天侧栏输入任意消息
2. 检查是否能正常收到 AI 回复
3. 查看后端日志,应该没有 503 或 400 错误

### 3. 测试图片分析

1. 上传参考图
2. 查看后端日志中的分析结果
3. 应该返回 JSON 格式的分析数据

### 4. 测试图片生成

1. 上传参考图和产品图
2. 点击生成按钮
3. 检查是否能正常生成新图片

---

## 预期改进

修改完成后,应该解决以下问题:

✅ **503 错误消失** - 之前的 503 错误是因为端点错误导致的
✅ **400 错误消失** - 请求格式现在正确
✅ **API 正常响应** - 使用正确的 OpenAI 兼容格式
✅ **图片生成成功** - 图片生成接口现在使用正确格式
✅ **图片分析成功** - 识图接口现在使用正确格式
✅ **聊天功能正常** - 智能客服对话正常工作

---

## 注意事项

1. **服务器需要重启**: 修改后需要重启 FastAPI 服务器以加载新代码
2. **清除浏览器缓存**: 前端可能需要刷新以获取最新 JS 文件
3. **检查 API Key**: 确保在设置页面配置了有效的云雾 API Key
4. **监控日志**: 首次测试时密切关注后端日志输出

---

## 参考文档

详细的 API 使用说明请参考:
- **云雾API调用文档.md** - 完整的 API 接口文档
- **官方文档**: https://yunwu.apifox.cn

---

## 修改验证清单

- [x] test_connection.py - API 连接测试
- [x] agent.py - 智能客服对话
- [x] analyzer.py - 图片分析
- [x] painter.py - 图片生成
- [x] replacer.py - 批量替换生成

**所有文件已修改完成，等待测试验证。**
