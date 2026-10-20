# 0017 — 内嵌 Jupyter 内核通道 WS 认证改为 URL token(appendToken)

## 状态

已接受(2026-10-20)。ADR-0005 的修订:iframe + token 内嵌形态不变,内核 WebSocket 认证方式升级。

## 背景

issue #6:应用内嵌 JupyterLab 文件浏览器正常,内核永远 `Disconnected`、cell 无法执行;同一地址在外部浏览器打开一切正常。

逐层定位(本机用「localhost 主页面嵌 127.0.0.1 iframe」同构复现,Edge 155 默认即拦三方 cookie):

- REST API 正常:JupyterLab 登录后页面 `page_config` 带 token,前端所有 REST 请求带 `Authorization: token …` header,不受 cookie 策略影响。
- 内核通道 WebSocket 全部 403:浏览器 WebSocket API 不能设置自定义 header,且 JupyterLab 前端默认不把 token 放进 WS URL(由 `page_config` 的 `appendToken` 控制,服务端没有配置项下发该键,默认 false)→ WS 认证只能靠会话 cookie;Edge/WebView2 155 起(以及 macOS WKWebView 的 ITP)对跨站 iframe 默认拦截第三方 cookie,`SameSite=None; Secure` 也照拦 → 服务端日志 `Couldn't authenticate WebSocket connection`。
- 之前 v0.3.6 的 `allow_origin` 修复解决的是 Origin 检查层;本次是更深一层(cookie 认证层),两处配置都需要保留。

## 决策

启动参数 `--ServerApp.tornado_settings` 中预置 `'page_config_data':{'appendToken':'true'}`:

- 服务端没有 appendToken 配置项,但 `tornado_settings` 整体合入 web_app settings,而 LabApp 组装 page_config 时对该 dict 是 setdefault/update 语义,不会覆盖注入键 → 页面 `page_config` 输出 `appendToken: "true"`。
- 前端(含旧版分支)所有 WS URL(kernel channels、events/subscribe、terminal)自动追加 `?token=…`;服务端 `TokenAuthorizationMixin` 本就支持 URL 查询参数认证,握手即通过,不再依赖 cookie。

放弃的方案:关闭认证(`token=''` + `allow_unauthenticated_access`)——虽然仅回环+随机端口风险可控,但保留 token 认证更稳;反向代理把 jupyter 挂到应用自定义协议下实现同源——工程量大收益相同。

同批移除 `--LabApp.news_disable=True`:jupyterlab 4.6 已删除该 trait,每次启动打 `Trait not found` 警告(吓用户),4.6 也不再弹新闻。

## 后果

- 正:跨站 iframe 内核通道不再依赖 cookie,任何三方 cookie 策略(Edge/WebView2/WKWebView ITP)下均可用;token 只进本机回环 WS URL,泄露面可忽略。
- 负:若未来 jupyterlab 前端移除 appendToken 逻辑或 page_config 组装不再 setdefault,需重新适配(升级 jupyterlab 版本时留意);WS URL 带查询 token 会出现在浏览器调试/服务日志中(本机服务,可接受)。
- 验证方法(可复用):localhost 页面嵌 127.0.0.1 jupyter iframe(跨站),监听 `page.on('websocket')` 确认 kernel channels URL 带 token 且无 403,或在 iframe 上下文手动 `new WebSocket(…?token=…)` 发 execute_request 收 execute_result。
