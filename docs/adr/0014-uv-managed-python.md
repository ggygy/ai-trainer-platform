# 0014 · uv 托管 Python 环境（应用专属 venv）

日期：2026-10-10 · 状态：已采纳

## 背景

依赖管理踩遍系统 Python 的坑（真实用户反馈）：
- mac 命令行工具 Python 3.9：pip 21 过旧、PEP 668 只能装用户站点（`~/Library/Python/3.9/...`），
  jupyter-lab 脚本目录不在 PATH，`python -m jupyter` 还可能被 pyenv shim 之类干扰；
- Windows 未加 PATH / Store stub；Homebrew Python PEP 668 需 `--break-system-packages`。

各平台的系统 Python 环境千差万别，逐个适配是无底洞。

## 决策

应用改为 **uv 托管的自有环境**，一条链路同时解决解释器与依赖：

1. `uv_path()`：PATH → `~/.local/bin/uv`（官方安装脚本默认位置，GUI PATH 通常没有）；
2. `ensure_uv_and_venv()`：uv 缺失时用官方脚本用户级安装（win: powershell irm install.ps1；
   unix: curl install.sh，均无管理员）→ `uv python install 3.13`（托管解释器）→
   `uv venv <应用目录> --python 3.13`；
3. venv 固定位置：win `%LOCALAPPDATA%\AI Trainer Prep\venv`；
   mac `~/Library/Application Support/AI Trainer Prep/venv`；linux `~/.local/share/ai-trainer-prep/venv`；
4. 安装：`uv pip install --python <venv python> -U <pkgs>`（uv venv 无 pip 模块，一律走 uv pip）；
5. 优先级：`python_prefix()` venv 排最前 → 系统 PATH 候选 → Windows 目录回落；
   `resolve_launch()`（Jupyter）同样 venv 优先；uv 整条路失败时回退原系统 pip 逻辑。

## 后果

- 新机器从零到「依赖全部就绪」不再依赖系统 Python 的任何特质（版本/权限/PATH/站点目录）；
- 实测（macOS，本机）：uv venv 3.13.11 + 13 依赖全装 + `python -m jupyter lab` 4.6.4 正常；
- uv venv 无 pip 模块：检测页 pip 行按「uv」标记就绪，不再误报；
- 代价：首次安装多下载 uv（~20MB）+ 托管 CPython（~30MB），可接受。

## 修订（2026-10-10）：已装包枚举改走 importlib.metadata（stdin）

uv 创建的 venv **不带 pip 模块**（包管理由 `uv pip` 承担），`python -m pip list` 在其中必然
失败——依赖明明装好了，环境助手却永远显示「全部未安装」，用户反复点安装也「装不上」
（Windows 实测：v0.3.0，11 项假性缺失）。

改为向 `python -` 的 stdin 喂一小段 stdlib 脚本，用 `importlib.metadata.distributions()`
枚举已装包（输出 `Name==Version` 行，解析逻辑不变）。任意解释器可用、不依赖 pip；走 stdin
而非 `-c` 参数，Windows cmd 的引号规则完全无关（ADR-0011 修订）。jupyterlab 检测同样补上
`python -m jupyter lab --version` 模块探测优先（venv/用户站点的 Scripts 不在 PATH）。

同时 uv 各步骤（装 uv、装 Python、建 venv）的 run_streamed 失败不再被静默忽略，逐条写安装
日志并注明「将回退系统 pip」。
