# 0010 — Windows 平台支持：cmd /C + 注册表 PATH、NSIS、taskkill 进程树

- 状态：已接受
- 日期：2026-10-09

## 背景

最初只在用户的 macOS（Apple Silicon）上运行，Rust 侧三处硬编码 `/bin/zsh -lc`（GUI 应用
不继承 shell PATH 的解法，ADR-0004），`python3` 命令名与 `2>/dev/null`、`||` 等 shell 语法
随之固化。需要支持 Windows 使用。

## 决策（src-tauri/src/commands/mod.rs 提供平台原语）

1. **shell 抽象 `shell_command(cmd)`**：macOS 走 `zsh -lc`（不变）；Windows 走 `cmd /C` 并加
   `CREATE_NO_WINDOW`（0x08000000）防后台命令闪控制台。Windows 不需要登录 shell 补 PATH——
   GUI 进程的 PATH 本就取自注册表（Python 安装时勾选 Add to PATH 即生效），与 macOS 的
   问题不同源。
2. **Python 候选探测**：Windows 上 `python3` 常是 Microsoft Store 的跳转 stub，按
   `python` → `py -3` 逐个探测 `--version`、只认真实输出；macOS 保持 `python3`。
   pip 安装继续经 shell 字符串执行（包名白名单，无注入面）。
3. **Jupyter 查找**：macOS `command -v jupyter-lab`；Windows `where jupyter-lab`。
   只认 jupyter-lab 可执行文件（`jupyter` 元启动器 spawn 参数不同，不混用）。
4. **进程树清理**：`jupyter_stop` 在 Windows 先 `taskkill /PID <pid> /T /F` 再 kill/wait——
   kill 只杀本体，jupyter 拉起的 kernel 子进程会残留。
5. **打包与分发**：`bundle.windows.nsis`（SimpChinese 优先），webview2 用
   downloadBootstrapper 按需下载；CI 增加 windows-latest job（`shell: bash` 复用 mac job
   语法），NSIS exe 以 ASCII 名上传同一 Release。
6. 前端 `materialDir` 默认值按 UA 分平台（Windows 落 `C:/Users/Public/Documents`，用户可在
   环境助手更改）。

## 后果

**正面**
- 三平台差异收敛到 mod.rs 两个原语 + 两个 cfg 分支；CI 一键产出双平台安装包。

**负面 / 代价**
- **Windows 运行时行为未经真机验证**（开发机无 Windows）：检测/安装/Jupyter 属 best-effort
  适配，CI 只保证可编译可打包；待真机复检。
- Windows 下 pip 装 Python 需用户预装并勾选 Add to PATH，否则探测失败（日志有明确指引）。
- 本地无法交叉预检 Windows 编译（tauri-winres 需 llvm-rc），cfg 错误只能由 CI 暴露。
