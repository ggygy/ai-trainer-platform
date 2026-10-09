import { ArrowRight, Shuffle, Info } from "lucide-react";
import { Card, Badge, Btn, Ghost, PageHead, Progress } from "../components/ui";
import { QUESTION_GROUPS, type QuestionGroup } from "../data/content";
import { useStore } from "../lib/store";

export default function PracticalTrain({ openQ }: { openQ: (groupId: string, idx: number) => void }) {
  const store = useStore();
  const done = Object.values(store.practice).filter((p) => p.done).length;
  const total = QUESTION_GROUPS.reduce((n, g) => n + g.titles.length, 0);

  const openQuestion = (g: QuestionGroup, idx: number) => {
    openQ(g.id, idx);
  };

  return (
    <div className="flex flex-col gap-4.5 p-7 h-full overflow-y-auto">
      <PageHead
        title="实操训练"
        sub="官方 40 题原题库 · 按题组抽题练习 · 完全对齐真实考试规则"
        right={
          <>
            <Badge tone="muted">总进度 {done}/{total} 题</Badge>
            <Btn primary onClick={() => openQuestion(QUESTION_GROUPS[Math.floor(Math.random() * 8)], Math.floor(Math.random() * 5))}>
              <Shuffle size={14} /> 随机抽题模拟考
            </Btn>
          </>
        }
      />

      <div className="flex items-center gap-3 px-4 py-3 rounded-[10px] bg-accent-soft">
        <Info size={16} className="text-accent shrink-0" />
        <div className="text-xs leading-relaxed text-accent-deep">
          实操考核 120 分钟，从 8 个题组共 40 题中抽取作答（最多 4 个代码题 + Excel 操作），与理论机考双科均达 60 分即可拿证。练习时点击题目会自动在素材目录启动 Jupyter。
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3.5 flex-1">
        {QUESTION_GROUPS.map((g) => {
          const gDone = g.titles.filter((_, i) => store.practice[`${g.id}-${i}`]?.done).length;
          const pct = (gDone / g.titles.length) * 100;
          return (
            <Card key={g.id} className="flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span className="px-2.5 py-1 rounded-md bg-accent-soft text-accent text-[13px] font-bold">{g.id}</span>
                <span className="px-2 py-0.5 rounded-md bg-surface2 text-ink2 text-[10px] font-medium">{g.score}</span>
              </div>
              <div className="text-sm font-semibold text-ink1 leading-snug">{g.name}</div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px] text-ink3">{g.rule}</span>
                <span className="px-2 py-0.5 rounded-full bg-surface2 text-ink2 text-[10px] font-medium">{g.form}</span>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-ink3">练习进度</span>
                  <span className={`text-[11px] font-semibold ${pct === 100 ? "text-ok" : "text-ink1"}`}>
                    {gDone}/{g.titles.length}
                  </span>
                </div>
                <Progress value={pct} tone={pct === 100 ? "ok" : "accent"} />
              </div>
              <div className="mt-auto pt-3 flex justify-between items-end">
                <span className="text-[10px] text-ink3 leading-tight">{g.titles[0].slice(0, 14)}…</span>
                <Ghost onClick={() => openQuestion(g, 0)}>
                  开始练习 <ArrowRight size={12} className="inline" />
                </Ghost>
              </div>
              <div className="mt-2 flex gap-1">
                {g.titles.map((t, i) => (
                  <button
                    key={i}
                    title={t}
                    onClick={() => openQuestion(g, i)}
                    className={`flex-1 h-1.5 rounded-full ${store.practice[`${g.id}-${i}`]?.done ? "bg-ok" : "bg-surface2 hover:bg-line"}`}
                  />
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
