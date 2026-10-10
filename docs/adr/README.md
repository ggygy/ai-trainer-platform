# ADR 索引 — 架构决策记录

本文档记录本项目中不可逆或高影响的技术决策。格式：一 decision 一文件，状态 / 日期 / 背景 / 决策 / 后果。

| 编号 | 决策 | 状态 | 日期 |
|------|------|------|------|
| [0001](0001-tauri-react-stack.md) | 桌面形态采用 Tauri 2 + React 19 + Vite 8 + Tailwind v4 | 已接受 | 2026-10-08 |
| [0002](0002-bundled-json-no-db.md) | 内容数据用打包 JSON + localStorage，不引入数据库 | 已接受 | 2026-10-08 |
| [0003](0003-tiered-answer-grading.md) | 答案分层与判分优先级：用户导入 > AI 参考 > 无判分 | 已接受 | 2026-10-09 |
| [0004](0004-rust-subprocess-strategy.md) | Rust 命令层：zsh 登录壳解析 PATH + 事件流式日志 + 子进程托管 | 已接受 | 2026-10-08 |
| [0005](0005-jupyter-iframe-embed.md) | Jupyter 以 iframe + token 内嵌，浏览器预览降级为占位面板 | 已接受 | 2026-10-08 |
| [0006](0006-query-param-routing.md) | 页面路由用 query 深链接参数，不引入路由库 | 已接受 | 2026-10-09 |
| [0007](0007-playwright-core-system-edge.md) | E2E 测试用 playwright-core 驱动系统 Edge 无头 | 已接受 | 2026-10-09 |
| [0008](0008-pip-break-system-packages.md) | pip 安装遇 PEP 668 受管环境自动降级 `--break-system-packages` | 已接受 | 2026-10-08 |
| [0009](0009-zustand-state.md) | 状态管理迁移 zustand persist（key/介质不变，信封格式迁移） | 已接受 | 2026-10-09 |
| [0010](0010-windows-platform.md) | Windows 支持：cmd/注册表 PATH + NSIS + taskkill 进程树 | 已接受 | 2026-10-09 |
| [0011](0011-english-name-and-python-bootstrap.md) | 英文产品名 + 应用内一键安装 Python 运行时 + 章节刷题顺序差异化 | 已接受 | 2026-10-09 |
| [0012](0012-macos-signing-notarization.md) | macOS Developer ID 签名+公证接入 CI（Secrets 缺省自动降级未签名） | 已接受 | 2026-10-10 |
| [0013](0013-versioned-releases.md) | 版本化发布：push 快照预发布 + 手动触发正式 Release（版本号三处同步） | 已接受 | 2026-10-10 |
| [0014](0014-uv-managed-python.md) | uv 托管 Python：用户级 uv + 托管 3.13 + 应用专属 venv，绕开系统 Python 全部坑 | 已接受 | 2026-10-10 |

## 新增 ADR 的约定

- 文件名：`NNNN-短横线英文标题.md`，编号递增不复用。
- 内容至少包含：状态、日期、背景（为什么需要决策）、决策（选了什么、放弃什么）、后果（正/负两面）。
- 推翻旧决策时不要删文件：把旧 ADR 状态改为「被 NNNN 取代」，并更新本索引。
