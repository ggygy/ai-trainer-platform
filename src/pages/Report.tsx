import { useEffect, useState } from "react";
import { ChevronDown, CircleCheck, TriangleAlert, Download, RotateCw, X } from "lucide-react";
import { Card, CardHead, Badge, Btn, Ghost, PageHead, Donut } from "../components/ui";
import ExamReview, { ReviewQuestion, type ReviewItem } from "../components/ExamReview";
import { QUESTION_GROUPS } from "../data/content";
import type { ExamMode } from "../lib/api";
import { isCorrect, resolveQuestion } from "../lib/questions";
import { useStore } from "../lib/store";

const MODE_LABEL: Record<ExamMode, string> = { normal: "模拟练习", official: "官方全真卷", wrong: "错题重练" };
const MODE_TONE: Record<ExamMode, "accent" | "ok" | "warn"> = { normal: "accent", official: "ok", wrong: "warn" };

export default function Report({
  onGo,
  onWrongPractice,
  onOpenLesson,
}: {
  onGo: (p: "exam") => void;
  onWrongPractice: () => void;
  onOpenLesson?: (code: string) => void;
}) {
  const store = useStore();
  const [expandAll, setExpandAll] = useState(false);
  const [openWrong, setOpenWrong] = useState<string | null>(null); // 展开中的错题 key
  const [showAllExams, setShowAllExams] = useState(false);
  const [reviewIdx, setReviewIdx] = useState<number | null>(null); // 回看中的历史场次（history 下标）
  const done = Object.values(store.practice).filter((p) => p.done).length;
  const total = QUESTION_GROUPS.reduce((n, g) => n + g.titles.length, 0);
  const mockScores = store.history.filter((h) => h.score !== null);
  const avg = mockScores.length ? Math.round(mockScores.reduce((n, h) => n + (h.score ?? 0), 0) / mockScores.length) : 0;
  // 最近在前；保留原下标用于回看
  const exams = store.history.map((h, i) => ({ h, i })).reverse();

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
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span className="text-[15px] font-semibold text-ink1">各题组练习进度</span>
                <span className="text-[11px] text-ink3">目标：每组 ≥ 70%</span>
              </div>
              <Ghost onClick={() => onGo("exam")}>去刷理论题</Ghost>
            </div>
            <div className="flex flex-col gap-2.5">
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

          <Card>
            <CardHead
              title="模拟考记录"
              sub={store.history.length ? `共 ${store.history.length} 场 · 最近在前 · 点「查看回顾」逐题看对错与答案` : undefined}
              right={<Ghost onClick={() => onGo("exam")}>再考一场</Ghost>}
            />
            {store.history.length === 0 && (
              <div className="text-xs text-ink3 leading-relaxed">尚未参加模拟考试。交卷后这里会列出每一场，可随时回看每题的作答、正确答案与所属考点。</div>
            )}
            <div className="flex flex-col gap-2">
              {(showAllExams ? exams : exams.slice(0, 6)).map(({ h, i }) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface2">
                  <span className="text-xs text-ink2 w-[80px] shrink-0">{h.date}</span>
                  <Badge tone={h.detail ? MODE_TONE[h.detail.mode] : "muted"} dot={false}>
                    {h.detail ? MODE_LABEL[h.detail.mode] : "模拟考"}
                  </Badge>
                  <span className={`text-sm font-bold w-9 ${h.score !== null && h.score >= 60 ? "text-ok" : "text-ink1"}`}>{h.score ?? "--"}</span>
                  <span className="flex-1 text-[11px] text-ink3 truncate">
                    {h.detail ? `答对 ${h.detail.correct}/${h.detail.total}` : "旧版本记录，无逐题数据"} · 用时 {h.minutes} 分钟
                  </span>
                  {h.detail ? <Ghost onClick={() => setReviewIdx(i)}>查看回顾</Ghost> : <span className="text-[11px] text-ink3">无回顾</span>}
                </div>
              ))}
            </div>
            {exams.length > 6 && (
              <div className="flex justify-center pt-3">
                <Ghost onClick={() => setShowAllExams((v) => !v)}>{showAllExams ? "收起" : `查看全部 ${exams.length} 场`}</Ghost>
              </div>
            )}
          </Card>
        </div>

        <Card className="w-[440px] shrink-0 flex flex-col">
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
            {store.wrongBook.length > 0 && <div className="text-[11px] text-ink3">点任意一题展开：完整题干、正确答案与所属考点</div>}
            {(expandAll ? store.wrongBook : store.wrongBook.slice(0, 8)).map((w, i) => {
              const open = openWrong === w.id;
              const q = open ? resolveQuestion(store, w.id) : null;
              return (
                <div key={`${w.id}-${i}`} className="rounded-lg bg-surface2">
                  <button
                    onClick={() => setOpenWrong(open ? null : w.id)}
                    title={open ? "收起" : "展开查看答案"}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left"
                  >
                    <span className="px-1.5 py-0.5 rounded bg-surface text-[10px] font-medium text-ink2 shrink-0">{w.type}</span>
                    <span className="flex-1 text-xs text-ink1 truncate">{w.text}</span>
                    <span className="text-[10px] text-bad shrink-0">错 {w.count} 次</span>
                    <ChevronDown size={13} className={`text-ink3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <div className="px-2 pb-2">
                      {q ? (
                        <ReviewQuestion q={q} onOpenLesson={onOpenLesson} />
                      ) : (
                        <div className="px-2 py-2 text-[11px] text-ink3">该题已不在当前题库中，无法展示详情。</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-2.5 pt-3">
            <Btn primary onClick={onWrongPractice} disabled={!store.wrongBook.length}>
              <RotateCw size={13} /> 重练全部错题
            </Btn>
            {store.wrongBook.length > 8 && (
              <Ghost onClick={() => setExpandAll((v) => !v)}>{expandAll ? "收起" : `查看全部 ${store.wrongBook.length} 题`}</Ghost>
            )}
          </div>
        </Card>
      </div>

      {reviewIdx !== null && store.history[reviewIdx]?.detail && (
        <ReviewModal
          idx={reviewIdx}
          onClose={() => setReviewIdx(null)}
          onOpenLesson={
            onOpenLesson &&
            ((code) => {
              setReviewIdx(null);
              onOpenLesson(code);
            })
          }
        />
      )}
    </div>
  );
}

/** 历史场次逐题回看：按 detail 里的 key 从题库还原题面，按当前参考答案重新判定（后续导入官方答案也会反映） */
function ReviewModal({ idx, onClose, onOpenLesson }: { idx: number; onClose: () => void; onOpenLesson?: (code: string) => void }) {
  const store = useStore();
  const h = store.history[idx];
  const d = h.detail!;
  const items: ReviewItem[] = [];
  for (const k of d.keys) {
    const q = resolveQuestion(store, k);
    if (!q) continue;
    const picked = d.answers[k] ?? [];
    items.push({ q, picked, ok: isCorrect(q.answer, picked), marked: d.marked?.includes(k) });
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-surface rounded-[14px] w-full max-w-[1100px] max-h-full flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-line">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[15px] font-semibold text-ink1">{MODE_LABEL[d.mode]}</span>
            <Badge tone={MODE_TONE[d.mode]} dot={false}>
              {h.date}
            </Badge>
            <span className="text-xs text-ink2">
              得分 <b className="text-ink1">{h.score ?? "--"}</b> · 答对 {d.correct}/{d.total} · 用时 {h.minutes} 分钟
            </span>
            {items.length < d.keys.length && <span className="text-[11px] text-ink3">（{d.keys.length - items.length} 题已不在题库，未显示）</span>}
          </div>
          <Btn onClick={onClose}>
            <X size={14} /> 关闭
          </Btn>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          <ExamReview items={items} onOpenLesson={onOpenLesson} />
        </div>
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
