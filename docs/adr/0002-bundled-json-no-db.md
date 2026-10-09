# 0002 — 数据层采用打包 JSON + localStorage，不引入数据库

- 状态：已接受
- 日期：2026-10-08

## 背景

应用有两大类数据：① 只读内容（190 题官方理论卷、40 道实操题、39 份实操参考答案、900 条 AI 生成的
理论答案、知识树与课程）；② 用户数据（做题历史、错题本、练习进度、已掌握标记、用户导入的答案）。
最初设计笔记里曾考虑 SQLite 存题库，但题库总量 < 1 MB、结构稳定、由构建期脚本生成，运行时不写入。

## 决策

- **只读内容**：全部作为静态 JSON 打包进前端（`src/data/mock190.json`、`practicalAnswers.json`、
  `aiAnswers.json`、`content.ts`），`import` 直接引用，Vite 构建期内联/摇树。
- **用户数据**：单一 `Store` 对象序列化存 `localStorage`，key 为 `atp.store.v1`，读写统一走
  `src/lib/api.ts` 的 `loadStore()/saveStore()`，结构变更靠版本号后缀整体迁移（v1 → v2 时换 key
  并做一次性迁移）。
- **不引入** SQLite、IndexedDB、Tauri store 插件或任何后端存储。

## 后果

**正面**
- 零运行时依赖、零 schema 维护成本；题库更新 = 重新跑脚本 + 提交 JSON，diff 可审查。
- localStorage 同步读写，判分/报告页不需要任何异步数据获取逻辑。

**负面 / 代价**
- localStorage 约 5 MB 上限且不分盘 —— 错题本已做 `slice(0, 20)` 截断，历史记录只存聚合分数。
- 数据无法跨设备/跨浏览器迁移；换机器即丢失（可接受的备考工具生命周期假设）。
- 若未来要存 notebook 产物等大对象，必须换方案（届时新增 ADR 取代本条）。
