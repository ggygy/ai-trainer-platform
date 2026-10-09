# 0004 — Rust 侧子进程策略：zsh -lc 解析 PATH、事件流式日志、Mutex 持有 Jupyter 子进程

- 状态：已接受
- 日期：2026-10-08

## 背景

环境助手需要在本机执行 pip 安装、检测 Python 包、启动/停止 Jupyter Lab（端口 8889）。
macOS 上由 Finder/Dock 启动的 GUI 应用不继承 shell 的 PATH，直接 `Command::new("pip3")`
会找不到 nvm/homebrew 安装的工具（本机 Python 经 nvm + pyenv 管理链路尤其如此）。
安装过程动辄数十秒，前端需要实时日志而不是转圈。

## 决策（`src-tauri/src/env.rs`）

1. **所有外部命令经 `zsh -lc "<cmd>"` 执行**：加载用户 login shell 的 PATH/别名后再执行，
   保证与用户终端环境一致。
2. **安装日志走 Tauri event 流**：命令逐行读 stdout/stderr，`emit("install-log", line)` 推给前端
   终端区；命令结束再 emit 完成事件。不轮询、不落盘。
3. **Jupyter 子进程用 `Mutex<Option<Child>>` 保存在 Tauri state**：启动时 spawn 并记句柄，
   停止时取锁 kill；防止重复启动多个 Lab 实例，也使「停止」有据可依。
4. **包检测用 `python3 -c "import <pkg>"` 逐个探测**，不解析 `pip list` 文本，避免格式漂移。

## 后果

**正面**
- 与用户终端完全同环境，nvm/pyenv/homebrew 的 Python 均可被找到，零额外配置。
- 流式日志让长时间 pip 安装可感知、可诊断（PEP 668 报错等能第一时间看到，见 ADR-0008）。

**负面 / 代价**
- 依赖 zsh 存在且用户的 `~/.zshrc` 不做破坏性输出（如打印无关内容会混入日志流）。
- `zsh -lc` 是字符串拼命令，命令参数必须来自应用内白名单，不允许前端透传任意字符串。
- `Mutex<Option<Child>>` 在应用异常退出时不清理子进程 —— Jupyter 可能残留，靠端口占用检测兜底。
