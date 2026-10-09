# 0001 — 桌面形态采用 Tauri 2 + React 19 + Vite 8 + Tailwind v4

- 状态：已接受
- 日期：2026-10-08

## 背景

产品是考生本机使用的备考应用，需要：控制原生子进程（pip 安装、启动 Jupyter）、读取本地素材目录、
长期在本机驻留。候选方案：Electron、Tauri、纯 Web。用户明确指定「软件采用 Tauri 的形式」。

## 决策

- 壳：**Tauri 2**（Rust 主进程承载子进程管理与文件系统访问）。
- 前端：**React 19 + TypeScript（严格模式）+ Vite 8**，与 Tauri 官方模板一致。
- 样式：**Tailwind CSS v4**（`@tailwindcss/vite` 插件 + `@theme` 设计令牌），视觉稿（Pen）中的
  教育蓝设计系统直接映射为 CSS 变量。

## 后果

**正面**
- 产物体积与内存占用远小于 Electron；Rust 侧天然具备子进程/文件能力，无需额外插件链。
- Vite 8 + Tailwind v4 全走官方插件，构建链简单（`npm run build` 约 0.2s）。

**负面 / 代价**
- Rust 侧任何改动需要重新编译（dev 首次编译分钟级），前端代理迭代 Rust 功能时反馈慢。
- 两个语言的工具链都要装对（本机：nvm node 22 + rustup cargo，PATH 是常见故障点）。
- Tauri 2 的 capabilities 权限模型需要为用到的插件逐一声明（dialog/opener/event）。
