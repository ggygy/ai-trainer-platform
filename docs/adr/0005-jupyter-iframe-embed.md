# 0005 — Jupyter Lab 以 iframe 嵌入答题页（端口 8889），浏览器模式降级为占位符

- 状态：已接受
- 日期：2026-10-08

## 背景

实操答题页的核心诉求：左侧读题作答，右侧直接操作 notebook，而不是让用户在应用与浏览器窗口间
切换。Jupyter Lab 自带完整 Web UI，自己重写一套前端不现实。

## 决策

- 实操答题页右栏用 **`<iframe src="http://localhost:8889/lab?token=…">` 嵌入 Jupyter Lab**。
  Rust 侧启动时生成/传递 token，iframe URL 由后端命令返回。
- 启动状态条（检测中 → 启动中 → 已就绪 → 失败）由 `install-log`/启动命令的返回驱动。
- **浏览器预览模式（非 Tauri）不尝试 iframe**：`!isTauri()` 时渲染占位说明卡片
  （"启动 Jupyter (mock)"按钮走 mock 流程并输出提示日志），因为纯浏览器下没有 Rust 后程
  可启动子进程，且 localhost:8889 未必在运行。

## 后果

**正面**
- 完整保留 Jupyter 原生交互（补全、快捷键、kernel 管理），开发成本≈0。
- 端口固定 8889，E2E 测试与实操题素材目录约定一致。

**负面 / 代价**
- 依赖用户本机 Jupyter 正常运行；Jupyter 升级更换 URL 结构（如 token 强制）会导致 iframe 白屏。
- iframe 跨源限制：无法从外层页面读取 notebook 内容做自动判分，实操只能「对照自评」。
- 浏览器模式下该区域是降级体验，E2E 对 iframe 内部不做断言（只能验证占位/状态条）。

## 修订（2026-10-10）：放开 frame-ancestors + 就绪地址常驻状态

实测 jupyter 4.x 默认对页面下发 `Content-Security-Policy: frame-ancestors 'self'`，Tauri
WebView 是异源（tauri.localhost / tauri://localhost），iframe 被浏览器静默拦截——所有平台
一致空白。启动参数统一追加
`--ServerApp.tornado_settings={"headers":{"Content-Security-Policy":"frame-ancestors *"}}`
（本地 127.0.0.1 + token 鉴权，风险可控；已实测响应头变为 frame-ancestors *）。

另修「运行中但 iframe 停在未启动占位符」：jupyter_status 此前永远返回空 url，页面切换重挂载
后前端拿不到地址。JupyterState 增设常驻 ready_url（stderr 捕获或看门狗兜底时写入），status /
已运行查询一律带回。应用退出（RunEvent::Exit）顺带 taskkill 整棵 jupyter 进程树，不再留僵尸。

### 再修订（同日续）：SameSite=None + 自设 token（真实浏览器实测）

仅放开 frame-ancestors 不够。Edge(Chromium 155) 实测：跨站 iframe 里 jupyter 的会话 cookie
（默认无 SameSite → 按 Lax 处理）**一律种不上也带不出**——连 `?token=xxx` 的自动登录都会被
拦下，iframe 永远停在登录墙（用户 v0.3.1 实拍即此）。jupyter_server 的 cookie 参数可经
tornado settings 注入（`auth/login.py` 读 `settings["cookie_options"]`，`_xsrf` 走 tornado 的
`xsrf_cookie_kwargs`）：注入 `{'samesite':'None','secure':True}` 后实测 token 直登、Lab 界面
完整挂载、零 4xx/5xx。

两个坑记下：
- traitlets 解析 dict 型 CLI 参数走 **Python 字面量**（literal_eval），JSON 的 `true`/`false`
  会报 `expected a dict, not the list`——值必须写 `True`；
- jupyter_server ≥2（jupyterlab 4+）支持 `--IdentityProvider.token=<自设随机值>`，地址完全
  确定（`/lab?token=…`），不再赌 stderr 抓包时序（端口先通、URL 后打会抢出无 token 兜底地
  址）。旧版 jupyter 不识别该参数（启动即退），仅 jupyterlab ≥4 传；旧版看门狗改为「端口通
  后再等 stderr 4s」才落无 token 兜底。

### 三修（用户实测内核 Connecting）：allow_origin + ASCII runtime 目录 + 内核日志可见

用户真机（WebView2）：文件浏览器正常（HTTP+cookie 通），内核永远「Connecting」= 服务端
内核进程没起来或 WS 被拒。三项处置：
- `--ServerApp.allow_origin='*' --ServerApp.allow_credentials=True`：跨站 iframe 的 WS
  握手 Origin 主机名（tauri.localhost）与服务端（127.0.0.1）不同；jupyter 的 origin 校验
  只比主机名不比端口，主机名不同必拒。同站跨源实测：会话→WS→执行 2+2 取回 "4" 全链路通过。
- `JUPYTER_RUNTIME_DIR` 指到应用数据目录（ASCII）：中文用户名 Windows 的经典坑——内核
  连接文件写在 `C:\Users\<中文名>\AppData\...\jupyter\runtime`，内核进程读不到，永远
  starting。实测连接文件正确落在指定目录。
- `jupyter-log` 事件（服务端 stderr）按 kernel/error 关键词过滤透到两页日志区：内核再
  出问题，界面上直接能看到 traceback。
- 顺带 `--LabApp.news_disable=True` 关掉右下角新闻弹窗。
