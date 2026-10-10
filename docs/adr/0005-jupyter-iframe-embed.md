# 0005 — Jupyter Lab 以 iframe 嵌入答题页（端口 8889），浏览器模式降级为占位符

- 状态：已接受
- 日期：2026-10-08

## 背景

实操答题页的核心诉求：左侧读题作答，右侧直接操作 notebook，而不是让用户在应用与浏览器窗口间
切换。Jupyter Lab 自带完整 Web UI，自己重写一套前端不现实。

## 决策

- 实操答题页右栏用 **`<iframe src="http://localhost:8889/lab?token=…">` 嵌入 Jupyter Lab**。
  Rust 侧启动时生成/传递 token，iframe URL 由后端命令返回。
- 启动状态条（检测中 → 启动中 → 已就绪 → 失败）由 `install-log`/启动命令的返回驱动。
- **浏览器预览模式（非 Tauri）不尝试 iframe**：`!isTauri()` 时渲染占位说明卡片
  （"启动 Jupyter (mock)"按钮走 mock 流程并输出提示日志），因为纯浏览器下没有 Rust 后程
  可启动子进程，且 localhost:8889 未必在运行。

## 后果

**正面**
- 完整保留 Jupyter 原生交互（补全、快捷键、kernel 管理），开发成本≈0。
- 端口固定 8889，E2E 测试与实操题素材目录约定一致。

**负面 / 代价**
- 依赖用户本机 Jupyter 正常运行；Jupyter 升级更换 URL 结构（如 token 强制）会导致 iframe 白屏。
- iframe 跨源限制：无法从外层页面读取 notebook 内容做自动判分，实操只能「对照自评」。
- 浏览器模式下该区域是降级体验，E2E 对 iframe 内部不做断言（只能验证占位/状态条）。

## 修订（2026-10-10）：放开 frame-ancestors + 就绪地址常驻状态

实测 jupyter 4.x 默认对页面下发 `Content-Security-Policy: frame-ancestors 'self'`，Tauri
WebView 是异源（tauri.localhost / tauri://localhost），iframe 被浏览器静默拦截——所有平台
一致空白。启动参数统一追加
`--ServerApp.tornado_settings={"headers":{"Content-Security-Policy":"frame-ancestors *"}}`
（本地 127.0.0.1 + token 鉴权，风险可控；已实测响应头变为 frame-ancestors *）。

另修「运行中但 iframe 停在未启动占位符」：jupyter_status 此前永远返回空 url，页面切换重挂载
后前端拿不到地址。JupyterState 增设常驻 ready_url（stderr 捕获或看门狗兜底时写入），status /
已运行查询一律带回。应用退出（RunEvent::Exit）顺带 taskkill 整棵 jupyter 进程树，不再留僵尸。
