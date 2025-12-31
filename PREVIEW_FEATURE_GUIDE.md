# Xobi 实时预览功能使用指南

## 功能概述

实时预览功能允许用户在对话过程中快速生成低分辨率预览图，提供即时视觉反馈，无需等待完整的高清图生成。

## 核心特性

### 1. 自动预览触发
- **触发时机**：AI 分析完用户需求并提供建议后
- **触发条件**：
  - 用户已上传参考图和产品图
  - AI 返回了视觉建议（包含 [建议N: xxx] 格式）
  - 不是最终生成阶段

### 2. 手动预览触发
- **工具栏按钮**：点击聊天输入框上方的 🔍 按钮
- **使用场景**：
  - 用户想快速查看某个描述的效果
  - 在选择建议之前先预览
  - 修改描述后想立即看到效果

### 3. 建议卡片预览
- 点击 AI 提供的建议卡片
- 自动发送选中的建议并触发预览生成

## 预览参数

### 技术规格
- **分辨率**：512x512（固定）
- **生成模式**：快速预览模式
- **超时设置**：60秒
- **成本**：使用与正式生成相同的 API，但分辨率更低

### 预览提示词优化
预览请求会在用户的 prompt 基础上添加：
```
PREVIEW MODE: Generate a quick preview at 512x512 resolution for rapid feedback.
Focus on overall composition and color scheme rather than fine details.
```

## 用户交互流程

### 完整流程
```
1. 用户上传参考图和产品图
   ↓
2. 用户输入需求描述
   ↓
3. AI 分析并提供建议
   ↓
4. 【自动】生成预览图并显示在聊天中
   ↓
5. 用户查看预览效果
   ↓
6a. 满意 → 点击"应用此预览" → 生成高清图
6b. 不满意 → 继续修改需求 → 重新预览
6c. 想尝试其他方案 → 点击其他建议 → 生成新预览
```

### 预览图显示
- 显示在聊天消息中
- 带有 "PREVIEW" 水印
- 提供两个操作按钮：
  - **🔄 重新预览**：使用相同参数重新生成
  - **✅ 应用此预览（生成高清图）**：触发完整生成

## API 端点

### POST /api/preview/generate

**请求参数**：
```
- product_image: File (产品图)
- reference_image: File (参考图)
- custom_prompt: string (生成提示词)
- custom_text: string? (可选文案)
```

**响应格式**：
```json
{
  "success": true,
  "preview_data": "base64...",
  "is_preview": true,
  "mime_type": "image/png"
}
```

## 前端实现

### 核心函数

#### generatePreview(prompt)
- 负责调用预览 API
- 处理图片上传和表单数据构建
- 错误处理和用户提示

#### displayPreviewImage(base64Data, mimeType)
- 在聊天界面渲染预览图
- 添加水印和操作按钮
- 滚动到最新消息

#### manualPreview()
- 手动触发预览生成
- 使用输入框内容或最后生成的 prompt

### 自动触发逻辑
在 `sendChat()` 函数的 AI 响应处理中：
```javascript
const hasImages = /* 检查是否上传图片 */;
const hasSuggestions = aiReply.includes('[建议');
const isNotFinalGen = /* 检查不是最终生成 */;

if (hasImages && hasSuggestions && isNotFinalGen && data.data?.custom_prompt) {
    window.lastGeneratedPrompt = data.data.custom_prompt;
    setTimeout(() => {
        generatePreview(data.data.custom_prompt);
    }, 500);
}
```

## 后端实现

### preview.py 路由
- 接收图片和 prompt
- 调用 `generate_replacement_image()` 但不保存文件
- 返回 base64 编码的图片数据

### 优化点
1. **不保存临时文件**：直接返回 base64 数据
2. **自动清理**：完成后删除临时上传文件
3. **专用提示词**：添加预览模式指示

### agent.py 修改
- 在咨询阶段也返回 `custom_prompt`
- 供前端触发预览使用
- 保持与最终生成的 prompt 格式一致

## CSS 样式

### 预览消息样式
```css
.preview-message .message-bubble {
    max-width: 500px;
    padding: 1.2rem;
}
```

### 预览标签
```css
.preview-label {
    background: var(--accent-gradient);
    color: white;
    padding: 0.3rem 0.8rem;
    border-radius: 8px;
    text-transform: uppercase;
}
```

### 水印
```css
.preview-watermark {
    position: absolute;
    transform: translate(-50%, -50%) rotate(-15deg);
    font-size: 3rem;
    color: rgba(255, 255, 255, 0.15);
}
```

### 操作按钮
- 重新预览按钮：次要样式
- 应用预览按钮：主要渐变样式

## 测试场景

### 1. 基础流程测试
- [ ] 上传参考图和产品图
- [ ] 输入简单描述
- [ ] 验证 AI 返回建议
- [ ] 验证自动生成预览图
- [ ] 预览图正确显示

### 2. 手动触发测试
- [ ] 点击 🔍 按钮
- [ ] 输入框有内容时触发
- [ ] 输入框为空但有历史 prompt 时触发
- [ ] 两种情况都没有时显示提示

### 3. 建议卡片测试
- [ ] 点击建议卡片
- [ ] 验证发送消息
- [ ] 验证触发新预览

### 4. 预览操作测试
- [ ] 点击"重新预览"
- [ ] 点击"应用此预览"
- [ ] 验证生成高清图

### 5. 错误处理测试
- [ ] 未上传图片时触发预览
- [ ] API 调用失败
- [ ] 网络超时
- [ ] 验证错误消息显示

### 6. UI/UX 测试
- [ ] 预览图水印清晰可见
- [ ] 按钮响应流畅
- [ ] 聊天自动滚动到新消息
- [ ] 移动端响应式布局

## 优化建议

### 性能优化
1. **缓存预览图**：相同 prompt 不重复生成
2. **并行处理**：预览和 AI 建议并行
3. **进度指示**：显示预览生成进度

### 成本优化
1. **专用预览模型**：使用更便宜的快速模型
2. **限流控制**：限制预览生成频率
3. **缓存策略**：缓存常见预览结果

### 用户体验优化
1. **预览历史**：保存最近的预览图
2. **对比视图**：并排显示多个预览
3. **快速切换**：在不同建议的预览间快速切换
4. **预览参数调整**：允许用户调整预览分辨率

## 文件变更清单

### 新增文件
- `backend/app/api/preview.py` - 预览 API 路由

### 修改文件
- `backend/app/main.py` - 注册预览路由
- `backend/app/api/agent.py` - 返回 custom_prompt
- `frontend/assets/js/chat.js` - 预览生成逻辑
- `frontend/assets/css/chat.css` - 预览样式
- `frontend/single.html` - 添加预览按钮

## 总结

实时预览功能通过在对话过程中提供快速视觉反馈，显著提升了用户体验：
- 减少等待时间
- 增加交互性
- 降低试错成本
- 提高用户满意度

该功能与现有系统无缝集成，保持了 Xobi 的设计理念和技术架构。
