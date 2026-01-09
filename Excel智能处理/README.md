# Excel智能处理（表格可视化 + 标题仿写 + 图片代理）核心代码

这个文件夹把项目里“Excel智能处理”模块相关代码按 **前端/后端** 拆出来，方便你直接拷贝融合到别的项目。

## 核心代码清单

### 后端（FastAPI）

- `Excel智能处理/backend/app/api/excel_import.py`
  - `POST /api/excel/upload`：上传 Excel/CSV，返回列名 + 预览行
  - `POST /api/excel/parse`：按字段映射解析整表数据（含多图 URL 逗号拆分）
  - `POST /api/excel/export`：把前端处理结果回写到“新标题/新图片URL/处理状态”并导出 xlsx
  - `GET /api/excel/download/{filename}`：下载导出文件（可选）
  - `DELETE /api/excel/cleanup/{file_id}`：清理临时上传文件（可选）

- `Excel智能处理/backend/app/api/image_proxy.py`
  - `GET /api/proxy-image?url=...`：图片代理（绕过防盗链，支持多图 URL 取第一个）

- `Excel智能处理/backend/app/api/title_rewrite.py`
  - `POST /api/title/rewrite`：单条标题仿写（Header：`X-API-Key` 可选）
  - `POST /api/title/batch-rewrite`：批量标题仿写

- `Excel智能处理/backend/app/config.py`
  - 云雾/Gemini 的 BaseURL、模型、Key；`title_rewrite.py` 会优先读请求头 `X-API-Key`，否则回退到环境变量/运行时配置

- `Excel智能处理/backend/app/middleware/config_middleware.py`
  - 可选：从请求头注入运行时云雾配置（`X-Yunwu-Api-Key` 等）

### 前端（原生 HTML + JS）

- `Excel智能处理/frontend/batch-import.html`：Excel 智能处理页面 UI（表格/弹窗/导出等）
- `Excel智能处理/frontend/assets/js/batch-import-v2.js`：页面主逻辑（上传、字段映射、表格渲染、批量标题仿写、导出）
- `Excel智能处理/frontend/assets/js/batch-import.js`：旧版逻辑（可选参考，不影响 v2）
- `Excel智能处理/frontend/assets/js/platform-specs.js`：平台/比例配置（UI 用）
- `Excel智能处理/frontend/assets/css/base.css`：基础主题样式（可按需替换）
- `Excel智能处理/frontend/integration/single-batch-bridge.js`：可选的“单图工作台 → 回填新图片URL到列表”桥接逻辑

### 文档

- `Excel智能处理/docs/Excel批量处理使用指南.md`：原项目使用说明与接口概览

## 集成要点（你融合到别的项目时通常会踩到的点）

1. **导出文件下载**
   - `excel_import.py` 的导出接口返回 `download_url: /outputs/<file>.xlsx`。
   - 你的服务需要把导出目录以静态资源方式挂载到 `/outputs`（或改前端去调 `/api/excel/download/{filename}`）。

2. **标题仿写的 API Key**
   - 前端默认走 Header：`X-API-Key`。
   - 后端也支持从环境变量读取（见 `backend/app/config.py` 里的 `GEMINI_FLASH_API_KEY`）。

3. **数据目录**
   - `excel_import.py` 默认使用相对路径：`./data/temp_uploads`、`./data/outputs`（按你的项目目录结构自行调整）。
