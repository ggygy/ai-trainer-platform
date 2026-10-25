# 0018 · macOS 双架构构建（aarch64 + Intel x64）

- 状态：已接受
- 日期：2026-10-26

## 背景

自 [0013](0013-versioned-releases.md) 版本化发布以来，macOS 只产出 `*_aarch64.dmg`
（Apple Silicon），Intel 芯片的 Mac 无法安装（用户反馈「目前没有 mac intel 芯片的包」）。
macOS 生态仍保有相当存量的 Intel 机型（尤其培训/考试场景的旧机房电脑）。Rust/Xcode 工具链
对 Apple 平台间交叉编译（arm64 runner 编 x86_64-apple-darwin）是官方支持的一等路径，
无需 Intel 真机或自托管 runner。

## 决策

- CI 的 build-macos 改为双架构 matrix：`aarch64-apple-darwin`（原生）与
  `x86_64-apple-darwin`（同机交叉编译），`rustup target add <triple>` +
  `tauri build --target <triple>`；指定 `--target` 后产物路径变为
  `src-tauri/target/<triple>/release/bundle/`，两架构互不覆盖。
- **不做 universal（lipo 合并）单包**：dmg 体积近乎翻倍；且 tauri-plugin-updater 按
  「当前系统架构」取 latest.json 的平台键，分架构包与 `darwin-aarch64` / `darwin-x86_64`
  键天然对齐，universal 包反而两个键都要指向同一大文件。
- 文件名沿用既有习惯：`*_aarch64.dmg` / `*_x64.dmg`（与 Windows `*_x64-setup.exe` 的
  x64 命名一致）；更新产物为同名 `.app.tar.gz`(+`.sig`)。
- latest.json 新增 `darwin-x86_64` 平台条目；Intel 用户装上 x64 包后即可正常应用内自更新。
- 校验清单不再由各构建 job 生成（双架构 mac 会同名冲突），改由 publish job 汇合全部产物后
  统一生成单个 `checksums.txt`（覆盖全部 dmg / exe / 更新包）。
- rust-cache 按目标三元组隔离（`key: <triple>`）；`fail-fast: false` 让一条腿失败时另一条
  跑完（publish 仍要求两条腿都成功，延续「全平台成功才发版」的原则）。
- 本地验证方式：`rustup target add x86_64-apple-darwin`（下载超时用 rsproxy 镜像
  `RUSTUP_DIST_SERVER=https://rsproxy.cn`）→ `npx tauri build --target
  x86_64-apple-darwin --bundles app` → `file` 验证二进制为 x86_64。

## 后果

- 正面：Intel Mac 用户可直接安装并进入应用内更新链路；无需额外 runner，CI 只加一条
  matrix 腿；签名/公证逻辑对两架构零改动（同一套 APPLE_* Secrets 流程）。
- 负面：macOS 构建时长与产物数近乎翻倍（公开仓库 Actions 免费额度内可接受）；Release 页
  多一个 dmg 资产，README 需指导按 `uname -m` 选包；x64 腿无法在 arm64 本机运行验证，
  只能靠 `file`/`lipo` 验证架构与 CI 签名校验兜底。
