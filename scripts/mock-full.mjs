// 全真模考完整回归：UI 导入答案 → 官方全真卷 190 题全卷作答 → 交卷判分 → 落库验证
// 运行：node scripts/mock-full.mjs   （需 vite dev server 在 1420 端口）
// 判定基准：全部按官方答案作答 → 官方卷得分 100 · 答对 190/190 · 历史恰好 1 条 · 错题本 0 条
import { chromium } from "playwright-core";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const EDGE = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const BASE = "http://localhost:1420";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const paper = JSON.parse(readFileSync(join(ROOT, "src/data/mock190.json"), "utf8"));

const results = [];
const jsErrors = [];

async function run() {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on("pageerror", (e) => jsErrors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && jsErrors.push("console: " + m.text().slice(0, 160)));

  const step = async (name, fn) => {
    try {
      await fn();
      results.push(["PASS", name, ""]);
    } catch (e) {
      results.push(["FAIL", name, String(e.message ?? e).slice(0, 300)]);
      await page.screenshot({ path: `/tmp/atp-impl/full-fail-${results.length}.png` }).catch(() => {});
    }
  };
  const see = (text, timeout = 8000) =>
    page.getByText(text, { exact: false }).first().waitFor({ timeout, state: "visible" });
  const store = () => page.evaluate(() => { const p = JSON.parse(localStorage.getItem("atp.store.v1") ?? "{}"); return p.state ?? p; }); // zustand persist 信封
  const optBtn = (letter) =>
    page
      .locator("button")
      .filter({ has: page.locator("span", { hasText: new RegExp(`^${letter}$`) }) })
      .first();

  // 干净起点：清空本地数据，让「历史恰好 1 条」可断言
  await page.goto(BASE + "/?page=exam", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await see("理论模拟考试");

  // S1 答案导入：官方答案按全真卷连续编号粘贴（判断 1-40 √/× · 单选 41-180 · 多选 181-190）
  await step("S1 导入理论答案 190 条（粘贴 → 解析导入）", async () => {
    const lines = [
      ...paper.judge.map((q) => `${q.n}. ${q.answer}`),
      ...paper.single.map((q) => `${q.n + 40}. ${q.answer}`),
      ...paper.multi.map((q) => `${q.n + 180}. ${q.answer}`),
    ];
    await page.locator("textarea").fill(lines.join("\n"));
    await page.getByRole("button", { name: "解析导入" }).click();
    await see("当前已导入 190 条");
  });

  // S2 进入官方全真卷（点第一张预设卡的「开始考试」，走真实用户路径而非深链）
  await step("S2 进入官方全真卷 190 题", async () => {
    await page.getByRole("button", { name: "开始考试", exact: true }).first().click();
    await see("第 1 / 190 题");
    await see("官方全真卷");
  });

  // S3 全卷作答：数据驱动（判断 √/×；单选/多选逐个点选项字母），下一题推进
  await step("S3 按官方答案全卷作答 190 题", async () => {
    const all = [
      ...paper.judge.map((q) => ({ type: "judge", ans: q.answer })),
      ...paper.single.map((q) => ({ type: "single", ans: q.answer })),
      ...paper.multi.map((q) => ({ type: "multi", ans: q.answer })),
    ];
    for (let i = 0; i < all.length; i++) {
      const { type, ans } = all[i];
      if (type === "judge") {
        await page.getByRole("button", { name: ans === "√" ? "正确 √" : "错误 ×" }).click();
      } else {
        for (const L of ans) await optBtn(L).click();
      }
      if (i === 39) await see("已答 40/190"); // 判断题段结束检查点
      if (i < all.length - 1) await page.getByRole("button", { name: "下一题" }).click();
    }
    await see("已答 190/190");
  });

  // S4 交卷 → 官方加权判分（40×0.5 + 140×0.5 + 10×1 = 100）
  await step("S4 交卷判分：官方卷得分 100 · 答对 190/190", async () => {
    await page.getByRole("button", { name: "交卷" }).click();
    await see("考试结束");
    await see("官方卷得分");
    await see("答对 190/190");
    await see("官方答案判定");
    await see("190/190"); // 作答完成 Stat
  });

  // S5 落库验证：历史恰好 1 条（StrictMode 不重复）、得分 100、错题本 0、导入答案仍在
  await step("S5 落库：历史 1 条得分 100 · 错题本 0 · answerKey 190 条", async () => {
    await page.waitForTimeout(300);
    const s = await store();
    assert.equal(s.history?.length, 1, `历史应恰好 1 条，实际 ${s.history?.length}`);
    assert.equal(s.history?.[0]?.score, 100, `成绩应为 100，实际 ${s.history?.[0]?.score}`);
    assert.equal(s.wrongBook?.length, 0, `全对应无错题，实际 ${s.wrongBook?.length}`);
    assert.equal(Object.keys(s.theoryDone ?? {}).length, 0, "官方卷不应计入 theoryDone（非 900 题库）");
    const keyCount =
      Object.keys(s.answerKey?.judge ?? {}).length +
      Object.keys(s.answerKey?.single ?? {}).length +
      Object.keys(s.answerKey?.multi ?? {}).length;
    assert.equal(keyCount, 190, `导入答案应 190 条，实际 ${keyCount}`);
    // 抽查分节落位：判断 1=√、单选 1=A、多选 1=ABC（连续编号正确拆节）
    assert.equal(s.answerKey.judge?.["1"], paper.judge[0].answer, "judge[1] 应为官方答案");
    assert.equal(s.answerKey.single?.["1"], paper.single[0].answer, "single[1] 应为官方单选第 1 题");
    assert.equal(s.answerKey.multi?.["1"], paper.multi[0].answer, "multi[1] 应为官方多选第 1 题");
  });

  // S6 返回首页：深链参数清除，仪表盘历史可见
  await step("S6 返回首页：清除深链参数回到仪表盘", async () => {
    await page.getByRole("button", { name: "返回首页" }).click();
    await page.waitForTimeout(500);
    await see("备考总览");
    assert.ok(!page.url().includes("page=exam"), `URL 应无深链参数，实际 ${page.url()}`);
  });

  await page.screenshot({ path: "/tmp/atp-impl/full-run-final.png", fullPage: false }).catch(() => {});
  await browser.close();

  console.log("\n═══ 全真模考完整回归 ═══");
  for (const [st, name, msg] of results) console.log(`${st}  ${name}${msg ? "\n     ↳ " + msg : ""}`);
  if (jsErrors.length) {
    console.log("\n页面 JS 报错：");
    for (const e of jsErrors) console.log("  " + e);
  }
  const failed = results.filter((r) => r[0] === "FAIL").length;
  console.log(`\n${failed === 0 && jsErrors.length === 0 ? "✅ 全部通过" : "❌ 存在失败"}（${results.length - failed}/${results.length} 步，JS 报错 ${jsErrors.length}）`);
  process.exit(failed === 0 && jsErrors.length === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error("脚本异常:", e);
  process.exit(1);
});
