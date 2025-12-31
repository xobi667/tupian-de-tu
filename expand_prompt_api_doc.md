# Expand Prompt API 文档

## 端点信息

**URL**: `POST /api/chat/expand-prompt`

**功能**: 将用户的简短产品描述扩展成完整的电商主图生成 Prompt

## 请求格式

### Headers
```
Content-Type: application/json
```

### Request Body
```json
{
  "brief": "用户的简短描述"
}
```

**参数说明**:
- `brief` (string, required): 用户的简短产品描述

## 响应格式

### 成功响应 (200 OK)
```json
{
  "expanded_prompt": "扩展后的完整描述"
}
```

**字段说明**:
- `expanded_prompt` (string): 扩展后的完整电商主图生成描述，字数控制在 50-80 字

### 错误响应 (500 Internal Server Error)
```json
{
  "detail": "错误信息"
}
```

## 扩展规则

生成的 Prompt 遵循以下格式：

**产品类别 + 核心卖点 + 使用场景 + 视觉风格要求**

### 要求：
1. **字数控制**: 50-80 字之间
2. **专业性**: 强调电商主图的专业性，使用商业摄影术语
3. **具体化**: 将模糊描述转化为具体的视觉指令
4. **场景化**: 必须包含明确的使用场景
5. **风格化**: 必须包含清晰的视觉风格要求
6. **纯中文输出**: 除专有名词外，全部使用中文

## 使用示例

### 示例 1: 无线耳机

**请求**:
```bash
curl -X POST http://localhost:8000/api/chat/expand-prompt \
  -H "Content-Type: application/json" \
  -d '{"brief": "无线耳机，降噪"}'
```

**响应**:
```json
{
  "expanded_prompt": "专业降噪无线耳机，主打主动降噪技术，适合通勤族在地铁、办公室等嘈杂环境使用，视觉风格要求科技感、简约时尚，突出降噪功能，展示佩戴舒适性"
}
```

### 示例 2: 护肤品

**请求**:
```bash
curl -X POST http://localhost:8000/api/chat/expand-prompt \
  -H "Content-Type: application/json" \
  -d '{"brief": "护肤品，保湿"}'
```

**响应**:
```json
{
  "expanded_prompt": "高端保湿护肤精华，主打深层补水锁水功效，适合干性肌肤女性日常护理使用，视觉风格要求轻奢优雅、清新自然，突出产品质地细腻，展示晶莹剔透的护肤效果"
}
```

### 示例 3: 运动鞋

**请求**:
```bash
curl -X POST http://localhost:8000/api/chat/expand-prompt \
  -H "Content-Type: application/json" \
  -d '{"brief": "运动鞋，跑步"}'
```

**响应**:
```json
{
  "expanded_prompt": "专业跑步运动鞋，主打轻量化缓震设计，适合户外慢跑和健身房训练场景，视觉风格要求动感活力、年轻时尚，突出鞋底科技，展示运动中的流畅感"
}
```

## 技术实现

### 模型配置
- **模型**: Gemini Flash (gemini-3-flash-preview)
- **Temperature**: 0.3 (适中的创造性)
- **Max Tokens**: 200
- **超时设置**: 30秒读超时，10秒连接超时

### System Prompt
使用专门设计的 System Prompt 来确保输出质量：
- 明确角色定位（电商视觉 Prompt 专家）
- 严格的输出格式要求
- 多个优质示例引导
- 字数和风格控制规则

### API 调用
使用 OpenAI 兼容格式调用 Gemini API：
```python
POST {YUNWU_BASE_URL}/v1/chat/completions
Authorization: Bearer {GEMINI_FLASH_API_KEY}

{
  "model": "gemini-3-flash-preview",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "无线耳机，降噪"}
  ],
  "temperature": 0.3,
  "max_tokens": 200
}
```

## 测试

运行测试脚本：
```bash
python test_expand_prompt.py
```

确保后端服务正在运行：
```bash
python -m backend.main
```

## 集成指南

### Python 集成
```python
import requests

def expand_prompt(brief: str) -> str:
    """扩展简短描述为完整 Prompt"""
    response = requests.post(
        "http://localhost:8000/api/chat/expand-prompt",
        json={"brief": brief},
        timeout=30
    )
    if response.status_code == 200:
        return response.json()["expanded_prompt"]
    else:
        raise Exception(f"API Error: {response.status_code}")

# 使用示例
expanded = expand_prompt("智能手表，健康监测")
print(expanded)
```

### JavaScript 集成
```javascript
async function expandPrompt(brief) {
  const response = await fetch('http://localhost:8000/api/chat/expand-prompt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ brief }),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const data = await response.json();
  return data.expanded_prompt;
}

// 使用示例
expandPrompt('咖啡机，自动研磨')
  .then(expanded => console.log(expanded))
  .catch(err => console.error(err));
```

## 注意事项

1. **API Key 配置**: 确保在环境变量或 `.env` 文件中配置了 `GEMINI_FLASH_API_KEY`
2. **网络连接**: 需要能够访问云雾 API (yunwu.ai)
3. **超时处理**: API 调用有 30 秒超时限制，请做好错误处理
4. **并发限制**: 根据 API 配额合理控制并发请求数
5. **字数验证**: 虽然 AI 会尽力控制字数在 50-80 字，但建议前端也做验证

## 错误处理

常见错误及解决方案：

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Connection Error | 后端服务未启动 | 启动后端服务 |
| 401 Unauthorized | API Key 未配置或无效 | 检查环境变量配置 |
| Timeout | API 响应超时 | 检查网络连接，稍后重试 |
| 500 Internal Server Error | 服务器内部错误 | 查看后端日志排查问题 |
