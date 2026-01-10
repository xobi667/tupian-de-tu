# Xobi - AI 电商图像生成平台

一个基于 AI 的电商图像生成平台，支持单图创作、批量生成、详情页生成等功能。

## 🚀 快速开始

### 前置要求
- Node.js 18+
- Python 3.9+
- 后端服务已启动（运行 `Xobi 启动器.bat`）

### 安装

```bash
# 进入前端目录
cd xobixiangqing/frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000

## 📁 项目结构

```
E:\xobi\
├── xobixiangqing/          # 主项目（React + TypeScript + Vite）
│   ├── frontend/           # 前端代码
│   │   ├── src/
│   │   │   ├── pages/     # 页面组件
│   │   │   ├── components/ # 共享组件
│   │   │   ├── api/       # API 接口
│   │   │   └── store/     # 状态管理
│   │   └── package.json
│   └── backend/           # 后端代码（Python Flask）
│
├── 自己版本/              # 旧版 HTML 工具（通过 iframe 集成）
│   └── frontend/
│       ├── single-antdx.html  # 单图创作工具
│       ├── batch-antdx.html   # 批量工厂
│       └── assets/
│
└── docs/                  # 项目文档（本次整理）
    ├── README.md          # 本文件
    ├── SETUP.md           # 环境配置指南
    ├── API.md             # API 文档
    └── CHANGELOG.md       # 更新日志
```

## ✨ 核心功能

### 1. 首页 - AI 设计助手
- **智能输入框**：支持自然语言描述创作需求
- **配置选项**：类型、模型、张数、平台、语言、智能比例
- **其他工具**：批量工厂、详情页生成快捷入口

### 2. 无限画布
- **左侧工具栏**：选择、画框、文字、形状、图片、裁剪、AI 编辑、导出
- **中间画布区**：嵌入单图创作工具（iframe）
- **右侧 AI 对话**：实时 AI 聊天，支持真实 API 调用
- **顶部工具**：放大、网格、取色器

### 3. 详情页生成
- **多种创建方式**：
  - 电商详情页：上传商品图 → AI 识别 → 生成详情页
  - 纯文本生成：文字描述 → 生成结构和文案
  - 从结构生成：粘贴结构 → AI 切分并生成
  - 从逐页文案生成：粘贴文案 → 直接生成图片

### 4. 批量工厂
- 批量处理多张图片
- 支持背景替换、风格迁移、尺寸调整

## ⚙️ 设置配置

访问 `/settings` 配置以下选项：

### AI API 配置
```json
{
  "api": {
    "base_url": "https://yunwu.ai/v1",  // OpenAI 兼容格式
    "api_key": "your-api-key"
  },
  "models": {
    "text_model": "gemini-2.0-flash-exp",
    "image_model": "imagen-3.0-generate-001"
  }
}
```

### 重要提示
⚠️ **API Base URL 必须使用 `/v1` 结尾的 OpenAI 兼容地址**，否则可能出现：
- 503 错误
- 图片识别失败
- 返回 HTML 网页源码

## 🔧 常见问题

### 1. 详情页图片识别失败
**问题**：Request failed with status code 503 或识别不了图片

**解决方案**：
- 检查设置中的 API Base URL 是否正确（必须是 `/v1` 结尾）
- 确认 API Key 有效
- 检查图片格式（支持 JPG、PNG、WEBP）
- 检查图片大小（建议 < 5MB）

### 2. 画布服务未连接
**问题**：显示"未检测到画布服务"

**解决方案**：
- 运行 `Xobi 启动器.bat` 启动后端服务
- 检查 `VITE_LEGACY_TOOLS_BASE_URL` 环境变量（默认 http://127.0.0.1:8001）

### 3. AI 聊天无响应
**问题**：AI 聊天发送消息后没有回复

**解决方案**：
- 检查设置中的 API 配置
- 查看浏览器控制台错误信息
- 确认 API 服务可访问

## 🔄 更新日志

### 2026-01-11 - 重大优化
✅ **删除冗余功能**
- 删除了老版本首页（HomePage.tsx、PortalLayout.tsx）
- 删除了 GitHub 跳转组件
- 简化了路由结构

✅ **首页优化**
- 新增完整的配置选项（类型、模型、张数、平台、语言、智能比例）
- 平台支持：淘宝/天猫、京东、拼多多、抖音、小红书、Amazon、eBay、Shopify、Instagram、Facebook
- 添加"其他工具"入口（批量工厂、详情页生成）

✅ **画布页面优化**
- 改进 UI 布局，增加顶部工具栏
- **对接真实 AI API**：支持 OpenAI 兼容格式的 API 调用
- 右侧 AI 聊天支持实时对话，显示加载状态
- 自动读取首页传递的配置信息

✅ **Bug 修复**
- 修复详情页图片识别 503 错误
- 修复 API 调用格式问题
- 优化错误提示信息

## 📝 开发指南

### 环境变量
创建 `.env` 文件：

```env
# 开发环境端口
VITE_PORT=3000

# 后端 API 地址（通过 Vite proxy 自动转发）
# 生产环境通过 nginx 转发，无需配置

# 旧版工具服务地址
VITE_LEGACY_TOOLS_BASE_URL=http://127.0.0.1:8001
```

### 构建生产版本
```bash
npm run build
```

生成的文件在 `dist/` 目录

### 运行测试
```bash
npm run test        # 单元测试
npm run test:e2e    # E2E 测试
```

## 🤝 技术栈

### 前端
- **框架**: React 18.2.0 + TypeScript
- **构建工具**: Vite 5.0.8
- **路由**: React Router v6.20.0
- **UI 库**: Ant Design 5.26.7 + Lucide Icons
- **状态管理**: Zustand 4.4.7
- **样式**: Tailwind CSS 3.3.6

### 后端
- **框架**: Python Flask
- **AI**: OpenAI API (兼容格式)

## 📄 许可证

MIT License

## 🔗 相关链接

- [API 文档](./docs/API.md)
- [环境配置指南](./docs/SETUP.md)
- [更新日志](./docs/CHANGELOG.md)

---

**注意**：本项目处于活跃开发中，API 和功能可能会发生变化。
