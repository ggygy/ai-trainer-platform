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
