# 训练师备考平台 · 人工智能训练师（三级）

Tauri 2 桌面应用：官方真实题库（理论 900 题 + 官方模拟卷 190 题 + 实操 40 题）、
全真模考加权判分、实操参考答案对照、Python 环境检测/安装辅助、应用内 Jupyter 运行实操题。

## 下载安装

每次推送到 `main` 会自动构建并发布新版本，到 [Releases](../../releases) 页面下载最新的安装包。

**macOS**（`*_aarch64.dmg`，Apple Silicon）：配置了 Apple 签名 Secrets 的构建已做
Developer ID 签名 + 公证，下载后可直接打开。早期/未签名的版本会被 Gatekeeper 拦截并提示
「已损坏，无法打开」——把 App 拖入「应用程序」后，在终端执行一次：

```bash
xattr -cr "/Applications/AI Trainer Prep.app"
```

之后即可正常打开（只需一次）。注意：新版 macOS 上「右键 → 打开」已不能绕过该拦截。

**Windows**（`*_x64-setup.exe`）：未做代码签名，SmartScreen 弹出时点「更多信息 → 仍要运行」。

## 发版流程

- **日常快照**：push 到 `main` 自动构建 Pre-release（tag `v版本-日期-sha`），用于随时尝鲜；
- **正式发版**：GitHub → Actions → 「发布版本」→ 输入版本号（如 `0.2.0`）→ 自动写入
  package.json / tauri.conf.json / Cargo.toml、打 tag `v0.2.0`、双平台构建，并发布
  **正式 Release（Latest 标记，非预发布）**——安装包文件名与产物的版本号随之真正更新。

## 开发

项目结构、常用命令、领域要点与约定见 [AGENTS.md](AGENTS.md)；
关键技术选型的「为什么」见 [docs/adr/](docs/adr)。

```bash
npm install
npm run tauri dev   # 桌面应用开发调试
npm run test:ui     # 8 场景 E2E（需 vite dev 在 1420）
npm run test:full   # 全真模考完整回归（190 题全卷）
```
