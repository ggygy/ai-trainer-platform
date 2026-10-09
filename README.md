# 训练师备考平台 · 人工智能训练师（三级）

Tauri 2 桌面应用：官方真实题库（理论 900 题 + 官方模拟卷 190 题 + 实操 40 题）、
全真模考加权判分、实操参考答案对照、Python 环境检测/安装辅助、应用内 Jupyter 运行实操题。

## 下载安装

每次推送到 `main` 会自动构建并发布新版本，到 [Releases](../../releases) 页面下载最新的
`训练师备考平台_*.dmg`（Apple Silicon / arm64）。安装包未签名，首次打开需
**右键 → 打开**（或在「系统设置 → 隐私与安全性」里放行）。

## 开发

项目结构、常用命令、领域要点与约定见 [AGENTS.md](AGENTS.md)；
关键技术选型的「为什么」见 [docs/adr/](docs/adr)。

```bash
npm install
npm run tauri dev   # 桌面应用开发调试
npm run test:ui     # 8 场景 E2E（需 vite dev 在 1420）
npm run test:full   # 全真模考完整回归（190 题全卷）
```
