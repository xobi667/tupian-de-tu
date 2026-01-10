# Xobi API 文档

## 基础信息

- **Base URL**: `/api` (开发环境通过 Vite proxy 转发，生产环境通过 nginx 转发)
- **超时时间**: 300秒（AI 生成可能较慢）
- **数据格式**: JSON (FormData 除外)

## AI API 配置

所有 AI 功能都需要在设置中配置 API：

```typescript
{
  "api": {
    "base_url": "https://yunwu.ai/v1",  // 必须是 OpenAI 兼容格式
    "api_key": "your-api-key"
  },
  "models": {
    "text_model": "gemini-2.0-flash-exp",
    "image_model": "imagen-3.0-generate-001"
  }
}
```

⚠️ **重要**：`base_url` 必须以 `/v1` 结尾，否则会导致 503 错误或返回 HTML。

## 核心 API

### 1. 项目管理

#### 创建项目
```http
POST /api/projects
Content-Type: application/json

{
  "creation_type": "idea" | "outline" | "descriptions",
  "idea_prompt": "string (可选)",
  "outline_text": "string (可选)",
  "description_text": "string (可选)",
  "template_style": "string (可选)",
  "project_type": "ecom",
  "page_aspect_ratio": "3:4",
  "cover_aspect_ratio": "1:1"
}
```

#### 获取项目列表
```http
GET /api/projects?limit=20&offset=0
```

#### 获取项目详情
```http
GET /api/projects/:projectId
```

#### 删除项目
```http
DELETE /api/projects/:projectId
```

### 2. 图片识别（详情页功能）

#### 识别商品图片
```http
POST /api/materials/caption
Content-Type: application/json

{
  "material_urls": ["url1", "url2", "url3"],  // 最多3张
  "prompt": "string (可选)"
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "captions": [
      {"url": "...", "caption": "..."}
    ],
    "combined_caption": "品类=...；材质=...；外观=..."
  }
}
```

**常见错误**：
- `503 Service Unavailable`: API Base URL 配置错误，检查是否以 `/v1` 结尾
- 返回 HTML: API Base URL 不是 OpenAI 兼容格式
- 识别失败: 图片格式不支持或太大

### 3. 素材管理

#### 上传素材
```http
POST /api/materials
Content-Type: multipart/form-data

material_file: File
project_id: string (可选)
```

#### 关联素材到项目
```http
POST /api/projects/:projectId/materials
Content-Type: application/json

{
  "material_ids": ["id1", "id2"]
}
```

### 4. 生成相关

#### 生成大纲
```http
POST /api/projects/:projectId/generate/outline
Content-Type: application/json

{
  "language": "zh-CN" | "zh-TW" | "en" | "ja" | "ko"
}
```

#### 生成描述
```http
POST /api/projects/:projectId/generate/descriptions
Content-Type: application/json

{
  "language": "zh-CN"
}
```

#### 生成图片
```http
POST /api/projects/:projectId/pages/:pageId/generate/image
Content-Type: application/json

{
  "force_regenerate": boolean
}
```

### 5. AI 聊天（画布页面）

画布页面的 AI 聊天通过设置中配置的 API 直接调用：

```http
POST {API_BASE_URL}/v1/chat/completions
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "model": "gemini-2.0-flash-exp",
  "messages": [
    {"role": "system", "content": "你是一个专业的AI设计助手"},
    {"role": "user", "content": "用户消息"}
  ],
  "temperature": 0.7
}
```

## 错误处理

### 标准错误响应
```json
{
  "success": false,
  "error": "错误信息"
}
```

### 常见错误码
- `400 Bad Request`: 请求参数错误
- `404 Not Found`: 资源不存在
- `500 Internal Server Error`: 服务器内部错误
- `503 Service Unavailable`: AI API 配置错误或服务不可用

## 最佳实践

1. **图片上传**
   - 支持格式：JPG、PNG、WEBP
   - 建议大小：< 5MB
   - 使用 FormData 上传

2. **API 调用**
   - 生成操作可能需要较长时间（30-300秒）
   - 实现适当的超时处理
   - 显示加载状态给用户

3. **错误处理**
   - 检查 API 配置（特别是 base_url）
   - 提供友好的错误提示
   - 记录详细的错误日志

4. **图片识别**
   - 最多同时识别 3 张图片
   - 使用清晰的提示词
   - 检查返回结果是否为 HTML（表示配置错误）

## 完整示例

### 详情页生成流程
```typescript
// 1. 上传商品图片
const material = await uploadMaterial(file, null);

// 2. 识别图片内容
const caption = await captionMaterials([material.url], prompt);

// 3. 创建项目
const project = await createProject({
  creation_type: 'idea',
  idea_prompt: `商品信息：${caption.combined_caption}\\n用户描述：${userInput}`,
  project_type: 'ecom',
  page_aspect_ratio: '3:4',
  cover_aspect_ratio: '1:1'
});

// 4. 生成大纲
await generateOutline(project.id);

// 5. 生成描述
await generateDescriptions(project.id);

// 6. 生成图片
for (const page of project.pages) {
  await generatePageImage(project.id, page.id);
}
```

## 调试技巧

1. **检查网络请求**
   - 打开浏览器开发者工具 → Network
   - 查看请求/响应详情
   - 检查 HTTP 状态码

2. **查看控制台日志**
   - 前端错误会输出到浏览器控制台
   - 后端错误会输出到终端

3. **验证 API 配置**
   - 访问 `/settings` 检查配置
   - 使用 curl 测试 API 连通性：
     ```bash
     curl -X POST https://yunwu.ai/v1/chat/completions \\
       -H "Authorization: Bearer YOUR_API_KEY" \\
       -H "Content-Type: application/json" \\
       -d '{"model":"gemini-2.0-flash-exp","messages":[{"role":"user","content":"hi"}]}'
     ```
