# 0009 — 状态管理迁移到 zustand（persist 沿用 atp.store.v1）

- 状态：已接受
- 日期：2026-10-09

## 背景

应用 grow 出 7 个页面后，手写状态流暴露出结构性问题：`loadStore()/saveStore()` 散落 9 处，
三套读写路径并存（props 驱动、render 内直读 localStorage、handler 内直写 localStorage），
由此产生多个已知不同步点——TheoryLearn 用 `setMasteredTick` 强制重渲染、PracticalTrain
非响应式直读、PracticalExam 靠 `onProgress` 回调手动补偿 App state、EnvAssistant 写
materialDir 不通知任何人。每加一个页面都要重新发明一遍「写完怎么让别处知道」。

## 决策

- 引入 **zustand v5**（`create` + `persist` 中间件），新建 `src/lib/store.ts` 单一状态源。
- **存储介质与 key 不变**：仍为 localStorage 的 `atp.store.v1`（ADR-0002 的数据模型决策不变，
  只是读写机制升级）。写路径全部 action 化：`submitExam` / `importAnswers` / `clearAnswers` /
  `recordQuizAnswer` / `toggleMastered` / `markPracticeDone` / `setMaterialDir`；
  组件用 `useStore()` 订阅，删除 tick/onProgress 等全部手写同步 hack。
- **持久化格式迁移**：旧数据是裸 Store 对象，zustand persist 默认写 `{ state, version }` 信封。
  自定义 `PersistStorage` 读取时两种格式都认（裸对象按 version 0 收编），首次写回统一信封；
  `merge` 保持旧 loadStore 的浅合并语义。用户已积累的备考数据零丢失。
- `answers.ts` 的 `refAnswer(store, ...)` 保持纯函数；`api.ts` 只留数据模型类型与 Tauri invoke 封装。

## 后果

**正面**
- 9 处手写同步样板全部删除；任何页面写入后，订阅该切片的页面自动刷新，不同步类 bug 失去土壤。
- persist 自带版本号 + migrate 钩子，未来 schema 演进有标准路径。

**负面 / 代价**
- 多了 ~3KB 依赖；persist 信封使 localStorage 里的 JSON 变一层嵌套（E2E 测试 helper 已适配
  `p.state ?? p`）。
- StrictMode 双跑问题依旧存在（zustand 不去重 effect），TheoryExam 交卷的 `savedRef` 守卫必须
  保留——约定写状态走 action ≠ 可以裸跑副作用。
