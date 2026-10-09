import {
  House,
  BookOpen,
  Timer,
  Code,
  TerminalSquare,
  ChartColumn,
  GraduationCap,
  CircleCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type PageId = "home" | "learn" | "exam" | "practical" | "practical-exam" | "env" | "report";

export const NAV: { id: PageId; icon: LucideIcon; label: string }[] = [
  { id: "home", icon: House, label: "首页" },
  { id: "learn", icon: BookOpen, label: "理论学习" },
  { id: "exam", icon: Timer, label: "模拟考试" },
  { id: "practical", icon: Code, label: "实操训练" },
  { id: "env", icon: TerminalSquare, label: "环境助手" },
  { id: "report", icon: ChartColumn, label: "成绩错题" },
];

export default function Sidebar({
  page,
  onNavigate,
  envOk,
  envText,
}: {
  page: PageId;
  onNavigate: (p: PageId) => void;
  envOk: boolean | null;
  envText?: string;
}) {
  return (
    <aside className="w-[232px] shrink-0 h-full bg-surface border-r border-line flex flex-col px-3.5 py-4.5 gap-2">
      <div className="flex items-center gap-2.5 px-1.5 pb-3">
        <div className="w-[34px] h-[34px] rounded-[9px] bg-accent flex items-center justify-center">
          <GraduationCap size={19} className="text-white" />
        </div>
        <div>
          <div className="text-[13px] font-bold text-ink1">训练师备考平台</div>
          <div className="text-[10px] text-ink3">人工智能训练师 · 三级</div>
        </div>
      </div>
      <div className="h-px bg-line mx-0.5" />
      <nav className="flex flex-col gap-1 mt-1">
        {NAV.map(({ id, icon: Icon, label }) => {
          const active = page === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-[13px] transition-colors ${
                active ? "bg-accent-soft text-accent-deep font-medium" : "text-ink2 hover:bg-surface2"
              }`}
            >
              <Icon size={18} className={active ? "text-accent" : "text-ink3"} />
              {label}
            </button>
          );
        })}
      </nav>
      <div className="flex-1" />
      <div className="h-px bg-line mx-0.5" />
      {envText && (
        <div className="flex items-center gap-1.5 px-1 mt-1.5">
          {envOk === true && <CircleCheck size={13} className="text-ok" />}
          {envOk === false && <span className="w-2 h-2 rounded-full bg-warn inline-block" />}
          {envOk === null && <span className="w-2 h-2 rounded-full bg-ink3 inline-block" />}
          <span className="text-[11px] text-ink3 truncate">{envText}</span>
        </div>
      )}
      <div className="flex items-center gap-2.5 px-1.5 py-1">
        <div className="w-[30px] h-[30px] rounded-full bg-accent-soft flex items-center justify-center text-[12px] font-medium text-accent">
          训
        </div>
        <div>
          <div className="text-xs font-medium text-ink1">备考学员</div>
          <div className="text-[10px] text-ink3">准考证 2609211301</div>
        </div>
      </div>
    </aside>
  );
}
