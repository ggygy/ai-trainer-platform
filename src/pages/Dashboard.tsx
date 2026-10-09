import { Play, BookOpen, Timer, ArrowRight, CircleCheck, TriangleAlert, Info } from "lucide-react";
import { Card, CardHead, Badge, Btn, Ghost, PageHead } from "../components/ui";
import { EXAM_INFO, QUESTION_GROUPS } from "../data/content";
import { useStore } from "../lib/store";
import type { PageId } from "../components/Sidebar";

export default function Dashboard({ go, env }: { go: (p: PageId) => void; env: { ok: boolean; missing: number } | null }) {
  const store = useStore();
  const practiceDone = Object.values(store.practice).filter((p) => p.done).length;
  const totalQ = QUESTION_GROUPS.reduce((n, g) => n + g.titles.length, 0);

  // —— 以下全部由 store 真实推导 ——
  const today = new Date().toISOString().slice(0, 10);
  const doneMap = store.theoryDone ?? {};
  const theoryCount = Object.keys(doneMap).length;

  // 连续学习：theoryDone 日期 ∪ 实操练习日期 ∪ 模考日期，从今天（或昨天）往前数连续天数
  const days = new Set<string>([...Object.values(doneMap), ...store.history.map((h) => h.date)]);
  for (const p of Object.values(store.practice)) if (p.lastAt) days.add(p.lastAt);
  let streak = 0;
  const cur = new Date();
  if (!days.has(today)) cur.setDate(cur.getDate() - 1); // 今天还没学不打断已有连续
  while (days.has(cur.toISOString().slice(0, 10))) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  const totalMin = store.history.reduce((n, h) => n + (h.minutes ?? 0), 0);

  const daysToExam = Math.ceil((new Date(EXAM_INFO.examDate + "T00:00:00").getTime() - Date.now()) / 86400000);

  // 今日任务：今日刷题 5 道 / 实操 1 题 / 模考 1 次 / 错题清零
  const todayTheory = Object.values(doneMap).filter((d) => d === today).length;
  const todayPractical = Object.values(store.practice).filter((p) => p.done && p.lastAt === today).length;
  const todayExam = store.history.filter((h) => h.date === today).length;
  const wrongN = store.wrongBook.length;
  const tasks = [
    { text: `理论刷题 ${Math.min(todayTheory, 5)}/5 道`, done: todayTheory >= 5, tag: "刷题" },
    { text: `实操练习 1 题${todayPractical ? " · 已完成" : ""}`, done: todayPractical >= 1, tag: "实操" },
    { text: `模拟考试 1 次${todayExam ? " · 已完成" : ""}`, done: todayExam >= 1, tag: "模考" },
    { text: wrongN ? `复盘错题 · 待强化 ${wrongN} 道` : "错题本已清空", done: wrongN === 0, tag: "错题" },
  ];

  const stats = [
    { label: "理论刷题", value: String(theoryCount), delta: `/900 题 · 答过即计入` },
    { label: "实操练习", value: `${practiceDone}/${totalQ}`, delta: "已覆盖 8 个题组" },
    { label: "模拟考次", value: String(store.history.length), delta: store.history.length ? `最近 ${store.history[store.history.length - 1].date}` : "尚未开考" },
    { label: "连续学习", value: `${streak} 天`, delta: totalMin ? `累计模考 ${Math.round(totalMin)} 分钟` : "刷题/模考后开始累计" },
  ];
  // 成绩趋势取真实考试历史（最多最近 4 次）；无记录时展示空状态
  const hist = store.history.slice(-4);
  const bars = hist.map((h, i) => ({
    label: i === hist.length - 1 ? "最新" : `第 ${store.history.length - hist.length + i + 1} 次`,
    v: h.score ?? 0,
    hot: i === hist.length - 1,
  }));

  return (
    <div className="flex flex-col gap-5 p-7 h-full overflow-y-auto">
      <PageHead
        title="备考总览"
        sub={daysToExam > 0 ? `距下次考试还有 ${daysToExam} 天 · 建议每天保持 2 小时练习` : "考试日已到，保持好状态"}
        right={
          <>
            <Badge tone="muted">{EXAM_INFO.examDate} 考试</Badge>
            <Btn onClick={() => go("env")}>环境检测</Btn>
            <Btn primary onClick={() => go("exam")}>
              <Timer size={14} /> 开始模拟考试
            </Btn>
          </>
        }
      />

      <div className="grid grid-cols-4 gap-3.5">
        {stats.map((s) => (
          <Card key={s.label} className="!p-[18px]">
            <div className="text-xs text-ink2">{s.label}</div>
            <div className="text-[26px] font-bold text-ink1 mt-2 leading-none">{s.value}</div>
            <div className="text-[11px] text-ink3 mt-2">{s.delta}</div>
          </Card>
        ))}
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <Card>
            <CardHead title="今日任务" right={<Badge tone="muted">{`${tasks.filter((t) => t.done).length}/${tasks.length} 完成`}</Badge>} />
            <div className="flex flex-col gap-1.5">
              {tasks.map((t) => (
                <div key={t.text} className="flex items-center gap-3 px-1 py-2">
                  <span
                    className={`w-[18px] h-[18px] rounded-full shrink-0 flex items-center justify-center ${
                      t.done ? "bg-accent" : "border-[1.5px] border-line bg-surface"
                    }`}
                  >
                    {t.done && <CircleCheck size={11} className="text-white" />}
                  </span>
                  <span className={`flex-1 text-[13px] truncate ${t.done ? "text-ink3 line-through" : "text-ink1"}`}>
                    {t.text}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface2 text-ink2">{t.tag}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex-1">
            <CardHead title="模拟考试成绩趋势" right={<Ghost onClick={() => go("report")}>查看报告</Ghost>} />
            {bars.length === 0 ? (
              <div className="h-[calc(100%-40px)] min-h-[140px] flex flex-col items-center justify-center gap-2 text-ink3">
                <Info size={18} />
                <div className="text-xs">还没有模考成绩，从一张官方全真卷开始吧</div>
                <Ghost onClick={() => go("exam")}>去考试</Ghost>
              </div>
            ) : (
              <div className="flex items-end gap-5 h-[calc(100%-40px)] min-h-[140px] px-3 pb-1">
                {bars.map((b) => (
                  <div key={b.label} className="flex-1 flex flex-col items-center justify-end gap-2 h-full">
                    <div className="text-xs font-semibold text-ink1">{b.v}</div>
                    <div
                      className={`w-11 rounded-t-md rounded-b-sm ${b.hot ? "bg-accent" : "bg-accent-soft"}`}
                      style={{ height: `${Math.max(b.v * 1.4, 4)}px` }}
                    />
                    <div className="text-[11px] text-ink3">{b.label}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="w-[340px] shrink-0 flex flex-col gap-4">
          <Card className="!bg-accent !border-accent">
            <div className="text-[15px] font-semibold text-white mb-3.5">快速开始</div>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => go("exam")}
                className="w-full py-3 rounded-lg bg-surface text-accent text-sm font-semibold flex items-center justify-center gap-2 hover:bg-accent-soft"
              >
                <Play size={15} /> 开始模拟考试
              </button>
              <button
                onClick={() => go("learn")}
                className="w-full py-2.5 rounded-lg border border-white/35 text-white text-[13px] font-medium flex items-center justify-center gap-2 hover:bg-white/10"
              >
                <BookOpen size={14} /> 继续学习 · 数据清洗与标注
              </button>
              <button
                onClick={() => go("env")}
                className="w-full flex items-center justify-center gap-1.5 py-1 text-xs text-white/80 hover:text-white"
              >
                打开环境助手 <ArrowRight size={13} />
              </button>
            </div>
          </Card>

          <Card>
            <CardHead title="考试信息" />
            <div className="flex flex-col gap-2.5">
              {[
                ["实操考核", `${EXAM_INFO.practical.minutes} 分钟 · 题库抽题`],
                ["理论机考", `${EXAM_INFO.theory.minutes} 分钟 · 190 题`],
                ["及格线", `双科均 ${EXAM_INFO.passLine} 分`],
                ["题库覆盖", "理论 900 + 实操 40 题"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-xs text-ink3">{k}</span>
                  <span className="text-xs font-medium text-ink1">{v}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex-1">
            <CardHead
              title="运行环境"
              right={
                env === null ? (
                  <Badge tone="muted">检测中</Badge>
                ) : env.ok ? (
                  <Badge>环境就绪</Badge>
                ) : (
                  <Badge tone="warn">{env.missing} 项待安装</Badge>
                )
              }
            />
            <div className="flex flex-col gap-2.5">
              {env === null && <div className="text-xs text-ink3 flex items-center gap-2"><Info size={14} /> 正在检测本机环境…</div>}
              {env !== null && (
                <>
                  <EnvRow ok label="Python 运行时" status="已安装" />
                  <EnvRow ok label="Jupyter Notebook" status={env.ok ? "已连接" : "未就绪"} />
                  <EnvRow ok={!env.ok} warnLabel label="AI 依赖包" status={env.ok ? "全部就绪" : `${env.missing} 项缺失`} />
                  <Btn className="w-full !justify-center mt-1" onClick={() => go("env")}>
                    一键检测安装
                  </Btn>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function EnvRow({ ok, label, status, warnLabel = false }: { ok: boolean; label: string; status: string; warnLabel?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {ok ? (
          <CircleCheck size={15} className="text-ok" />
        ) : (
          <TriangleAlert size={15} className="text-warn" />
        )}
        <span className={`text-[13px] ${warnLabel && !ok ? "text-warn" : "text-ink1"}`}>{label}</span>
      </div>
      <span className="text-xs text-ink3">{status}</span>
    </div>
  );
}
