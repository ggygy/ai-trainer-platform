// 自动化 UI 测试：playwright-core + 系统 Edge（无头）
// 运行：node scripts/ui-test.mjs   （需 vite dev server 在 1420 端口）
import { chromium } from "playwright-core";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const aiAnswers = require("../src/data/aiAnswers.json");
const mock190 = require("../src/data/mock190.json");

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
  await step("T1 侧边栏可进入全部 7 个主页面", async () => {
    for (const [item, hint] of [
      ["报考指南", "报名条件"],
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
    // 答题回顾：45 题全部未作答 → 筛选 chip「未答 45」，逐题块与答题卡都应渲染
    await see("答题回顾");
    await see("未答 45");
    assert.equal(await page.locator('[id^="rv-"]').count(), 45, "答题回顾应逐题渲染 45 道");
    await page.waitForTimeout(300);
    const s = await store();
    assert.equal(s.history?.length, 1, `history 应为 1 条（StrictMode 重复写入?），实际 ${s.history?.length}`);
    assert.equal(s.wrongBook?.length, 20, `错题应收录 20 条，实际 ${s.wrongBook?.length}`);
    assert.equal(Object.keys(s.theoryDone ?? {}).length, 0, "未作答的快速刷题不应计入 theoryDone");
    const d = s.history[0].detail;
    assert.ok(d && d.mode === "normal" && d.total === 45 && d.keys.length === 45, `history.detail 应落库 45 题逐题数据，实际 ${JSON.stringify(d && { mode: d.mode, total: d.total, keys: d.keys.length })}`);
    assert.equal(Object.keys(d.answers).length, 0, "未作答时 detail.answers 应为空");
    await page.getByRole("button", { name: "返回首页" }).click();
    await see("备考总览");
  });

  // T4 官方全真卷深链 + 答题 + 判分 + 答题回顾筛选 + 返回首页不复发考试
  await step("T4 官方全真卷：深链自动开考→答题→官方判分→答题回顾→返回首页", async () => {
    await page.goto(BASE + "/?page=exam&paper=official", { waitUntil: "networkidle" });
    await see("第 1 / 190 题");
    await see("官方全真卷");
    await page.getByRole("button", { name: "错误 ×" }).click(); // 第 1 判断题官方答案为 √，此处故意答错以产生一道错题
    await page.getByRole("button", { name: "41", exact: true }).click(); // 答题卡跳到单选第 1 题
    await see("在浏览器中，要打开一个新的标签页");
    await page.getByRole("button", { name: /Ctrl \+ T/ }).click(); // 单选第 1 题官方答案 A = Ctrl + T
    await page.getByRole("button", { name: "交卷" }).click();
    await see("考试结束");
    await see("官方答案判定");
    const s = await store();
    assert.equal(s.history?.length, 2, `官方卷应记 1 次历史，实际累计 ${s.history?.length}`);
    // 逐题数据按数据侧校验：作答 2 题，答对数 = 两题与官方答案比对的结果
    const d = s.history[1].detail;
    assert.ok(d && d.mode === "official" && d.total === 190 && d.keys.length === 190, "官方卷 detail 应为 190 题");
    assert.deepEqual(d.answers, { oj1: ["×"], os1: ["A"] }, `detail.answers 应只含作答的 2 题，实际 ${JSON.stringify(d.answers)}`);
    const expectCorrect =
      (mock190.judge.find((x) => x.n === 1).answer === "×" ? 1 : 0) + (mock190.single.find((x) => x.n === 1).answer === "A" ? 1 : 0);
    assert.equal(d.correct, expectCorrect, `答对数应与官方答案比对一致：期望 ${expectCorrect}，实际 ${d.correct}`);
    // 答题回顾筛选：「答错 N」只显示答错的题，且逐题块展示正确答案与来源
    await see("答题回顾");
    const wrongN = 2 - expectCorrect;
    await page.getByRole("button", { name: `答错 ${wrongN}`, exact: true }).click();
    assert.equal(await page.locator('[id^="rv-"]').count(), wrongN, `筛选「答错」后应只显示 ${wrongN} 题`);
    if (wrongN > 0) {
      await see("正确答案");
      await see("官方答案");
    }
    await page.getByRole("button", { name: "全部 190", exact: true }).click();
    assert.equal(await page.locator('[id^="rv-"]').count(), 190, "切回「全部」应显示 190 题");
    await page.getByRole("button", { name: "返回首页" }).click();
    await page.waitForTimeout(400);
    await see("备考总览");
    assert.ok(!page.url().includes("paper=official"), "返回首页应清除深链参数");
  });

  // T5 实操：入口/参考答案/切题/标记完成 + 简答草稿落库
  await step("T5 实操训练：参考答案→简答草稿切题保留→标记完成落库", async () => {
    await nav("实操训练").click();
    await page.locator("button", { hasText: "开始练习" }).nth(3).click();
    await see("2.2.1");
    await page.getByRole("button", { name: /展开官方参考代码/ }).click();
    await see("2.2.1.ipynb");
    await page.getByRole("button", { name: /收起答案/ }).click();
    // 简答草稿：输入 → 切题 → 切回，内容与 store 均应保留
    await page.locator("textarea").fill("SMOTE 后少数类召回从 0.15 提升到 0.75");
    await page.waitForTimeout(900); // 防抖 600ms 落库
    await page.locator("select").selectOption("2.2-2");
    await see("2.2.3");
    await page.locator("select").selectOption("2.2-0");
    await see("2.2.1");
    assert.equal(
      await page.locator("textarea").inputValue(),
      "SMOTE 后少数类召回从 0.15 提升到 0.75",
      "切题再切回，简答草稿应保留",
    );
    let s = await store();
    assert.equal(s.practicalAnswers?.["2.2-0"], "SMOTE 后少数类召回从 0.15 提升到 0.75", "简答草稿应落库 practicalAnswers");
    await page.getByRole("button", { name: "标记完成", exact: true }).click();
    await page.waitForTimeout(300);
    s = await store();
    assert.ok(s.practice?.["2.2-0"]?.done, "practice[2.2-0].done 应为 true（切回后标记当前题）");
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
    // 上一题回看：作答状态应保留（第 3 题多选已提交，正确答案仍在）
    await page.getByRole("button", { name: "上一题" }).click();
    await see("例题 3/41");
    await see("正确答案");
    // 答题卡网格跳题：点格 1 回第 1 题
    await page.locator("button[title^='单选']").first().click();
    await see("例题 1/41");
    await see("正确答案"); // 第 1 题已作答，状态保留
    // 筛选：只刷未做
    await page.getByRole("button", { name: /只刷未做/ }).click();
    await see("例题");
    // 「本题考点」弹层：打开→显示出处/讲义→Esc 关闭
    await page.getByRole("button", { name: "查看本题考点" }).click();
    await see("本题考点");
    await see("3.1");
    await page.keyboard.press("Escape");
    await page.getByText("本题考点", { exact: true }).waitFor({ state: "hidden", timeout: 4000 });
    await page.getByRole("button", { name: /^全部 41/ }).click(); // 切回全部
    s = await store();
    assert.ok(s.theoryDone?.["j153"], `判断作答应计入 theoryDone[j153]`);
    assert.ok(s.theoryDone?.["m70"], `多选作答应计入 theoryDone[m70]`);
    const wrongKeys = (s.wrongBook ?? []).map((w) => w.id);
    // 错题本键家族：刷题/练习 j|s|m+题库id，官方全真卷 oj|os|om+卷内序号
    assert.ok(wrongKeys.every((k) => /^[ojsm]{1,2}\d+$/.test(k)), `错题本键格式异常，实际 ${JSON.stringify(wrongKeys.slice(0, 8))}…`);
  });

  // T8 成绩报告：历史场次回看 + 错题本展开看答案 + 导出下载 + 错题重练闭环（答对移出/未答保留）
  await step("T8 成绩报告：场次回看 + 错题展开答案 + 导出 + 重练闭环", async () => {
    await nav("成绩错题").click();
    await see("错题本");
    // 模拟考记录：最近一场（T4 官方卷）可回看，弹层内复用答题回顾
    await see("模拟考记录");
    await page.getByRole("button", { name: "查看回顾" }).first().click();
    await see("答题回顾");
    await see("官方全真卷");
    assert.equal(await page.locator('[id^="rv-"]').count(), 190, "官方卷回看应还原 190 题");
    await page.getByRole("button", { name: /关闭/ }).click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('[id^="rv-"]').count(), 0, "关闭弹层后逐题块应消失");
    // 错题本：点一条展开 → 完整题干 + 正确答案（之前只能重做看不到答案）
    await page.getByRole("button", { name: /错 \d+ 次/ }).first().click();
    await see("正确答案");
    assert.equal(await page.locator('[id^="rv-"]').count(), 1, "展开一条错题应渲染一个题目详情块");
    await page.getByRole("button", { name: /错 \d+ 次/ }).first().click(); // 再点收起
    await page.waitForTimeout(150);
    assert.equal(await page.locator('[id^="rv-"]').count(), 0, "收起后详情块应消失");
    const dlP = page.waitForEvent("download", { timeout: 8000 });
    await page.getByRole("button", { name: /导出报告/ }).click();
    const dl = await dlP;
    assert.ok(dl.suggestedFilename().includes("备考报告"), "导出文件名应含 备考报告");
    const before = (await store()).wrongBook?.length ?? 0;
    assert.ok(before > 0, "前置错题应非空");
    // 重练全部错题 → 自动开错题卷
    await page.getByRole("button", { name: /重练全部错题/ }).click();
    await see("错题重练");
    // 答对第一题（数据侧查答案：错题 key j/s/m+id → aiAnswers，oj/os/om+序号 → 官方卷）→ 交卷后该题应移出错题本
    const wb0 = (await store()).wrongBook[0];
    const mo = wb0.id.match(/^(o?)([jsm])(\d+)$/);
    assert.ok(mo, `错题 key 格式异常：${wb0.id}`);
    const qType = mo[2] === "j" ? "judge" : mo[2] === "s" ? "single" : "multi";
    const answer = mo[1]
      ? (qType === "judge" ? mock190.judge : qType === "single" ? mock190.single : mock190.multi).find(
          (x) => x.n === parseInt(mo[3]),
        )?.answer
      : aiAnswers[qType][mo[3]]?.a;
    assert.ok(answer, `未查到第一题答案：${wb0.id}`);
    if (qType === "judge") {
      await page.getByRole("button", { name: answer === "√" ? "正确 √" : "错误 ×" }).click();
    } else {
      for (const letter of answer.split("")) {
        await page
          .locator("div.bg-surface.border", { hasText: "标记疑问" })
          .first()
          .locator("button")
          .filter({ hasText: new RegExp(`^${letter}\\b`) })
          .first()
          .click();
      }
    }
    await page.getByRole("button", { name: "交卷" }).click();
    await see("考试结束");
    await page.waitForTimeout(300);
    const s = await store();
    const after = s.wrongBook?.length ?? 0;
    assert.equal(after, before - 1, `第一题已答对（${wb0.id}=${answer}），应移出错题本：${before}→${after}`);
    assert.ok(!s.wrongBook.some((w) => w.id === wb0.id), "答对的题不应残留在错题本");
    assert.ok(s.wrongBook.every((w) => w.count >= 1), "其余未作答题应原样保留");
  });

  // T9 应用内更新入口：侧边栏入口可见，浏览器预览模式弹窗降级提示（桌面应用才会真正检查）
  await step("T9 检查更新：侧边栏入口 + 弹窗预览模式降级", async () => {
    await nav("首页").click();
    await see("备考总览");
    await page.getByRole("button", { name: /检查更新 · v/ }).click();
    await see("无法完成检查");
    await see("浏览器预览模式不支持更新检查");
    await page.keyboard.press("Escape"); // 错误态允许 Esc 关闭
    await page.getByText("浏览器预览模式不支持更新检查").waitFor({ state: "hidden", timeout: 4000 });
  });

  // T10 官网链接入口：首页考试信息卡两入口 + 报考指南模拟平台行/本机凭据输入框
  await step("T10 官网链接：首页两入口 + 指南页模拟平台行与输入框", async () => {
    await see("官方网站（交大）");
    await see("在线模拟考试平台");
    await nav("报考指南").click();
    await see("官方在线模拟平台");
    await see("打开官方模拟平台");
    const ticket = page.getByPlaceholder("准考证号（仅存本机）");
    const idTail = page.getByPlaceholder("身份证后 6 位（仅存本机）");
    await ticket.fill("2612345678");
    await idTail.fill("ABC123");
    await page.waitForTimeout(200);
    const s = await store();
    assert.equal(s.mockProfile?.ticket, "2612345678", "准考证号应仅存本机 store");
    assert.equal(s.mockProfile?.idTail, "ABC123", "证件后 6 位应仅存本机 store");
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
