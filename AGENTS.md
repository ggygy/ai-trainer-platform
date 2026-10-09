# AGENTS.md — 人工智能训练师（三级）备考平台

面向在本仓库工作的 AI 编码代理（与人类协作者）的项目说明。

## 项目是什么

人工智能训练师（三级）职业技能考试的学习 + 模拟考试桌面应用，Tauri 2 形态。
核心特色：官方真实题库（理论 900 题 + 官方模拟卷 190 题含官方答案 + 实操 40 题）、
实操参考答案对照、Python 依赖环境检测/安装辅助、应用内 Jupyter Notebook 运行实操题。

## 常用命令

```bash
source ~/.cargo/env && export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"  # 本机需要
npm run dev            # 仅前端（vite，端口 1420，浏览器可用，Tauri API 走 mock）
npm run tauri dev      # 完整桌面应用（首次编译较慢，rsproxy 镜像已配置在 ~/.cargo/config.toml）
npm run build          # tsc（严格模式）+ vite 生产构建 —— 交付前必跑
npm run test:ui        # playwright-core + 系统 Edge 无头 E2E（8 场景，需 vite dev 已在 1420 运行）
npm run test:full      # 全真模考完整回归：导入答案→官方卷 190 题全答→判分 100→落库（同样需 vite dev）
cd src-tauri && cargo check   # Rust 侧类型检查
```

注意：`npm run dev` / `npm outdated` 等所有 node 命令都必须先把 nvm 的 node 加入 PATH（见上）。

## 代码地图

```
src/
  data/                  # 全部内容数据（JSON），改动后无需改组件
    theory.json          # 理论 900 题 {judge[300], single[300], multi[300]}；single/multi options 为 [字母,文本] 对
    mock190.json         # 官方模拟卷 190 题（第5部分），含官方答案；options 是纯文本数组（字母按序号生成）
    aiAnswers.json       # AI 生成的 900 题参考答案 {a: 答案, c: high|medium|low 置信度}
    practicalAnswers.json# 实操 40 题官方参考答案，键 "2.2.1"；3.2.5 官方暂缺
    content.ts           # 题组/依赖清单/考试信息/文案常量；理论学习树与课程由下列三个文件组装
    syllabus.json        # 官方《认定要素细目表》：5 大项/21 章节/300 细目点带分值（scripts/build-syllabus.mjs 生成）
    questionTags.json    # 900 题的章节标签（scripts/tag-questions.mjs 关键词+细目点名匹配）
    lessons.json         # 21 篇章节讲义正文（正文为提炼编写，细目点清单用官方原文渲染）
  lib/
    api.ts               # Tauri invoke 封装；isTauri() 为 false 时全部走浏览器 mock；Store 数据模型类型
    store.ts             # zustand + persist 全局状态（localStorage "atp.store.v1"，信封格式）；写状态必须走 action
    answers.ts           # 答案源合并：用户导入 > AI 参考（refAnswer，纯函数）
  pages/                 # 7 个页面组件；深链接 ?page=<id>&paper=official&group=2.2&idx=0&ref=1
  components/            # ui.tsx 基础件、exam-ui.tsx 考试件、Sidebar
src-tauri/src/commands/  # mod.rs 平台原语（shell_command：mac=zsh 登录壳 / win=cmd /C + CREATE_NO_WINDOW）
                         # env.rs 环境检测/安装（Python 候选探测：mac=python3，win=python→py -3；PEP 668 失败自动加 --break-system-packages）
                         # jupyter.rs 子进程起停（端口 8889，stderr 流式解析 token；win 停止用 taskkill /T 杀进程树）
scripts/ui-test.mjs      # E2E 测试（选择器若因 UI 改动失效需同步更新）
scripts/mock-full.mjs    # 全真模考完整回归（190 题全卷）
```

## 架构决策记录（ADR）

重大技术选型的「为什么」见 `docs/adr/`（README.md 有索引）：技术栈、数据层无数据库、
答案三级分层判分、Rust 子进程策略、Jupyter iframe、查询参数路由、E2E 方案、PEP 668 处理。
改架构前先读对应 ADR；推翻某条决策时新增编号 ADR 并在旧文件标注「已被取代」，不删除旧文件。

## 领域要点（改内容前必读）

- 真实考试：理论 90 分钟 190 题（140 单选/10 多选/40 判断）；实操 120 分钟 8 题组 40 题抽题；双科 60 分及格。
- 官方分值权重在 mock190.meta.scores（判断/单选 0.5、多选 1），官方全真卷按此计百分制。
- 判分优先级：用户粘贴导入（answerKey）> AI 参考答案（aiAnswers）；AI 置信度 low 的判分仅供参考。
- 答案导入格式是全真卷连续编号 1-190（判断 1-40 填 √/×、单选 41-180、多选 181-190），解析器按区间拆节存入 answerKey.judge/single/multi；官方全真卷判分始终用卷内官方答案，不受导入影响。
- 刷题统计口径（store.theoryDone）：非官方卷中**实际作答过**的题 + 理论学习页例题；官方卷 190 题不属于 900 题库，不计入。首页统计卡/今日任务/连续学习均由 store 真实推导，勿再硬编码演示数据。
- 实操素材目录：`~/Desktop/codeing/AI/人工智能训练师三级上网素材`（Store.materialDir，可在环境助手更改）。
- 源资料在上层目录 `../`（题库 docx、认定要素细目表、实操答案 PDF 等），不属于本仓库。

## 约定与坑

- **React.StrictMode 下 effect 会跑两遍**：任何写状态 / 发请求的 mount-effect 必须加 ref 守卫（见 TheoryExam ResultScreen）；zustand 不解决双跑，守卫仍必需。
- **状态读写只走 `lib/store.ts`**：组件用 `useStore()` 订阅、`useStore.getState().action()` 写入，禁止直接读写 localStorage；E2E 读 localStorage 时注意 persist 信封（`parsed.state ?? parsed`）。
- **不要嵌套 button**（Btn 里再套 button 会触发 React DOM 告警），卡片可点击区域用 div + onClick。
- **TS 严格模式 + noUnusedLocals**：未使用的 import 会直接构建失败；theory.json 需要 `as unknown as` 类型断言（JSON 推导出 string[][]）。
- **样式只用 index.css @theme 里的 token**（bg/surface/ink1-3/accent/ok/warn/bad 及 -soft 变体、radius-card），不要硬编码色值（inkwell 深色终端区除外）。
- UI 文案全部中文；数字用等宽字体（font-mono）。
- 深链接参数是正式功能，改动页面初始状态逻辑时保持兼容。
- 浏览器 mock 与 Tauri 真机行为有差异（安装/Jupyter 是假数据）；涉及 Rust 命令的改动需在 `npm run tauri dev` 真机里人工验证。
- 考试交卷写历史的 effect 有 savedRef 守卫，重构时不要丢。

## 验证流程（改动的最低验收标准）

1. `npm run build` 通过（tsc 严格 + vite）。
2. Rust 有改动时 `cargo check` 零警告。
3. `npm run dev` 起服务后 `npm run test:ui` 8/8 通过、无页面 JS 报错（脚本会自动输出失败截图到 /tmp）。
4. 数据文件（src/data/*.json）改动时，抽查界面渲染 + 相关测试场景。
