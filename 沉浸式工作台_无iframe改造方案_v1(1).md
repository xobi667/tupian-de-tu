# 沉浸式工作台（Lovart 风格）+ 彻底无 iframe 改造方案 v1

目标：把目前“门户 + iframe 嵌入 A/B 原型”的割裂形态，升级为一个统一的沉浸式工作台（左侧可伸缩导航 + 内容全屏 + 右侧插件面板），并逐步把 B 的能力收敛到 **A(core)**，做到前端只需要 **一个 Settings**。

> 你已拍板的关键决策（已纳入本方案）  
> - **不需要顶栏/面包屑**（红框区域移除）  
> - **侧边栏统一控制导航**（包含管理页：Settings/Assets/Jobs 等）  
> - **右侧面板默认 Drawer**，用户点“固定”后变为 Dock  
> - 先做顺序：**单图工厂 → Excel 数据集详情 → 项目编辑工作台 → 编辑器 → 批量工厂**  

---

## 1) 设计目标与原则

### 1.1 核心目标（体验）
- **沉浸式**：工作台页面不再出现“框中框/嵌入条/双导航”，内容区域尽可能全屏利用。
- **一致性**：所有页面共享同一套“左导航 + 右插件面板 + 浮动工具条”的交互模型。
- **可扩展**：未来增加平台、增加工具、增加工作流，不需要再改 IA 骨架。

### 1.2 核心目标（工程）
- **彻底无 iframe**：B 的页面不再通过 iframe 作为产品入口；前端只用 React 页面。
- **前端只打一个后端**：前端只访问 core(A) 的 `/api/*`；B 能力通过 core 内部模块/代理统一承接。
- **一个 Settings**：只在 core(A) 的 Settings 中配置模型 BaseURL/APIKey/Provider；所有工具共享。

### 1.3 设计原则（Lovart 风格参考）
- **低噪音 UI**：少卡片、少边框、靠分隔线与层级颜色区分区域。
- **可收纳**：左侧导航、右侧面板都可折叠/隐藏/固定，默认不挤占内容。
- **上下文优先**：操作按钮“跟着工作流走”（浮动工具条 + 右侧面板），而不是堆在页面顶部占高度。

---

## 2) 全局信息架构（IA）与路由分区

> 只有一个侧边栏，分组展示；不再出现顶部导航/面包屑。

### 2.1 左侧导航分组
- **工作台（沉浸式）**
  - 单图工厂 `/factory/single`
  - 批量工厂 `/factory/batch`
  - 编辑器 `/editor`
  - Excel 工作台（列表）`/excel`
  - Excel 数据集详情 `/excel/:datasetId`
  - 项目工作台 `/projects/:projectId/workbench`（新：合并 outline/detail/preview）
- **管理（后台/资源）**
  - 项目列表 `/projects`
  - 资源库 `/assets`
  - 任务中心 `/jobs`
  - 设置 `/settings`

### 2.2 页面“模式”元数据（用于控制布局）
每个路由打标：`mode = workbench | manage`
- workbench：内容全屏（0 padding）、显示浮动工具条、右侧面板可随时呼出
- manage：小幅 padding（建议 12～16px）、不显示复杂工具条（或显示轻量工具条）

---

## 3) 全局布局：一个 AppShell（无顶栏）

### 3.1 结构示意（ASCII）
```
┌───────────────────────────────────────────────────────────────┐
│  (无 Header)                                                   │
│                                                               │
│  ┌──────────────┐  ┌───────────────────────────────┐  ┌─────┐ │
│  │ LeftNav      │  │ Main Canvas (full screen)      │  │Dock │ │
│  │ (resizable)  │  │  - workbench pages             │  │(opt)│ │
│  │ 240/64/0     │  │  - manage pages                │  │     │ │
│  └──────────────┘  └───────────────────────────────┘  └─────┘ │
│         ▲                 ▲          ▲                         │
│         │                 │          │                         │
│   float collapse    float toolbar   drawer panels (default)    │
└───────────────────────────────────────────────────────────────┘
```

### 3.2 左侧导航（LeftNav）
状态三态（记忆到 localStorage）：
- `expanded`：宽 240（默认）
- `collapsed`：宽 64（只显示 icon）
- `hidden`：宽 0（极致沉浸）

交互（建议）：
- 左侧顶部一个“折叠/展开”按钮
- `Alt+\`：隐藏/显示
- 支持拖拽调宽（expanded 状态下）

### 3.3 顶部极薄浮动工具条（FloatToolbar）
特性：
- **不占布局高度**：`position: fixed/absolute` 覆盖在内容上方
- **可自动淡出**：鼠标离开/滚动时透明度降低（减少干扰）

内容（按页面注入）：
- 通用：返回、打开面板（Agent/Assets/Jobs）、主题切换、快捷键提示
- 页面专属（示例）：
  - 单图工厂：运行/保存为 Asset/写回 Project/比例
  - Excel 数据集：批量改标题/批量改主图/导出
  - 项目工作台：保存/导出 zip/生成描述/生成图片

### 3.4 右侧插件面板系统（Panel System）
三个面板统一一套机制（不在每页重复写 Drawer）：
- Agent Panel
- Assets Panel
- Jobs Panel

默认：**Drawer**（覆盖式、不挤主内容）  
用户点“固定”：**Dock**（右侧常驻，占固定宽度，可调宽）

面板统一能力：
- open/close
- pin/unpin（Drawer ⇄ Dock）
- width resize（Dock 状态）
- state persistence（记忆用户偏好）

---

## 4) 视觉风格：深/浅双主题（统一 Token）

### 4.1 主题策略
- 只维护一套组件结构，通过 AntD Token 切换浅/深（而不是两份 CSS）
- 允许局部覆写：workbench 背景更“画布感”，manage 更“后台感”

### 4.2 推荐 Token（方向）
- 背景层级：
  - `appBg`：整体背景（深色更接近 Lovart 的暗灰/微紫）
  - `surface`：面板背景（Drawer/Dock/左侧栏）
  - `canvas`：主内容背景（更干净，减少纹理）
- 分隔线：统一 1px 低对比度
- 圆角：8/10/12（少用 16+ 的大圆角，避免“卡片化过重”）
- 阴影：只用于浮动工具条、Dock 面板（非常轻）

### 4.3 主题切换
- 入口：浮动工具条右侧一个 toggle（Sun/Moon）
- 存储：localStorage

---

## 5) “彻底无 iframe”的技术路线（核心）

### 5.1 总原则：前端只访问 core(A)
前端不直连 B 的端口/URL，避免出现：
- 两套 baseUrl、两套健康检查、两套跨域
- Settings 变复杂（你想要“只要一个设置”就会被破坏）

因此最终形态：
- `frontend` → 只请求 `core(A)`：`/api/*`
- `core(A)` 内部：
  - 短期：通过 `legacy_b_client` 调用 B（内部细节对前端透明）
  - 中期：把 B 的关键能力搬进 A（模块化）
  - 长期：移除 B 工程目录或迁入 `legacy/`

### 5.2 迁移策略（渐进、可回滚）
为了不一次性重写爆炸，采用“先 UI 无 iframe，再逐步搬后端能力”的顺序：
1) **先把前端页面全部 React 化**（取消 iframe 入口）  
2) **前端调用 A 的 tools/agent API**（A 负责写入 Asset/Job/Dataset）  
3) **A 内部逐步把 B 能力迁移/内建**（最终 B 不再需要独立启动）

---

## 6) 页面级方案（按优先级）

### 6.1 单图工厂（第一优先）
目标：把现有 `single-antdx.html` 的强能力变成 React 页面（沉浸式），并统一写回 Asset/Job/Project。

页面结构（推荐 3 区）：
- 主画布区（最大）：预览 + 标注层（Canvas Annotate）+ 结果对比
- 左侧输入区（可折叠）：产品图/参考图/平台/比例/文案/高级参数
- 底部候选条（可折叠）：多张输出、版本、收藏、写回

关键交互：
- 标注（来自 `tupian-de-tu/frontend/assets/js/canvas-annotate.js` 的能力）React 化：
  - 叠加层渲染 marker
  - annotation list 可编辑/删除
  - 标注 → 一键生成“编辑/替换/风格”的 prompt/参数
- 输出落点：
  - 保存为 Asset（统一资源库）
  - 可选择写回到 Project 的某页（PageImageVersion）

依赖 API（统一走 A）：
- `/api/tools/style/single`
- `/api/tools/replace/single`
- 后续补齐：`/api/tools/vision/annotate`、`/api/tools/editor/run`
- Agent：`/api/agent/chat`（待建；短期可由 A 代理 B `/api/smart-chat/`）

验收标准：
- 无 iframe
- 单图画布标注可用
- 生成结果可进资源库 + 任务可追踪

### 6.2 Excel 数据集详情（第二优先）
目标：把“批量主图/文案/导出”做成更像工作台的体验（表格为主、右侧 inspector），并与右侧插件面板联动。

页面结构：
- 主区：表格（支持多选、筛选、对比）
- 行 inspector：选中行显示原图/新图/新标题/错误/任务（可放在页面内右侧，不占全局面板）
- 批量动作放入浮动工具条（不占高度）：改标题/改主图/导出

验收标准：
- 批量入口一眼可见（文案/主图/导出明确）
- 任务/资产可追踪（与 Jobs/Assets 面板联动）

### 6.3 项目编辑工作台（第三优先）
目标：把 Outline/Detail/Preview 三页合成一个“项目工作台”，减少跳转与割裂。

结构（建议）：
- 左：页面缩略图列表（可拖拽排序）
- 中：当前页预览（可放大、对比版本）
- 右：当前页文案/卖点/参数（可直接编辑）

验收标准：
- 项目编辑不再在多个页面来回跳
- 与 Assets/Jobs/Agent 面板联动

### 6.4 编辑器（第四优先）
目标：把 B 的 editor 能力做成 React UI，并统一输入/输出都走 Asset。

结构：
- 主画布：编辑预览
- 左工具栏：操作列表
- 底部：版本历史/撤销重做（可先简单）

验收标准：
- 输入支持从 Asset 选择
- 输出写回 Asset，可回写 Project/DatasetItem

### 6.5 批量工厂（第五优先）
目标：把批量 replace/style 等能力产品化（不依赖 html 原型）。

结构：
- 表格/队列为主
- 右侧 inspector 看一行/一个任务

---

## 7) 统一 Agent（不再用静态 html）

### 7.1 Agent 角色定位（你强调：应该在主图/文案流程里）
Agent 不做“单独一页聊天”，而是：
- 在任意 workbench 页面随时打开（右侧面板）
- 输出是“可执行建议”（可一键填入表单/发起 Job/写回 Excel 行）

### 7.2 数据结构（建议）
- `ChatSession`：与 Project/Dataset 绑定（可选）
- `Action`：可执行建议（type + payload + label）
  - `FILL_FORM`（写入当前页面表单）
  - `CREATE_JOB`（调用 `/api/tools/*`）
  - `WRITE_BACK_DATASET`（更新 `new_title/new_images`）

---

## 8) 目录结构与“一个项目”收敛

### 8.1 最终目录形态（建议）
> 目标不是“不能有子目录”，而是“不再有 A/B 两套独立工程入口”。

建议最终（示意）：
```
xobi/
  backend/          # core(A) + tools modules
  frontend/         # React portal/workbench
  legacy/           # 归档旧 B 静态页与旧服务（可删）
  scripts/
  Xobi启动器.bat     # 唯一启动器（前端 + 后端）
  docs/
```

### 8.2 收敛步骤（可回滚）
- 第一步：前端不再引用 `tupian-de-tu/frontend/*.html`
- 第二步：把 B backend 的关键 API 迁入 A backend（或作为 A 内部模块）
- 第三步：`tupian-de-tu` 移入 `legacy/` 或删除（只保留参考代码）

---

## 9) 实施里程碑（按你拍板顺序）

### M1：AppShell 改造（骨架先行）
- 移除顶栏 Header（无面包屑）
- 左侧栏三态 + 拖拽调宽
- 右侧面板系统：Drawer 默认 + Pin 到 Dock
- 浮动工具条（最小版本：返回/面板开关/主题）
- 深/浅主题切换

### M2：单图工厂无 iframe（第一工作台）
- React 实现画布 + 标注 + 生成
- 输出写 Asset + Job 可追踪
- Agent 面板输出“可执行建议”（先做到填表/生成参数）

### M3：Excel 数据集详情工作台化
- 表格 + 行 inspector
- 批量动作收敛到浮动工具条
- 与 Agent/Assets/Jobs 面板联动

### M4：项目工作台
- 合并 outline/detail/preview
- 资产/任务/Agent 联动

### M5：编辑器
- Asset 输入/输出闭环

### M6：批量工厂
- Replace/Style 批量 UI 产品化

---

## 10) 验收标准（v1）
- 入口层：所有核心页面无 iframe
- 体验层：无顶栏；左栏可隐藏；右侧面板默认 Drawer，可 Pin
- 工程层：前端只依赖一个 API Base（core A）
- 数据层：任何产物都能进入 Asset；任何任务都能在 Jobs 可追踪

---

## 11) 风险与对策（提前写清）
- 风险：一次性移除 iframe 可能影响迭代速度  
  - 对策：按页面优先级逐个替换；旧静态页移入 `legacy/` 作为参考
- 风险：B 能力迁入 A 需要时间  
  - 对策：短期 A 内部代理 B（对前端透明），中期再迁移实现
- 风险：画布/编辑器交互复杂  
  - 对策：先实现“标注 + 生成 + 保存”最小闭环，再迭代高级能力（吸附、对齐、智能选区）

