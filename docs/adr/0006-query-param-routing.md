# 0006 — 路由不引入 react-router，用 App 级 state + URL 查询参数深链

- 状态：已接受
- 日期：2026-10-09

## 背景

应用共 8 个页面，桌面窗口单实例。真实需求除了页内切换，还有两类「外部入口直达状态」：
① 恢复上次会话/书签式跳转（如直达某实操题）；② **E2E 测试需要从 URL 直接构造任意页面状态**
（自动测试不能用点击链路去模拟「第 3 题组的第 2 题」这种深层状态，太脆）。

## 决策

- 不引入 react-router。`App.tsx` 持有 `page` state，侧栏切换即 setState。
- **深链通过查询参数**：`?page=<id>&paper=official&group=<gid>&idx=<n>&ref=1`。
  启动时 `App.tsx` 解析 `location.search` 初始化 state（`initialPractical()` 读 group/idx、
  `autoOfficial` 读 paper=official）；应用内不再反向写 URL（单向）。
- 兼容性约束：查询参数是「启动快捷方式」，应用内导航不维护 URL，刷新后回到首页属预期行为。

## 后果

**正面**
- 零依赖、零 history 栈管理复杂度；Tauri 桌面场景没有浏览器前进/后退按钮的诉求。
- E2E（ADR-0007）直接 `page.goto("/?page=exam&paper=official")` 即可到达深层状态，
  测试稳定性大幅提升。

**负面 / 代价**
- 参数集合是隐式契约（`page/paper/group/idx/ref`），增删必须同步更新 `App.tsx` 解析与
  AGENTS.md 文档，否则深链静默失效。
- 刷新丢状态：用户在答题中途刷新会回到首页（答题中数据本就只在内存，见 ADR-0002）。
