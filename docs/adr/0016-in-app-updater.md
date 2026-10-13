# 0016 · 应用内更新：tauri-plugin-updater + GitHub Releases 自更新

日期：2026-10-13 · 状态：已接受

## 背景

用户（issue #3）反馈每次出新版都要手动去 Releases 页下载安装，希望有软件内更新入口。
此前版本分发完全靠 GitHub Release 手动下载（ADR-0013 建立的快照 + 正式版机制）。
仓库已转为 public，Release 资产可匿名下载，官方 updater 插件的托管端点条件成立。

## 决策

采用 **Tauri 官方 `tauri-plugin-updater`**（+ `tauri-plugin-process` 用于装完重启），
更新源为 GitHub Releases，不引入第三方更新托管服务。

- **端点**：`https://github.com/ggygy/ai-trainer-platform/releases/latest/download/latest.json`
  ——`releases/latest` 只命中**非预发布** Release（ADR-0013），快照构建上的 latest.json
  永远不会被客户端取到，正式版天然就是灰度开关。
- **签名**：minisign 密钥对（`tauri signer generate`，空密码）。私钥在 GitHub Secret
  `TAURI_SIGNING_PRIVATE_KEY`（仅 CI 构建时注入），公钥固化在 `tauri.conf.json`
  `plugins.updater.pubkey`。本地备份：`~/Documents/ai-trainer-prep-updater.key`
  （**丢失则无法再发更新**，只能换钥+发一版手动安装）。
- **产物**（`bundle.createUpdaterArtifacts: true`）：macOS = `.app.tar.gz`+`.sig`
  （updater 实际下载的包，dmg 仅供首次安装）；Windows = NSIS `setup.exe` 本体+`.sig`
  （installMode=passive，安装器接管后应用退出，Promise 不 resolve）。
- **CI**（build.yml）：双平台构建时注入签名私钥 → 产物随 artifacts 汇合 → publish job
  生成 `latest.json`（version/notes/签名/平台资产 URL）上传。notes = 上个正式 tag 以来的
  提交列表（fetch-depth 0 取历史），用户在更新弹窗直接看到改了什么。
- **UI**：侧边栏底部「检查更新 · vX.Y.Z」常驻入口；启动静默检查一次，发现新版只亮
  强调态+红点不弹窗（尊重注意力）；弹窗承载 检查→说明→下载进度→重启 全流程。
  浏览器预览模式（E2E 环境）降级为提示文案，不真连端点。

放弃的方案：仅「检查版本号+跳转浏览器下载」的轻量方案（用户仍要手动装，体验割裂）；
自建更新服务器（无必要，多一个运维负担）。

## 后果

- 正式版之间用户可全程应用内自更新（下载→验签→安装→重启），无需再碰浏览器。
- **v0.4.0 之前的存量安装没有 updater，需要最后一次手动安装**（一次性迁移成本）。
- 更新的可用性依赖 GitHub 可达性；检查失败静默、下载失败弹窗给 Releases 页兜底链接。
- 密钥是新的长期资产：泄漏=他人可签发被客户端接受的更新包（端点在 GitHub 上仍受控，
  实际风险=配合中间人/诱导安装才可利用）；丢失=更新链路报废。已在本地与 Secrets 双备份。
- CI 每次快照也会产出 updater 产物与 latest.json（顺手回归更新链路），仅正式版生效。
