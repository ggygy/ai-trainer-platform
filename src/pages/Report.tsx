import { useState } from "react";
import { CircleCheck, TriangleAlert, Download } from "lucide-react";
import { Card, Badge, Btn, Ghost, PageHead, Donut } from "../components/ui";
import { QUESTION_GROUPS } from "../data/content";
import { useStore } from "../lib/store";
export default function Report({ onGo }: { onGo: (p: "exam") => void }) {
  const store = useStore();
  const [expandAll, setExpandAll] = useState(false);
  const done = Object.values(store.practice).filter((p) => p.done).length;
  const total = QUESTION_GROUPS.reduce((n, g) => n + g.titles.length, 0);
  const mockScores = store.history.filter((h) => h.score !== null);
  const avg = mockScores.length ? Math.round(mockScores.reduce((n, h) => n + (h.score ?? 0), 0) / mockScores.length) : 0;

  const exportReport = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      practiceDone: done,
      practiceTotal: total,
      history: store.history,
      wrongBook: store.wrongBook,
      note: "人工智能训练师三级备考平台 · 本地学习数据",
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `备考报告-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex flex-col gap-4.5 p-7 h-full overflow-y-auto">
      <PageHead
        title="成绩报告"
        sub="基于本地练习与模拟考记录生成 · 数据保存在本机"
        right={
          <>
            <Badge tone="muted">{mockScores.length ? `已考 ${mockScores.length} 次` : "尚未开考"}</Badge>
            <Btn onClick={exportReport}>
              <Download size={14} /> 导出报告
            </Btn>
          </>
        }
      />

      <div className="grid grid-cols-[320px_1fr_1fr_1fr] gap-3.5">
        <Card className="flex items-center gap-4">
          <Donut value={avg} />
          <div className="flex flex-col gap-2">
            <div className="text-xs text-ink2">模拟考均分</div>
            <Badge tone={avg >= 60 ? "ok" : "warn"}>{avg ? (avg >= 60 ? "达标 · 及格线 60" : "未达标 · 及格线 60") : "待首考"}</Badge>
            <div className="text-[11px] text-ink3 leading-relaxed">
              {mockScores.length ? `基于 ${mockScores.length} 次模拟考` : "完成一次模拟考试后生成"}
            </div>
          </div>
        </Card>
        <Stat label="实操练习" value={`${done}/${total}`} delta="已完成题数" ok={done >= total * 0.6} />
        <Stat label="模拟考次" value={String(store.history.length)} delta="累计场次" ok={store.history.length > 0} />
        <Stat label="错题待重练" value={String(store.wrongBook.length)} delta="错题本" ok={store.wrongBook.length === 0} />
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        <Card className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="text-[15px] font-semibold text-ink1">各题组练习进度</span>
              <span className="text-[11px] text-ink3">目标：每组 ≥ 70%</span>
            </div>
            <Ghost onClick={() => onGo("exam")}>去刷理论题</Ghost>
          </div>
          <div className="flex-1 flex flex-col justify-between gap-2.5">
            {QUESTION_GROUPS.map((g) => {
              const gDone = g.titles.filter((_, i) => store.practice[`${g.id}-${i}`]?.done).length;
              const pct = Math.round((gDone / g.titles.length) * 100);
              const hot = pct < 70;
              return (
                <div key={g.id} className="flex items-center gap-3">
                  <span className="w-[110px] text-[11px] text-ink2 truncate">
                    {g.id} {g.name}
                  </span>
                  <div className="flex-1 h-2.5 rounded-full bg-surface2 overflow-hidden">
                    <div className={`h-full rounded-full ${hot ? "bg-warn" : "bg-ok"}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                  <span className={`w-8 text-[11px] font-semibold ${hot ? "text-warn" : "text-ink1"}`}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="w-[400px] shrink-0 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[15px] font-semibold text-ink1">错题本</span>
            <Badge tone={store.wrongBook.length ? "bad" : "ok"}>
              {store.wrongBook.length ? `${store.wrongBook.length} 题待重练` : "暂无错题"}
            </Badge>
          </div>
          <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
            {store.wrongBook.length === 0 && (
              <div className="text-xs text-ink3 leading-relaxed">
                暂无错题记录。模拟考交卷后错题会自动收录（内置 AI 参考答案判分）；实操题可在练习页手动标记。
              </div>
            )}
            {(expandAll ? store.wrongBook : store.wrongBook.slice(0, 8)).map((w, i) => (
              <div key={`${w.id}-${i}`} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-surface2">
                <span className="px-1.5 py-0.5 rounded bg-surface text-[10px] font-medium text-ink2 shrink-0">{w.type}</span>
                <span className="flex-1 text-xs text-ink1 truncate">{w.text}</span>
                <span className="text-[10px] text-bad shrink-0">错 {w.count} 次</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2.5 pt-3">
            <Btn primary onClick={() => onGo("exam")} disabled={!store.wrongBook.length}>
              <Download size={13} className="rotate-180" /> 重练全部错题
            </Btn>
            {store.wrongBook.length > 8 && (
              <Ghost onClick={() => setExpandAll((v) => !v)}>{expandAll ? "收起" : `查看全部 ${store.wrongBook.length} 题`}</Ghost>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, delta, ok }: { label: string; value: string; delta: string; ok: boolean }) {
  return (
    <Card>
      <div className="text-xs text-ink2">{label}</div>
      <div className="text-2xl font-bold text-ink1 mt-2 flex items-center gap-2">
        {value}
        {ok ? <CircleCheck size={16} className="text-ok" /> : <TriangleAlert size={16} className="text-warn" />}
      </div>
      <div className="text-[11px] text-ink3 mt-2">{delta}</div>
    </Card>
  );
}
