# 批量工作台（Excel 桥接）设计稿 v1

> 定位：Excel 不是“产品本体”，而是跨境电商批量作业的**数据桥梁**：  
> - 导入：把平台/ERP 的表格数据导入工作台，成为可批量处理的数据集  
> - 导出：把处理结果导出为“可一键上架”的 Excel（平台模板/ERP 模板）
>
> 这要求：批量处理必须可追踪（Job），产物必须可复用（Asset），并能回写到 DatasetItem（行/SKU）。

---

## 1) 核心概念

### 1.1 Dataset（数据集）
一次 Excel 导入对应一个 Dataset：
- `dataset_id`
- `source_asset_id`（原始 Excel 文件作为 Asset）
- `template_key`（平台模板标识：如 shopee/amazon/shein/tiktok/自定义）
- `columns`（原始列清单）
- `mapping`（列→规范字段 的映射）
- `status`（active/archived）
- `created_at/updated_at`

### 1.2 DatasetItem（行 / SKU / Listing）
Dataset 的每一行是一个 DatasetItem：
- `item_id`
- `dataset_id`
- `_row_index`（导出回写必需）
- `external_ids`：`skuid`、`product_id`、`variant_id`（按平台可选）
- 规范字段（canonical）：
  - `title`（原始标题）
  - `images`（原始图片 URL 列表）
  - `main_image`
  - `price`
  - `category`
  - `attributes`（可选：颜色/尺码/材质等，结构化）
- 处理结果字段：
  - `new_title`
  - `new_images`（或 `new_main_image/new_gallery_images`）
  - `status`（pending/processing/done/failed）
  - `errors`（数组）
- 关联：
  - `asset_ids`（行相关的输入/输出资产集合）
  - `project_id`（可选：此行是否已生成/绑定一个 Project，用于详情页/多图生产）

### 1.3 ExportProfile（上架导出模板）
ExportProfile 解决“不同平台 Excel 列结构不同”的问题：
- `profile_id`
- `template_key`（同 Dataset）
- `mode`：overwrite/append
- `column_rules`：
  - 标题列回写到哪一列（或新增列）
  - 图片列：单列逗号分隔 / 多列展开 / 多语言多列
  - 价格/类目等字段是否回写
- `encoding`（utf-8-sig/gbk…）
- `separator`（逗号/分号/换行…）

> 结论：Excel 页的“字段映射”与“上架导出”都应该是可复用/可保存的 Profile，而不是一次性选择。

---

## 2) 批量工作台的用户流程（强推荐固定为 5 步）

### Step 1：导入
- 上传 Excel/CSV（生成 `Asset(type=EXCEL_SOURCE)`）
- 创建 Dataset（记录 columns + 文件元信息）
- 展示 preview rows（前 10 行）

### Step 2：字段映射（Mapping）
- 自动推荐映射（基于列名关键字 + 样例值特征）
- 用户确认/修改映射
- 保存为：Dataset.mapping（并可保存为 ExportProfile/MappingProfile 预设）

### Step 3：数据视图（表格/画廊）
- Table 视图：便于批量勾选/编辑标题/查看状态
- Gallery 视图：便于查看图片效果（原图 vs 新图对比）
- 图片展示统一走 Proxy（绕防盗链）
- 支持：搜索、过滤（状态/类目/是否有图/是否失败）、分页、批量选择

### Step 4：批量动作（Actions → Jobs）
每个动作都要生成 Job，并能挂到 Dataset 或 DatasetItem：
- 批量标题仿写（TITLE_REWRITE）
- 批量主图替换（IMAGE_REPLACE_BATCH）
- 批量风格化（STYLE_BATCH）
- （后期/待开发）批量生成详情页/多图（PROJECT_GENERATE：为每行创建/绑定 Project，然后走 A 的 outline/desc/image）
- 批量图片后处理（EDITOR_BATCH：裁剪到平台规格/加字/压缩/转格式）

关键要求：
- Job 可暂停/取消/重试（哪怕 MVP 先不做暂停，也要设计上能扩展）
- Job 输出必须落成 Asset，并回写 DatasetItem 的结果字段

### Step 5：导出（上架表）
- 选择 ExportProfile（平台模板）
- 输出 `Asset(type=EXCEL_EXPORT)` + 下载链接
- 支持两类导出：
  - overwrite：把 `new_title/new_images` 写回原列（或指定列）
  - append：新增 “新标题/新图片/处理状态/错误原因” 列，避免破坏原表

---

## 3) “共享项目/素材/任务”如何落在 Excel 上

### 3.1 从 Excel 行到 Project（详情页/多图）
典型场景：跨境电商做完标题/主图后，还要生成详情页（多张图）。

> 你已决定：v1 先把“桥接入口”做出来即可，**批量生成详情页多图暂不开发**（后期再做）。
- 用户在 Excel 里勾选 N 行 → “生成详情页”
- 系统为每行：
  - 生成/绑定一个 Project（A 的 Project）
  - 把行字段（标题/卖点/类目/图片/参考资料）编译成 Project.idea_prompt
  - 可选：把原始图片导入 Material 作为参考
  - （后期/待开发）调用 A 的生成链路（outline/desc/images）
- 结果：
  - （后期/待开发）Project 产物（多张图）落成 Asset + PageVersion
  - （后期/待开发）Excel 行回写“多图字段/zip 下载链接”（取决于平台模板）

### 3.2 Excel 行与工厂能力（替换/风格/画布）
典型场景：只做“主图替换/风格化”不需要多页项目。
- 行选择 → 发起 Replace/Style Job（B 的能力）
- 输出图落成 Asset，并回写到该行的 `new_main_image`

---

## 4) 取现有代码“最完整实现”的落点建议

### 后端
- Excel 解析/导出：优先用 `tupian-de-tu/backend/app/api/excel_import.py`（含 parse-replace、overwrite 导出）
- 标题仿写 batch：优先用 `自己版本/backend/app/api/title_rewrite.py` 或 `Excel智能处理/backend/app/api/title_rewrite.py`（有 `/api/title/batch-rewrite`）
- 图片代理：用 `tupian-de-tu/backend/app/api/image_proxy.py`
- Job/Dataset/Asset 的持久化与统一查询：建议落在 A（`xobixiangqing`）并逐步抽象成统一 API

### 前端
- Excel 工作台交互：以 `tupian-de-tu/frontend/assets/js/batch-import-v2.js` 的交互为基准，React 化后继续保留：
  - session 持久化
  - table/gallery 双视图
  - 对比视图
  - 批量动作入口
- UI 体系：统一用 Ant Design + Ant Design X；现有静态 AntDX 页可作为原型参照

---

## 5) 需要你确认的 2 个输入（决定 ExportProfile 怎么做）

### 5.1 平台模板优先级（已确认）
你已确认优先支持的平台：**Shopee / SHEIN / Amazon / TikTok / Temu**。  
v1 先以你给的 **`taiyang.xlsx`** 作为首个预置模板（优先满足“能按你们当前表结构导入→处理→导出”的闭环）。  
其余平台模板（SHEIN/Amazon/TikTok/Temu）后续按“给样表 or 我去找官方模板”逐步补齐差异。

### 5.2 图片字段格式偏好（已确认）
这里说的“图片字段格式”只是在 Excel 里表示“多张图片”的两种常见写法，我们内部都会统一成 `images: string[]`，导出时再按模板写回：

**A) 单列逗号分隔（或换行分隔）**
- 表里只有一列：例如 `images` / `图片链接` / `Image URL`
- 单元格里放多张图：  
  - 逗号分隔：`https://a.jpg,https://b.jpg,https://c.jpg`  
  - 或换行分隔：一格里多行（看你们工具是否支持）
- 优点：列少、兼容很多“简化模板/ERP”
- 缺点：有些平台官方模板不接受，需要拆列

**B) 多列展开（image1/image2/... 或 main_image + image2...）**
- 表里有多列：`image1` `image2` `image3`…（或 `main_image` + `other_image1`…）
- 每列只放一张图 URL
- 优点：更贴近不少平台/官方 flat file 的结构
- 缺点：列多、不同平台最大张数/列名差异大

你已选择：**B 多列展开**。  
因此 v1 的默认 `ExportProfile` 会优先支持把 `new_images[]` 写回到 `image1/image2/...`（或你指定的等价列名），并允许按平台配置最大张数与列名规则。

**“新增列 append” vs “覆盖 overwrite”是什么意思？**
- 我们导出一定会生成一个“新 Excel 文件”，不会直接改你原始文件。
- append：在导出的新文件里 **保留原列不动**，新增列例如：`新标题`、`新图片`、`处理状态`、`错误原因`（最安全，方便对比回滚）。  
- overwrite：在导出的新文件里 **把结果写回指定原列**（例如把 `标题` 列替换成新标题、把 `图片链接` 替换成新图片），更适合你们“导出后直接一键上架”。

你已确认：导出优先走 **B（多列展开）**，并且 **先以 `taiyang.xlsx` 为准**。

---

## 6) v1 冻结口径：`taiyang.xlsx` 的字段映射与导出规则

> 说明：`taiyang.xlsx` 的“输入图片列”当前是 **单列逗号分隔**（`产品图片`），但你希望“导出图片列”优先是 **多列展开**（`image1/image2/...`）。  
> 因此 v1 会同时支持：导入解析逗号分隔 → 内部统一为数组 → 导出按多列展开写回（并可选是否同步写回单列）。

### 6.1 原始列（Sheet1）
首行表头（有效列）共 12 列：
- `SKUID`（注意：样例里带 `\\t` 前缀，目的是防止 Excel 科学计数；按字符串处理）
- `产品名称`
- `产品分类`（示例：`Home & Living>Dinnerware>Cutleries`）
- `原价格`
- `折扣价`
- `产品图片`（**逗号分隔多图 URL**）
- `包裹重量`
- `包裹尺寸`
- `SKU名称`
- `平台SKU`
- `SKU图片`（单图 URL）
- `产品ID`（同样可能带 `\\t` 前缀，按字符串处理）

### 6.2 DatasetItem 规范字段（canonical）映射
- `external_ids.skuid` ← `SKUID`（建议去掉前导 `\\t`，存储为纯字符串）
- `external_ids.product_id` ← `产品ID`（同上）
- `external_ids.platform_sku` ← `平台SKU`
- `title` ← `产品名称`
- `category_path` ← `产品分类`（按 `>` split 为数组，原字符串也保留）
- `price.original` ← `原价格`，`price.discount` ← `折扣价`
- `images[]` ← `产品图片`（按英文逗号 `,` split + trim，过滤空值）
- `variant_name` ← `SKU名称`
- `variant_image` ← `SKU图片`
- `package.weight` ← `包裹重量`，`package.size_raw` ← `包裹尺寸`

### 6.3 导出（ExportProfile）列规则（v1：以 `taiyang.xlsx` 为准）
默认导出会生成 **一个新 Excel 文件**，并且：

**(1) 标题列**
- `append`：新增 `新标题`（来自 `new_title`，为空则留空/或回填原 `产品名称`，由导出选项决定）
- `overwrite`：把 `产品名称` 覆盖为 `new_title`（若 `new_title` 为空则保持原值）

**(2) 图片列（v1 口径）**
- 兼容 `taiyang.xlsx`：主列仍使用 `产品图片`（单列逗号分隔），方便直接上架/导入 ERP
- 可选追加：`image1` ~ `imageN`（默认 N=9，可配置），用于后续适配其它平台的“多列展开”模板
- 填充逻辑：优先用 `new_images[]`；没有新图则回退用 `images[]`

**(3) 处理追踪列（建议 v1 就加，后续接 Jobs/Assets 会用到）**
- `处理状态`（pending/processing/done/failed）
- `错误原因`（字符串，失败时写入）
- `job_id`（可选，方便定位任务）
