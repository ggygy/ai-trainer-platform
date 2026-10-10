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
- push 触发的 bump 提交也会启动一个快照构建；正式构建与快照构建分属不同并发组
  （`build-main-vX.Y.Z` vs `build-main-snapshot`），push 不会顶掉正在跑的正式构建
  （首版共用组导致正式构建被取消，已修）。

## 后果

- 版本号由发版动作驱动：安装包文件名（`*_0.2.0_*`）、应用内版本、tag 三处一致；
- Releases 页出现 Latest 正式版（普通用户下载入口）+ 历史快照预发布（开发者回溯）；
- 发版权在 GitHub 界面点一下，无需本地改版本号。

## 修订（2026-10-10）：Release 由 publish job 统一发布

原设计中 build-macos / build-windows 两个 job 各自创建 Release 并上传自己的产物。任一 job
被取消（快照并发组内新 push 抢占）或失败时，另一个 job 的产物可能已传完，留下「只有 dmg
没有 exe」的半成品 Release（实例：v0.2.0-20261010-406bc59），普通用户看起来就是「Windows
包不出了」。

改为三段式：两个平台 job 只构建并上传 artifacts（actions/upload-artifact），新增 `publish`
job（needs 双平台）在 ubuntu 上汇合产物、统一创建 Release 并一次性上传全部四个文件。任一
平台失败/被取消 → publish 不执行 → 完全不出现该次构建的 Release；并发组改为
`build-<ref>-<release_tag || snapshot>` 已在上一修订落地，此处消除最后一个产生半成品的路径。
