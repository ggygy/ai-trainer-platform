// 自动化 UI 测试：playwright-core + 系统 Edge（无头）
// 运行：node scripts/ui-test.mjs   （需 vite dev server 在 1420 端口）
import { chromium } from "playwright-core";
import assert from "node:assert";

const EDGE = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const BASE = "http://localhost:1420";
const results = [];
const jsErrors = [];

async function run() {
// 先试系统 Edge；Edge 自动更新后无头模式可能整体停帧（rAF 不触发 → 点击判稳定永远超时），
// 用 2.5s rAF 探针检测，失败回落 Playwright 内置 headless shell（ADR-0007 修订）
async function launchBrowser() {
  try {
    const b = await chromium.launch({ executablePath: EDGE, headless: true });
    const probe = await (await b.newContext()).newPage();
    const ok = await probe.evaluate(
      () =>
        new Promise((res) => {
          let n = 0;
          const f = () => (++n >= 2 ? res(true) : requestAnimationFrame(f));
          requestAnimationFrame(f);
          setTimeout(() => res(false), 2500);
        }),
    );
    await probe.close().catch(() => {});
    if (ok) return b;
    await b.close().catch(() => {});
    console.log("⚠ 系统 Edge 无头模式 rAF 不触发（Edge 自动更新已知问题），回退内置 Chromium");
  } catch {
    /* 未装 Edge 或启动失败，直接用内置 */
  }
  return chromium.launch({ headless: true });
}

  const browser = await launchBrowser();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on("pageerror", (e) => jsErrors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && jsErrors.push("console: " + m.text().slice(0, 160)));

  const step = async (name, fn) => {
    try {
      await fn();
      results.push(["PASS", name, ""]);
    } catch (e) {
      results.push(["FAIL", name, String(e.message ?? e).slice(0, 220)]);
      await page.screenshot({ path: `/tmp/atp-impl/fail-${results.length}.png` }).catch(() => {});
    }
  };
  const nav = (name) => page.getByRole("navigation").getByRole("button", { name });
  const store = () => page.evaluate(() => { const p = JSON.parse(localStorage.getItem("atp.store.v1") ?? "{}"); return p.state ?? p; }); // zustand persist 信封
  const see = (text, timeout = 6000) =>
    page.getByText(text, { exact: false }).first().waitFor({ timeout, state: "visible" });

  await page.goto(BASE + "/", { waitUntil: "networkidle" });

  // T1 侧边栏导航
  await step("T1 侧边栏可进入全部 6 个主页面", async () => {
    for (const [item, hint] of [
      ["理论学习", "知识体系"],
      ["模拟考试", "理论模拟考试"],
      ["实操训练", "官方 40 题"],
      ["环境助手", "环境助手"],
      ["成绩错题", "成绩报告"],
      ["首页", "备考总览"],
    ]) {
      await nav(item).click();
      await see(hint);
    }
  });

  // T2 首页快捷入口
  await step("T2 首页快捷入口跳转（开始模拟考试 / 打开环境助手）", async () => {
    await page.getByRole("button", { name: "开始模拟考试", exact: true }).first().click();
    await see("理论模拟考试");
    await nav("首页").click();
    await page.getByRole("button", { name: "打开环境助手" }).click();
    await see("依赖清单");
    await nav("首页").click();
    await see("备考总览");
  });

  // T3 快速刷题全流程 + StrictMode 不重复记录
  await step("T3 快速刷题：开考→交卷→计分→历史恰好 1 条", async () => {
    await nav("模拟考试").click();
    const cards = page.locator("div.cursor-pointer");
    await cards.nth(3).getByRole("button", { name: "开始考试", exact: true }).click();
    await see("第 1 / 45 题");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "下一题" }).click();
    await page.getByRole("button", { name: "交卷" }).click();
    await see("考试结束");
    await see("综合得分");
    await page.waitForTimeout(300);
    const s = await store();
    assert.equal(s.history?.length, 1, `history 应为 1 条（StrictMode 重复写入?），实际 ${s.history?.length}`);
    assert.equal(s.wrongBook?.length, 20, `错题应收录 20 条，实际 ${s.wrongBook?.length}`);
    assert.equal(Object.keys(s.theoryDone ?? {}).length, 0, "未作答的快速刷题不应计入 theoryDone");
    await page.getByRole("button", { name: "返回首页" }).click();
    await see("备考总览");
  });

  // T4 官方全真卷深链 + 答题 + 判分 + 返回首页不复发考试
  await step("T4 官方全真卷：深链自动开考→答题→官方判分→返回首页", async () => {
    await page.goto(BASE + "/?page=exam&paper=official", { waitUntil: "networkidle" });
    await see("第 1 / 190 题");
    await see("官方全真卷");
    await page.getByRole("button", { name: "错误 ×" }).click(); // 官方卷第 1 判断题答案为 ×
    await page.getByRole("button", { name: "41", exact: true }).click(); // 答题卡跳到单选第 1 题
    await see("在浏览器中，要打开一个新的标签页");
    await page.getByRole("button", { name: /Ctrl \+ T/ }).click();
    await page.getByRole("button", { name: "交卷" }).click();
    await see("考试结束");
    await see("官方答案判定");
    const s = await store();
    assert.equal(s.history?.length, 2, `官方卷应记 1 次历史，实际累计 ${s.history?.length}`);
    await page.getByRole("button", { name: "返回首页" }).click();
    await page.waitForTimeout(400);
    await see("备考总览");
    assert.ok(!page.url().includes("paper=official"), "返回首页应清除深链参数");
  });

  // T5 实操：入口/参考答案/切题/标记完成
  await step("T5 实操训练：开始练习→参考答案展开→切题→标记完成落库", async () => {
    await nav("实操训练").click();
    await page.locator("button", { hasText: "开始练习" }).nth(3).click();
    await see("2.2.1");
    await page.getByRole("button", { name: /展开官方参考代码/ }).click();
    await see("2.2.1.ipynb");
    await page.getByRole("button", { name: /收起答案/ }).click();
    await page.locator("select").selectOption("2.2-2");
    await see("2.2.3");
    await page.getByRole("button", { name: "标记完成", exact: true }).click();
    await page.waitForTimeout(300);
    const s = await store();
    assert.ok(s.practice?.["2.2-2"]?.done, "practice[2.2-2].done 应为 true");
  });

  // T6 环境助手：检测 + mock 安装 + mock Jupyter
  await step("T6 环境助手：重新检测→一键安装(mock 日志)→启动 Jupyter(mock)", async () => {
    await nav("环境助手").click();
    await page.getByRole("button", { name: /重新检测/ }).click();
    await see("已安装", 8000);
    await page.getByRole("button", { name: /一键安装缺失依赖/ }).click();
    await see("(mock) pip install");
    await see("安装完成 ✓", 10000);
    await page.getByRole("button", { name: "启动 Jupyter" }).click();
    await see("✓ Jupyter 已就绪");
    await page.getByRole("button", { name: /打开 Lab/ }).click(); // 浏览器预览模式应打日志而非开窗
    await see("浏览器预览模式");
  });

  // T7 理论学习：本章例题池（3.1.1 共 41 道，首三题固定为 单选 s70 → 判断 j153 → 多选 m70）
  await step("T7 理论学习：本章真题池→单选/判断/多选判分→掌握标记持久化", async () => {
    await nav("理论学习").click();
    await see("配套例题");
    await see("例题 1/41");
    const card = page.locator("div.bg-surface.border", { hasText: "配套例题" });
    // 第 1 题单选 s70：点最后一个选项按钮判分
    await card.locator("button").last().click();
    await see("正确答案");
    await page.getByRole("button", { name: "标记已掌握" }).click();
    await page.waitForTimeout(200);
    let s = await store();
    assert.equal(s.mastered?.["3.1.1"], true, "mastered[3.1.1] 应为 true");
    assert.ok(s.theoryDone?.["s70"], `单选作答应计入 theoryDone[s70]，实际 ${JSON.stringify(s.theoryDone ?? {})}`);
    // 第 2 题判断 j153：正确/错误 两按钮
    await page.getByRole("button", { name: "下一题" }).click();
    await see("例题 2/41");
    await page.getByRole("button", { name: "正确" }).click();
    await see("正确答案");
    // 第 3 题多选 m70：勾选一个选项后提交
    await page.getByRole("button", { name: "下一题" }).click();
    await see("例题 3/41");
    await card.locator("button").filter({ hasText: /^A/ }).first().click(); // 勾选选项 A
    await page.getByRole("button", { name: "提交答案" }).click();
    await see("正确答案");
    // 第 4 题起继续轮换
    await page.getByRole("button", { name: "下一题" }).click();
    await see("例题 4/41");
    s = await store();
    assert.ok(s.theoryDone?.["j153"], `判断作答应计入 theoryDone[j153]`);
    assert.ok(s.theoryDone?.["m70"], `多选作答应计入 theoryDone[m70]`);
    const wrongKeys = (s.wrongBook ?? []).map((w) => w.id);
    // 错题本键家族：刷题/练习 j|s|m+题库id，官方全真卷 oj|os|om+卷内序号
    assert.ok(wrongKeys.every((k) => /^[ojsm]{1,2}\d+$/.test(k)), `错题本键格式异常，实际 ${JSON.stringify(wrongKeys.slice(0, 8))}…`);
  });

  // T8 成绩报告：导出下载 + 跳转按钮
  await step("T8 成绩报告：导出报告下载 + 重练全部错题/去刷理论题跳转", async () => {
    await nav("成绩错题").click();
    await see("错题本");
    const dlP = page.waitForEvent("download", { timeout: 8000 });
    await page.getByRole("button", { name: /导出报告/ }).click();
    const dl = await dlP;
    assert.ok(dl.suggestedFilename().includes("备考报告"), "导出文件名应含 备考报告");
    await page.getByRole("button", { name: /重练全部错题/ }).click();
    await see("理论模拟考试");
    await nav("成绩错题").click();
    await page.getByText("去刷理论题").click();
    await see("理论模拟考试");
  });

  await browser.close();
}

run()
  .catch((e) => results.push(["FAIL", "测试执行中断", String(e).slice(0, 200)]))
  .finally(() => {
    console.log("\n===== 自动化 UI 测试结果 =====");
    for (const [st, name, msg] of results)
      console.log(`${st === "PASS" ? "✅" : "❌"} ${name}${msg ? `\n   └ ${msg}` : ""}`);
    const fails = results.filter((r) => r[0] === "FAIL").length;
    if (jsErrors.length) {
      console.log(`\n⚠️ 页面 JS 报错 ${jsErrors.length} 条：`);
      for (const e of [...new Set(jsErrors)].slice(0, 8)) console.log("   · " + e);
    } else console.log("\n页面无 JS 报错");
    console.log(`\n${results.length - fails}/${results.length} 通过`);
    process.exit(fails ? 1 : 0);
  });
