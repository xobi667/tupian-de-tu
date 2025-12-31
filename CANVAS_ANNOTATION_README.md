# ChatCanvas 画布标注对话功能

参考 Lovart.ai 的 ChatCanvas 功能，为 Xobi 实现的画布标注对话系统。

## 功能概述

ChatCanvas 允许用户在生成的图片上点击添加标注点，为每个位置输入具体的修改需求，然后将这些标注提交给 AI 进行批量处理。

## 核心功能

### 1. 画布标注交互

- **点击添加标注**: 在标注模式下，点击图片任意位置即可添加标注点
- **序号显示**: 每个标注点显示自动递增的序号（1, 2, 3...）
- **输入修改需求**: 点击标注点弹出输入框，可以输入具体的修改要求
- **编辑和删除**: 支持对已有标注进行编辑和删除操作

### 2. 标注数据结构

```javascript
{
  id: 1234567890,           // 唯一标识
  x: 50,                    // X 坐标（百分比）
  y: 30,                    // Y 坐标（百分比）
  text: "这里的背景改成蓝色",  // 修改需求文字
  status: "pending"         // 状态: pending | processing | done
}
```

### 3. UI 组件

#### 标注模式按钮
- 位置: 生成结果区域标题栏右侧
- 功能: 开启/关闭标注模式
- 状态指示: 按钮文字和样式会根据模式状态变化

#### 标注点标记
- 圆形渐变背景 + 白色边框
- 居中显示序号
- 悬停时显示修改需求提示框
- 不同状态显示不同颜色:
  - 待处理 (pending): 紫色渐变
  - 处理中 (processing): 粉红色渐变 + 脉冲动画
  - 已完成 (done): 蓝色渐变

#### 标注输入对话框
- 可拖拽的浮动窗口
- 包含标注序号、文本输入框、保存和删除按钮
- Enter 键快速保存，Esc 键关闭

#### 标注列表面板
- 底部抽屉式面板
- 显示所有标注的列表
- 每个标注项显示序号、文字、状态
- 提供提交修改、清空所有标注等操作

## 使用流程

### 1. 开启标注模式

```javascript
// 点击"标注模式"按钮或调用
toggleAnnotationMode();
```

### 2. 添加标注

1. 在标注模式下，点击图片上需要修改的位置
2. 弹出输入框后，输入具体的修改需求（例如: "把这里的背景改成蓝色"）
3. 按 Enter 或点击"保存"按钮

### 3. 管理标注

- **编辑**: 点击已有标注点重新打开输入框
- **删除**: 在输入框中点击"删除"按钮
- **查看列表**: 在底部面板查看所有标注

### 4. 提交修改

点击"提交修改"按钮，所有待处理的标注将被整理成消息发送到 AI 对话系统:

```
我需要修改以下位置：
1. 把这里的背景改成蓝色
2. 添加一个文字"新品上市"
3. 调整这个产品的角度
```

## 技术实现

### 文件结构

```
frontend/
├── assets/
│   ├── js/
│   │   ├── canvas-annotate.js    # 标注系统核心类
│   │   ├── chat.js               # 聊天系统集成
│   │   └── chat-history.js       # 历史记录管理
│   └── css/
│       └── chat.css              # 标注样式（新增 450+ 行）
└── single.html                   # 单图创作页面（已集成）
```

### 核心类: CanvasAnnotator

```javascript
class CanvasAnnotator {
  constructor(imageContainerId, options)
  enable()                           // 开启标注模式
  disable()                          // 关闭标注模式
  toggle()                           // 切换模式
  addAnnotation(x, y, text)         // 添加标注
  updateAnnotation(id, text)        // 更新标注
  deleteAnnotation(id)              // 删除标注
  clearAnnotations()                // 清空所有标注
  submitAnnotations()               // 提交到聊天系统
  getAnnotations()                  // 获取所有标注
  loadAnnotations(annotations)      // 加载标注数据
}
```

### 与现有系统集成

#### 1. 聊天系统集成

```javascript
// 提交标注时自动发送到聊天
annotator.submitAnnotations();
// => 调用 sendChat({ message: "我需要修改以下位置：..." })
```

#### 2. 历史记录集成

```javascript
// 保存会话时自动包含标注数据
saveChatSession(imageData, finalPrompt, {
  productName: "产品名称",
  quality: "1K",
  aspect_ratio: "1:1"
  // annotations 会自动从 annotator 获取
});

// 重新打开历史会话时自动恢复标注
reopenSession(sessionId);
// => 自动调用 annotator.loadAnnotations(session.annotations)
```

#### 3. 标签引用系统兼容

标注系统与现有的 `@` 引用系统完全兼容，可以在标注文字中使用 `@参考图`、`@产品图` 等引用。

## 样式定制

所有样式定义在 `chat.css` 中，使用 CSS 变量以保持与 Xobi UI 风格一致:

```css
/* 主要使用的 CSS 变量 */
--accent-color        /* 强调色（紫色） */
--accent-gradient     /* 渐变背景 */
--bg-primary          /* 主背景色 */
--bg-secondary        /* 次背景色 */
--bg-tertiary         /* 第三背景色 */
--text-primary        /* 主文字色 */
--text-secondary      /* 次文字色 */
--border-color        /* 边框色 */
```

## API 参考

### 全局函数

```javascript
// 初始化标注系统（页面加载时自动调用）
initCanvasAnnotator()

// 切换标注模式
toggleAnnotationMode()

// 提交所有标注到聊天
submitAnnotations()

// 清空所有标注
clearAnnotations()
```

### 事件回调

```javascript
const annotator = new CanvasAnnotator('container-id', {
  onAnnotationAdd: (annotation) => {
    console.log('标注已添加:', annotation);
  },
  onAnnotationDelete: (annotation) => {
    console.log('标注已删除:', annotation);
  },
  onAnnotationUpdate: (annotation) => {
    console.log('标注已更新:', annotation);
  }
});
```

## 使用示例

### 示例 1: 基础使用

```javascript
// 1. 开启标注模式
toggleAnnotationMode();

// 2. 用户点击图片添加标注点
// 3. 输入修改需求: "把背景改成蓝色"
// 4. 保存标注

// 5. 提交所有标注
submitAnnotations();
// => 发送消息到 AI: "我需要修改以下位置：1. 把背景改成蓝色"
```

### 示例 2: 程序化添加标注

```javascript
// 直接添加标注（不通过点击）
if (annotator) {
  annotator.addAnnotation(50, 30, '调整产品角度');
  annotator.addAnnotation(80, 60, '添加阴影效果');
}
```

### 示例 3: 导出/导入标注

```javascript
// 导出标注数据
const annotations = annotator.getAnnotations();
const json = JSON.stringify(annotations);

// 导入标注数据
const imported = JSON.parse(json);
annotator.loadAnnotations(imported);
```

## 性能优化

1. **坐标使用百分比**: 确保在不同分辨率下标注位置准确
2. **DOM 批量更新**: 使用 `renderAnnotations()` 统一渲染，避免频繁操作 DOM
3. **事件委托**: 标注点击事件使用事件委托，减少事件监听器数量
4. **LocalStorage 存储**: 历史记录包含标注数据，自动持久化

## 浏览器兼容性

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

需要支持的特性:
- CSS Grid / Flexbox
- ES6 Class
- Arrow Functions
- Template Literals
- LocalStorage API

## 常见问题

### Q: 如何在标注模式下禁止图片拖拽？

A: 标注模式开启时，自动添加 `pointer-events: none` 到图片元素。

### Q: 标注点的坐标是如何计算的？

A: 使用百分比坐标系统，基于图片容器的 `getBoundingClientRect()`，确保缩放后坐标不变。

### Q: 如何修改标注点的样式？

A: 在 `chat.css` 中修改 `.annotation-marker` 相关样式。

### Q: 标注数据会保存在哪里？

A: 标注数据保存在两个地方：
1. 内存中的 `annotator.annotations` 数组
2. LocalStorage 中的聊天历史记录（通过 `chatHistoryManager`）

## 未来增强

可能的功能扩展方向：

- [ ] 支持矩形框选区域
- [ ] 支持箭头指向标注
- [ ] 支持标注分组
- [ ] 支持标注优先级
- [ ] 支持多人协作标注
- [ ] 支持标注版本历史
- [ ] 支持标注模板

## 更新日志

### v1.0.0 (2025-12-31)

- ✅ 基础标注功能
- ✅ 点击添加标注点
- ✅ 标注输入对话框
- ✅ 标注列表面板
- ✅ 与聊天系统集成
- ✅ 与历史记录集成
- ✅ 标注状态管理
- ✅ 拖拽对话框
- ✅ 响应式设计

## 贡献者

- Claude Sonnet 4.5 - 核心开发

## 许可证

与 Xobi 项目保持一致
