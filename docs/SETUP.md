# 环境配置指南

## 系统要求

- **Node.js**: 18.0.0 或更高版本
- **Python**: 3.9 或更高版本
- **npm**: 8.0.0 或更高版本
- **操作系统**: Windows 10/11, macOS, Linux

## 快速安装

### 1. 安装 Node.js 依赖

```bash
cd E:\xobi\xobixiangqing\frontend
npm install
```

### 2. 配置环境变量

创建 `.env` 文件：

```env
# 前端开发服务器端口
VITE_PORT=3000

# 旧版工具服务地址（单图创作、批量工厂）
VITE_LEGACY_TOOLS_BASE_URL=http://127.0.0.1:8001
```

### 3. 启动后端服务

运行 `Xobi 启动器.bat`（位于项目根目录）

或手动启动：
```bash
cd E:\xobi\backend
python app.py
```

后端服务将运行在：
- API 服务: http://127.0.0.1:5000
- 旧版工具: http://127.0.0.1:8001

### 4. 启动前端开发服务器

```bash
cd E:\xobi\xobixiangqing\frontend
npm run dev
```

访问 http://localhost:3000

## AI API 配置

### 方法 1: 通过设置页面配置（推荐）

1. 访问 http://localhost:3000/settings
2. 填写以下信息：
   - **API Base URL**: `https://yunwu.ai/v1` (必须以 `/v1` 结尾)
   - **API Key**: 你的 API 密钥
   - **文本模型**: `gemini-2.0-flash-exp`
   - **图像模型**: `imagen-3.0-generate-001`
3. 点击"测试连接"验证配置
4. 点击"保存"

### 方法 2: 直接编辑 localStorage

打开浏览器控制台，执行：

```javascript
localStorage.setItem('xobi_settings', JSON.stringify({
  api: {
    base_url: 'https://yunwu.ai/v1',
    api_key: 'YOUR_API_KEY'
  },
  models: {
    text_model: 'gemini-2.0-flash-exp',
    image_model: 'imagen-3.0-generate-001',
    vision_model: 'gemini-2.0-flash-exp'
  },
  generation: {
    image_quality: '2K',
    max_description_concurrency: 5,
    max_image_concurrency: 3
  },
  output_language: 'zh-CN'
}));
```

### 支持的 API 提供商

#### 云雾 AI (推荐)
```
Base URL: https://yunwu.ai/v1
模型: gemini-2.0-flash-exp, imagen-3.0-generate-001
```

#### OpenAI
```
Base URL: https://api.openai.com/v1
模型: gpt-4, gpt-4-turbo, dall-e-3
```

#### 其他 OpenAI 兼容 API
只要支持 `/v1/chat/completions` 格式即可。

## 生产环境部署

### 1. 构建前端

```bash
cd E:\xobi\xobixiangqing\frontend
npm run build
```

生成的文件在 `dist/` 目录

### 2. 配置 Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    root /path/to/xobi/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /files {
        proxy_pass http://127.0.0.1:5000;
    }

    location /health {
        proxy_pass http://127.0.0.1:5000;
    }

    # 旧版工具代理（如果需要）
    location /legacy/ {
        proxy_pass http://127.0.0.1:8001/;
    }
}
```

### 3. 使用 PM2 管理后端进程

```bash
# 安装 PM2
npm install -g pm2

# 启动 Flask 应用
pm2 start app.py --name xobi-backend --interpreter python3

# 查看状态
pm2 status

# 查看日志
pm2 logs xobi-backend

# 设置开机自启
pm2 startup
pm2 save
```

## 故障排查

### 问题 1: npm install 失败

**解决方案**:
```bash
# 清除缓存
npm cache clean --force

# 删除 node_modules 和 package-lock.json
rm -rf node_modules package-lock.json

# 重新安装
npm install
```

### 问题 2: 后端服务无法启动

**检查事项**:
1. Python 版本是否正确
   ```bash
   python --version  # 应该是 3.9+
   ```
2. 端口是否被占用
   ```bash
   netstat -ano | findstr :5000
   netstat -ano | findstr :8001
   ```
3. 依赖是否已安装
   ```bash
   pip install -r requirements.txt
   ```

### 问题 3: API 调用失败（503 错误）

**原因**: API Base URL 配置错误

**解决方案**:
1. 检查设置中的 API Base URL
2. **必须以 `/v1` 结尾**，例如 `https://yunwu.ai/v1`
3. 使用 curl 测试连通性：
   ```bash
   curl -X POST https://yunwu.ai/v1/chat/completions \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model":"gemini-2.0-flash-exp","messages":[{"role":"user","content":"hi"}]}'
   ```

### 问题 4: 图片识别失败

**常见原因**:
1. 图片格式不支持 → 使用 JPG/PNG/WEBP
2. 图片太大 → 压缩到 < 5MB
3. API 配置错误 → 检查 Base URL

### 问题 5: 画布服务未连接

**解决方案**:
1. 确认后端服务已启动
2. 检查 `VITE_LEGACY_TOOLS_BASE_URL` 环境变量
3. 访问 http://127.0.0.1:8001/health 测试连通性

## 开发建议

### 1. 使用 VS Code

推荐扩展：
- ESLint
- Prettier
- TypeScript Vue Plugin (Volar)
- Tailwind CSS IntelliSense

### 2. Git 配置

创建 `.gitignore`:
```
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
```

### 3. 代码格式化

```bash
# 格式化代码
npm run format

# 检查代码风格
npm run lint
```

## 性能优化

### 1. 生产构建优化

在 `vite.config.ts` 中：
```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom'],
          'ui': ['antd', 'lucide-react']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
});
```

### 2. 图片优化

- 使用 WebP 格式
- 压缩图片大小
- 使用 CDN 加速

### 3. API 缓存

- 实现请求去重
- 缓存不变的数据
- 使用 SWR/React Query

## 安全建议

1. **不要提交敏感信息**
   - API Key 保存在 localStorage，不要硬编码
   - 使用环境变量管理配置

2. **HTTPS**
   - 生产环境必须使用 HTTPS
   - 配置 SSL 证书

3. **CORS**
   - 后端配置正确的 CORS 策略
   - 限制允许的域名

## 更多帮助

- [README.md](../README.md) - 项目概述
- [API.md](./API.md) - API 文档
- [CHANGELOG.md](./CHANGELOG.md) - 更新日志

如有问题，请查看项目 Issues 或联系开发团队。
