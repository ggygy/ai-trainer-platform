# 0012 · macOS Developer ID 签名与公证接入 CI

日期：2026-10-10 · 状态：已采纳

## 背景

未签名 dmg 被浏览器打上 quarantine 后，Apple Silicon 新版 macOS 直接报「已损坏，无法打开」
（「右键 → 打开」已不放行），只能让用户手动 `xattr -cr` 清隔离——对不熟终端的备考用户是硬门槛。
用户已有 Apple Developer Program 账号。

## 决策

CI（build.yml 的 build-macos job）向 `tauri build` 注入标准环境变量，tauri-bundler 检测到后自动完成
「临时钥匙串导入证书 → Developer ID 签名（hardened runtime）→ notarytool 公证 → staple 订书」：

| Secret | 内容 |
|---|---|
| `APPLE_CERTIFICATE` | Developer ID Application 证书 .p12 的 base64（`base64 -i xxx.p12`） |
| `APPLE_CERTIFICATE_PASSWORD` | 导出 .p12 时设置的密码 |
| `APPLE_SIGNING_IDENTITY` | `security find-identity -v -p codesigning` 里的证书全名 |
| `APPLE_ID` | Apple ID 邮箱 |
| `APPLE_PASSWORD` | appleid.apple.com 生成的 App 专用密码（非登录密码） |
| `APPLE_TEAM_ID` | 开发者账户页 10 位 Team ID |

- Secrets 未配置时行为与之前完全一致（未签名构建），CI 不会因缺 Secret 失败；
- job 级 `SIGNED` env 驱动签名校验步骤（`codesign --verify --strict` + `spctl -a`）与
  Release 说明文案切换；
- Windows 侧仍无代码签名（需要另行购买 OV/EV 证书，暂缓），SmartScreen 提示保留。

## 后果

- 配置 Secrets 后的新 Release，dmg 下载即开，无「已损坏」弹窗；门禁评估 `spctl` accepted。
- 公证给 CI 增加 2-5 分钟；Apple 侧偶发公证慢只影响构建时长不影响成败（bundler 等待完成）。
- 证书有效期到后期需续签证书并更新 `APPLE_CERTIFICATE` Secret（Apple 会在到期前邮件提醒）。
