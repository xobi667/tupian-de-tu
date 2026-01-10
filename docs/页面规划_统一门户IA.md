# 页面规划 - 统一门户信息架构（Ant Design X）

前提：**共享 Project / Asset / Job**，并保留现有两类后端能力：
- A：`xobixiangqing`（Flask）= 数据底座（Project/Asset/Job/Version/ReferenceFile/Settings）
- B：`tupian-de-tu`（FastAPI）= 工具箱（Excel/Replace/Style/Studio/Vision/Editor/Proxy/Title）

> 目标：用户在一个门户里完成“导入 → 生产 → 迭代 → 导出”，并且素材/任务/项目可跨模块复用。

---

## 1) 页面数量与导航（建议：8 个主页面 + 3 个全局抽屉）

### 主导航（8）
1. 仪表盘
2. 项目
3. 批量工作台（Excel 桥接）
4. 视觉工厂
5. 编辑器
6. 资源库
7. 任务中心
8. 设置

### 全局抽屉（不算“页面数”，但强烈建议）
- Agent 抽屉（Ant Design X Chat）
- 资源抽屉（Assets Picker：拖拽/搜索/标签）
- 任务抽屉（Jobs：进度、日志、取消/重试）

补充（可选，但你已提到“Agent 独立页面”）：
- 独立页面：`/agent`（v1 先嵌入 B 的 `chat-antdx.html`，后续再 Ant Design X React 化）

---

## 2) 路由与页面职责（建议版本：MVP 可落地）

### 2.1 仪表盘
- 路由：`/`
- 目的：给“今天要干什么”一个统一入口
- 模块：
  - 最近项目（A：`GET /api/projects`）
  - 最近任务（A：Job 列表，需新增统一 Jobs API）
  - 快捷入口：新建项目 / 导入 Excel / 单图替换 / 打开编辑器

### 2.2 项目（Project 工作流）
- 路由：
  - `/projects`（列表/搜索/归档）
  - `/projects/new`（创建向导）
  - `/projects/:id/outline`
  - `/projects/:id/detail`
  - `/projects/:id/preview`
- 依赖：
  - A：项目 CRUD、生成 outline/desc/images、版本、导出、模板、参考文件、项目素材
  - 可选调用 B：editor/vision/style 作为“增强工具”（最终产物回写为 Asset/版本）

### 2.3 批量工作台（Excel 桥接：导入/导出用于上架）
- 路由：
  - `/excel`（Excel 任务列表）
  - `/excel/:jobId`（任务详情：映射/处理/对比/导出）
- MVP 形态（先不改后端逻辑也能跑）：
  - B 负责 Excel 解析/导出、标题仿写、图片代理
  - 门户只是“统一 UI”，先不强制把 B 的产物入库到 A
- 平台化形态（你想要的“共享项目/素材/任务”最终形态）：
  - Excel 导入产生一个 `Dataset`（数据集）+ `Job(type=EXCEL_IMPORT)` + `Asset(type=EXCEL_SOURCE)`
  - DatasetItem（行/SKU）是后续一切批量操作的“锚点”：标题/图片/详情页/导出状态都挂在它上面
  - 每个批量动作都是 `Job`：`TITLE_REWRITE`/`IMAGE_REPLACE`/`STYLE_BATCH`/`PROJECT_GENERATE`/`EXPORT_EXCEL`
  - 批量产物统一沉淀为 `Asset`，并回写到 DatasetItem（`new_title/new_images/status/errors`）
  - 导出走 `ExportProfile`（上架模板配置）：把 canonical 字段映射回平台 Excel（便于自动上架）
  - 可一键“将选中的 SKU 生成 Project”（把 rows → Project/Pages/Materials/Requirements），用于批量做详情页/多图

### 2.4 视觉工厂（单图/批量/Studio/风格批量）
- 路由：
  - `/factory/single`（单图替换 + analyze + preview + Studio）
  - `/factory/batch`（批量替换任务）
  - `/factory/style-batch`（风格批量任务）
  - `/factory/platform-specs`（平台规格/比例）
- MVP：
  - 直接复用 B 的能力与参数体系
  - 产物可“保存到资源库”（落到 A 的 Asset），支持被项目工作流引用

### 2.5 编辑器（手动编辑）
- 路由：
  - `/editor`（打开编辑器）
  - `/editor?assetId=...`（从资源库/项目页跳转编辑某张图）
- MVP：
  - B 的 `/api/editor/*` 做实际处理
  - 门户负责：选择输入图（Asset）、参数 UI、预览、保存新版本

### 2.6 资源库（共享素材/模板/参考文件/导出文件）
- 路由：`/assets`
- 形态：Tab 化
  - 素材（Material/Asset Image）
  - 模板（UserTemplate/ProjectTemplate）
  - 参考文件（ReferenceFile + parse status）
  - 导出文件（zip/xlsx 等）
- 核心诉求：任何页面都能从这里“拿资产/存资产”

### 2.7 任务中心（共享任务）
- 路由：`/jobs`
- 形态：
  - 全量任务列表（过滤：项目、类型、状态、时间）
  - 任务详情：输入资产、输出资产、日志、重试/取消/下载
- 注意：这是实现“共享任务”的关键页面（现在三套系统没有统一 Job 视角）

### 2.8 设置
- 路由：`/settings`
- MVP：先以 A 的 `Settings` 为唯一来源
- 进阶：增加“项目级设置/品牌档案”，并把 Studio profile 与 Project 合并

---

## 3) 页面复用策略（把重复 UI 砍掉）

### 3.1 统一的“资产选择/上传”交互
任何页面只做两件事：
- 选资产（来自资源库/项目/全局）
- 发起 Job（生成/替换/编辑/导出）

### 3.2 统一的“Job 进度展示”
不要每个页面各写一套轮询/进度条：
- 统一 Job 状态机：`pending/running/succeeded/failed/canceled`
- 统一进度结构：`total/completed/failed` + `percent`
- 统一动作：cancel/retry/download

### 3.3 统一的“AI 对话交互”
Ant Design X 作为统一 Chat 体验：
- 项目页：对话驱动 refine outline/desc 或 edit image
- 工厂页：对话驱动生成/改 prompt/做 Studio plan
- Excel 页：对话驱动“标题风格要求/批量规则”

---

## 4) 你现在就能定下来的 3 个“关键产品决策”

1. **主线数据底座是否确定为 A（xobixiangqing 的 DB）？**  
   - 如果是：B 的产物就要“回写成 Asset/Version/Job”，共享目标才成立。
2. **批量的“桥接格式”要先支持哪些平台模板？**  
   - 不同平台 Excel 列/多图列/变体结构差异很大，建议先定 Top1-2 模板做成 `ExportProfile` 预置。
3. **暂不做账户系统时的部署边界**  
   - 如果只本机/内网：可以先不做鉴权；若要多人共享或对公网，至少要加 admin token 保护 settings/keys/job 管理。
