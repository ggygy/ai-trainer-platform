# 0008 — pip 安装遇 PEP 668（externally-managed-environment）自动追加 `--break-system-packages` 重试一次

- 状态：已接受
- 日期：2026-10-08

## 背景

macOS 新版 Homebrew/系统 Python 3.12+ 启用 PEP 668：pip 直接装包报错
`externally-managed-environment` 拒绝写入。本考试环境恰恰需要往该 Python 里装
pandas/scikit-learn 等十来个包。标准解法（venv）会改变 Jupyter kernel 的解释器路径，
与实操素材目录「打开即用」的假设冲突；且考生机器上多一个 venv 就多一个「为什么 notebook
找不到包」的排障成本。

## 决策（`src-tauri/src/env.rs`）

安装命令执行后若 stderr 命中 `externally-managed-environment`，**自动以相同包列表追加
`--break-system-packages` 重试一次**，并在日志区明示「检测到 PEP 668 保护，已使用
--break-system-packages 重试」。仅自动重试一次，其他错误原样抛给用户。

## 后果

**正面**
- 一键安装在本机这类 PEP 668 环境下真正能跑通，不需要用户理解/手动加参数。
- 日志明示了破坏性操作的发生，可审计。

**负面 / 代价**
- `--break-system-packages` 确实绕过了系统 Python 的包管理保护，理论上存在与 Homebrew
  自带 Python 包冲突的风险 —— 接受该风险：这是考生个人机器的备考工具，非生产部署。
- 命中判定靠 stderr 字符串匹配，pip 文案变化会失效（失效时退化为报错展示，不会误装）。
- 若未来改用 venv 方案，需新 ADR 取代本条，并同步调整 Jupyter kernel 注册逻辑（ADR-0004/0005）。
