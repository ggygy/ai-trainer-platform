# 0013 · 版本化发布：快照预发布 + 手动正式 Release

日期：2026-10-10 · 状态：已采纳

## 背景

原机制 tag 恒为 `v0.1.0-日期-sha` 且全部标 Pre-release：版本号永不更新（三处版本文件均为 0.1.0），
Releases 页清一色预发布快照，没有「最新正式版」的概念。

## 决策

- **快照构建**（build.yml，push 触发）：行为不变——预发布 tag `vX.Y.Z-日期-sha`，随时尝鲜；
- **正式发版**（release.yml，workflow_dispatch 输入版本号）：
  1. 校验 `^\d+\.\d+\.\d+$` 后写入 package.json、src-tauri/tauri.conf.json、src-tauri/Cargo.toml，
     `cargo update -p` 刷新 Cargo.lock；
  2. 提交 `chore(release): vX.Y.Z` 并打 tag，推回 main；
  3. `gh workflow run build.yml -f release_tag=vX.Y.Z` 触发双平台构建；
  4. build.yml 检测到 `release_tag` 输入：tag 直接采用、Release 用 `--latest` 发布（非预发布）。
- push 触发的 bump 提交也会启动一个快照构建，与正式构建共享 `concurrency: build-main`
  （cancel-in-progress），后者会取消前者，不产生重复产物。

## 后果

- 版本号由发版动作驱动：安装包文件名（`*_0.2.0_*`）、应用内版本、tag 三处一致；
- Releases 页出现 Latest 正式版（普通用户下载入口）+ 历史快照预发布（开发者回溯）；
- 发版权在 GitHub 界面点一下，无需本地改版本号。
