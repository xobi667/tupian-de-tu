# Xobi 实时预览功能 - 实现总结

## 实现完成情况

### ✅ 已完成的任务

#### 1. 后端 API 实现
- [x] 创建 `backend/app/api/preview.py`
  - 预览端点：`POST /api/preview/generate`
  - 接收参数：product_image, reference_image, custom_prompt, custom_text
  - 返回格式：base64 图片数据
  - 特性：不保存文件，自动清理临时文件

- [x] 在 `backend/app/main.py` 中注册路由
  - 导入 preview 模块
  - 注册 preview.router

- [x] 修改 `backend/app/api/agent.py`
  - 在咨询阶段返回 custom_prompt
  - 供前端触发预览使用

#### 2. 前端实现
- [x] 修改 `frontend/assets/js/chat.js`
  - 添加 `generatePreview(prompt)` 函数
  - 添加 `displayPreviewImage(base64Data, mimeType)` 函数
  - 添加 `manualPreview()` 函数
  - 添加自动触发预览逻辑
  - 修改 AI 响应处理逻辑

- [x] 添加 CSS 样式到 `frontend/assets/css/chat.css`
  - 预览消息样式
  - 预览标签样式
  - 预览图容器样式
  - 水印样式
  - 操作按钮样式
  - 响应式布局

- [x] 修改 `frontend/single.html`
  - 添加预览按钮到工具栏（🔍）

#### 3. 文档和测试
- [x] 创建使用指南：`PREVIEW_FEATURE_GUIDE.md`
- [x] 创建测试脚本：`test_preview_api.py`
- [x] 创建实现总结：`PREVIEW_IMPLEMENTATION_SUMMARY.md`

## 核心功能

### 1. 预览触发方式

#### A. 自动触发（主要方式）
```javascript
// 当满足以下条件时自动生成预览：
// 1. 用户已上传参考图和产品图
// 2. AI 返回了建议卡片
// 3. 不是最终生成阶段
if (hasImages && hasSuggestions && isNotFinalGen && data.data?.custom_prompt) {
    generatePreview(data.data.custom_prompt);
}
```

#### B. 手动触发
- 点击工具栏的 🔍 按钮
- 使用当前输入或最后的 prompt

#### C. 建议卡片触发
- 点击 AI 建议卡片
- 自动发送并触发预览

### 2. 预览显示

```html
<div class="message ai preview-message">
    <div class="message-bubble">
        <div class="preview-label">预览图</div>
        <div class="preview-image-container">
            <img src="data:image/png;base64,..." class="preview-image">
            <div class="preview-watermark">PREVIEW</div>
        </div>
        <div class="preview-actions">
            <button class="regenerate-btn">🔄 重新预览</button>
            <button class="apply-btn">✅ 应用此预览（生成高清图）</button>
        </div>
    </div>
</div>
```

### 3. 用户交互流程

```
上传图片 → 输入需求 → AI 分析
                         ↓
                    提供建议
                         ↓
                【自动生成预览】
                         ↓
                    显示预览图
                         ↓
         ┌──────────────┴──────────────┐
         ↓                             ↓
    应用预览                      继续修改
    生成高清图                    重新预览
```

## 技术实现细节

### 后端预览 API

```python
@router.post("/generate")
async def generate_preview(
    product_image: UploadFile,
    reference_image: UploadFile,
    custom_prompt: str,
    custom_text: Optional[str] = None
):
    # 1. 创建临时目录
    temp_dir = os.path.join(config.INPUT_DIR, f"preview_{uuid.uuid4().hex[:8]}")

    # 2. 保存上传的图片
    # ... 保存逻辑

    # 3. 构建预览专用 Prompt
    preview_prompt = f"""{custom_prompt}

    PREVIEW MODE: Generate a quick preview at 512x512 resolution.
    """

    # 4. 生成预览图（不保存文件）
    result = await generate_replacement_image(
        product_image_path=product_path,
        reference_image_path=reference_path,
        generation_prompt=preview_prompt,
        custom_text=custom_text,
        output_path=None  # 不保存
    )

    # 5. 返回 base64 数据
    return JSONResponse({
        "success": True,
        "preview_data": result.get("image_data"),
        "is_preview": True
    })

    # 6. 清理临时文件
    finally:
        shutil.rmtree(temp_dir)
```

### 前端预览生成

```javascript
async function generatePreview(prompt) {
    // 1. 检查图片
    if (!refImg.files[0] || !prodImg.files[0]) {
        addChatMessage('system', '请先上传参考图和产品图');
        return;
    }

    // 2. 构建 FormData
    const formData = new FormData();
    formData.append('product_image', prodImg.files[0]);
    formData.append('reference_image', refImg.files[0]);
    formData.append('custom_prompt', prompt);

    // 3. 调用 API
    const response = await fetch('/api/preview/generate', {
        method: 'POST',
        body: formData
    });

    // 4. 显示预览图
    const data = await response.json();
    if (data.success) {
        displayPreviewImage(data.preview_data, data.mime_type);
    }
}
```

### 自动触发逻辑

```javascript
// 在 sendChat() 的 AI 响应处理中
if (data.response) {
    addChatMessage('ai', data.response);

    // 判断是否自动触发预览
    const shouldGeneratePreview =
        hasUploadedImages() &&
        hasAISuggestions(data.response) &&
        isConsultationPhase(data.response) &&
        data.data?.custom_prompt;

    if (shouldGeneratePreview) {
        window.lastGeneratedPrompt = data.data.custom_prompt;
        setTimeout(() => {
            generatePreview(data.data.custom_prompt);
        }, 500);
    }
}
```

## 关键优化

### 1. 性能优化
- **不保存文件**：预览图直接返回 base64，减少磁盘 I/O
- **自动清理**：使用 try/finally 确保临时文件被删除
- **延迟触发**：setTimeout(500ms) 避免界面卡顿

### 2. 用户体验优化
- **即时反馈**：AI 建议后自动预览
- **明确标识**：预览图带 "PREVIEW" 水印
- **快捷操作**：重新预览和应用按钮
- **错误处理**：友好的错误提示

### 3. 提示词优化
```
原始 Prompt +
"PREVIEW MODE: Generate a quick preview at 512x512 resolution.
Focus on composition and color scheme rather than fine details."
```

## 集成点

### 1. 与现有流程的集成
- **无缝集成**：预览不影响现有生成流程
- **prompt 复用**：预览和正式生成使用相同的 prompt 生成逻辑
- **状态管理**：通过 window.lastGeneratedPrompt 保存状态

### 2. 与 AI Copilot 的集成
- **自动触发**：AI 建议后自动预览
- **数据传递**：agent.py 返回 custom_prompt 供预览使用
- **交互连贯**：预览流程与对话流程无缝衔接

### 3. 与图片生成的集成
- **API 复用**：使用相同的 generate_replacement_image()
- **参数优化**：添加预览模式标识
- **输出格式**：统一的 base64 返回格式

## 测试清单

### 后端测试
- [ ] 预览 API 端点可访问
- [ ] 正确处理文件上传
- [ ] 生成预览图成功
- [ ] 返回正确的 base64 数据
- [ ] 临时文件正确清理
- [ ] 错误处理正确

### 前端测试
- [ ] 自动触发预览工作正常
- [ ] 手动触发预览工作正常
- [ ] 建议卡片点击触发预览
- [ ] 预览图正确显示
- [ ] 水印正确显示
- [ ] 操作按钮功能正常
- [ ] 错误提示正确显示

### 集成测试
- [ ] 完整的用户流程
- [ ] 从预览到正式生成
- [ ] 多次预览生成
- [ ] 不同建议的预览切换

### UI/UX 测试
- [ ] 响应式布局正常
- [ ] 动画过渡流畅
- [ ] 按钮反馈及时
- [ ] 消息滚动正确

## 未来优化方向

### 短期优化（1-2周）
1. **预览参数调整**
   - 允许用户选择预览分辨率（256/512/1024）
   - 添加预览质量选项

2. **预览历史**
   - 保存最近 3-5 个预览
   - 快速切换查看

3. **性能优化**
   - 添加预览缓存机制
   - 相同 prompt 不重复生成

### 中期优化（1个月）
1. **专用预览模型**
   - 使用更快的模型生成预览
   - 降低成本

2. **批量预览**
   - 一次生成多个建议的预览
   - 并排对比显示

3. **智能预测**
   - 在用户输入时预测并预加载
   - 更快的响应速度

### 长期优化（3个月）
1. **实时预览**
   - 用户输入时实时更新预览
   - WebSocket 流式传输

2. **AI 辅助优化**
   - AI 分析预览效果
   - 自动建议优化方向

3. **协作功能**
   - 分享预览给团队
   - 多人投票选择方案

## 文件清单

### 新增文件
```
backend/app/api/preview.py              # 预览 API 路由
PREVIEW_FEATURE_GUIDE.md               # 功能使用指南
PREVIEW_IMPLEMENTATION_SUMMARY.md      # 实现总结
test_preview_api.py                    # API 测试脚本
```

### 修改文件
```
backend/app/main.py                    # 注册预览路由
backend/app/api/agent.py               # 返回 custom_prompt
frontend/assets/js/chat.js             # 预览生成逻辑
frontend/assets/css/chat.css           # 预览样式
frontend/single.html                   # 预览按钮
```

## 如何使用

### 开发环境测试

1. **启动后端服务**
```bash
cd C:\Users\zhouk\Desktop\tupian-de-tu
uvicorn backend.app.main:app --reload
```

2. **访问前端**
```
http://localhost:8000/single.html
```

3. **测试预览功能**
- 上传参考图和产品图
- 输入描述："无线耳机，主动降噪，地铁通勤使用"
- 等待 AI 建议
- 查看自动生成的预览图
- 点击建议卡片查看不同预览
- 点击"应用预览"生成高清图

### API 测试

```bash
# 准备测试图片（放在 test_images 目录）
mkdir test_images
# 复制 product.png 和 reference.png 到 test_images/

# 运行测试脚本
python test_preview_api.py
```

## 总结

实时预览功能已完整实现，包括：

1. **后端 API**：完整的预览生成端点
2. **前端交互**：自动触发、手动触发、建议触发
3. **UI 展示**：美观的预览图显示和操作界面
4. **错误处理**：完善的错误提示和处理
5. **文档测试**：详细的使用指南和测试脚本

该功能无缝集成到现有系统，显著提升了用户体验，使用户能够：
- 快速查看视觉效果
- 减少等待时间
- 降低试错成本
- 提高决策效率

下一步可以进行实际测试并根据用户反馈进行优化。
