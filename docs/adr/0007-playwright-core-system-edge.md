# 0007 — E2E 用 playwright-core + 系统 Edge（不下载浏览器、不用完整 playwright）

- 状态：已接受
- 日期：2026-10-09

## 背景

UI 自动化测试需要真实浏览器驱动。两个约束：① 本机已装 Microsoft Edge，不想为测试再下载
~150 MB 的 Chromium；② 完整 `playwright` 包会在 postinstall 阶段触发浏览器下载。
另外 ZCode 的 IAB 浏览器自动化插件在本机协议层损坏（见下），E2E 是长期回归手段而非一次性脚本。

## 决策

- 依赖只用 **`playwright-core`**（纯驱动库，无 postinstall 下载），通过
  `executablePath` 指向系统 Edge：`/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`。
- 测试脚本 `scripts/ui-test.mjs`，`npm run test:ui` 运行；前置条件是 1420 端口已有 vite dev
  server（tauri dev 或独立 vite 均可，但不能同时起两个）。
- 覆盖 8 个场景：全页导航、首页入口、快速练习判分+历史落库、官方卷深链全流程、实操参考答案面板、
  环境助手 mock 安装+Jupyter、理论课测验+掌握标记、报告导出下载。断言 **零 console error**。

## 后果

**正面**
- 不污染用户磁盘、安装秒级完成；系统 Edge 与用户日常浏览器同内核，行为真实。
- 深链（ADR-0006）+ 真实点击双通道覆盖，曾实抓出嵌套 button、StrictMode 重复落库等真 bug。

**负面 / 代价**
- 绑定 macOS + Edge 路径；换机器需改 `executablePath`（已集中在一处常量）。
- 无法测试 Tauri 特有 API（真实 shell 命令、iframe 内 Jupyter），这些走 mock 分支 —— Rust 侧
  `env.rs` 的行为只能人工验证。
- ZCode IAB 插件损坏的 workaround（Edge `--headless --screenshot` 截图）只用于快速视觉检查，
  不作为回归门禁；E2E 才是门禁。
