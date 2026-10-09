# 0011 · 英文产品名与应用内 Python 引导安装

日期：2026-10-09 · 状态：已采纳

## 背景

issue #1 暴露的两类问题 + 用户反馈：

1. `productName` 为中文（"训练师备考平台"），已两次引发兼容性事故——WiX 打 MSI 直接失败（已弃用 MSI）、GitHub Release 资产中文名被剥离。中文路径/名称在 Windows 安装器、CI、下载工具链里都是雷。
2. 用户机器上装了 Python 但没勾「Add python.exe to PATH」，`env install` 只会报错让用户自己装——应用应该能帮用户把运行时装好，而不是只装 pip 包。
3. 章节例题接全量 900 题后，各章节除打标头部外刷题顺序完全相同。

## 决策

### 1. productName 全面英文化

`productName: "AI Trainer Prep"`（含空格是标准形态，NSIS/DMG 均支持；CI 资产名本就改写为仓库名 ASCII）。
窗口标题、`index.html` 标题、侧栏品牌随之更新。`identifier` 不变（`com.zhouwangjun.ai-trainer-platform`），老用户 localStorage 数据无缝保留。

### 2. 应用内一键安装 Python 运行时（`install_python` 命令）

与 `install_packages` 平行的新命令，复用 `install-log`/`install-done` 事件通道与 `run_streamed` 流式输出：

- **Windows**：优先 `winget install Python.Python.313 --override "/quiet InstallAllUsers=0 PrependPath=1"`；无 winget 或失败则 `curl` 下载 python.org 官方安装器（按架构选 amd64/arm64）`/passive` 安装。
- **macOS**：`curl` 下载官方 universal2 pkg 到「下载」文件夹并 `open` 图形安装器——用户点「继续→安装」输密码即可，不做终端 sudo 自动化。
- **Linux**：输出 apt/dnf 指引（发行版差异大，不自动化）。

与探测的闭环（关键）：Windows 默认装到 `%LOCALAPPDATA%\Programs\Python\Python3xx`、macOS pkg 写 `/etc/paths.d`——分别被 `windows_python_fallback` 全路径探测与新 `zsh -lc` 登录 shell 命中，**装完无需重启应用**，点「重新检测」即可。

版本钉在 `3.13.7`（bugfix 期、带官方二进制安装器、科学计算包 wheel 覆盖最全；3.12.10+ 为 security-only 无二进制，3.14 的第三方 wheel 生态尚不齐）。

### 3. 章节刷题顺序差异化

`lessonQuiz(code)` 保持「本章打标真题交错排最前」，其余全库题目按**章节代码为种子**做确定性洗牌（FNV-1a + mulberry32，不用 `Math.random`）：不同章节刷题顺序互不相同、同一章节顺序稳定（可测试、可续刷）。

## 后果

- 中文产品名引发的安装器/资产名问题这一类坑被根除。
- 新 Windows/macOS 用户从零到「依赖全部就绪」全程不离开应用。
- 章节例题池顺序各不相同但确定性可复现；E2E T7 依赖的头部三题（打标段）保持稳定。

## 修订（2026-10-09 · Windows 实机反馈）

首版 winget/curl/安装器调用走 `cmd /C "…"arg"…"` 拼串，实机全军覆没：Rust std 对含空格参数按 MSVCRT 规则把内层引号转义成 `\"`，而 cmd 把 `"` 当引号开关不认 `\"`——curl 收到带杂引号的 URL 报 `(3) Port number was not a decimal number`，winget `--override` 同理被截断。

**修订决策：Windows 上凡参数含空格或引号的命令一律直接 `Command::new(prog).args([...])` spawn，不走 cmd 拼串。** `run_streamed` 改为接收 `Command`；winget/curl/安装器直接执行（临时路径取 `std::env::temp_dir()`）；python「全路径回落」命中时 pip 调用同样直接 spawn（`py_command()` 按 python 是否为路径选 shell/直spawn 分支）。cmd 拼串只保留给无内层引号的简单探测（`python --version`、`winget --version`）与 macOS zsh（zsh 以单个参数接收整条命令再自行解析，引号语义正确）。
