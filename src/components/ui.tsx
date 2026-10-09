// 通用 UI 元件（对齐 Pen 视觉稿组件）
import type { ReactNode } from "react";

export function Card({ children, className = "", pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <div
      className={`bg-surface border border-line rounded-[14px] ${pad ? "p-5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHead({ title, right, sub }: { title: ReactNode; right?: ReactNode; sub?: string }) {
  return (
    <div className="flex items-center justify-between mb-3.5">
      <div className="flex items-center gap-2.5">
        <div className="text-[15px] font-semibold text-ink1">{title}</div>
        {sub && <div className="text-[11px] text-ink3">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

type Tone = "ok" | "warn" | "bad" | "accent" | "muted";
const toneMap: Record<Tone, { bg: string; fg: string; dot: string }> = {
  ok: { bg: "bg-ok-soft", fg: "text-ok", dot: "bg-ok" },
  warn: { bg: "bg-warn-soft", fg: "text-warn", dot: "bg-warn" },
  bad: { bg: "bg-bad-soft", fg: "text-bad", dot: "bg-bad" },
  accent: { bg: "bg-accent-soft", fg: "text-accent", dot: "bg-accent" },
  muted: { bg: "bg-surface2", fg: "text-ink2", dot: "bg-ink3" },
};

export function Badge({ tone = "ok", children, dot = true }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  const t = toneMap[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${t.bg} ${t.fg}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />}
      {children}
    </span>
  );
}

export function Chip({ active = false, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-xs transition-colors ${
        active ? "bg-accent text-white font-medium" : "bg-surface2 text-ink2 hover:bg-line"
      }`}
    >
      {children}
    </button>
  );
}

export function Btn({
  primary = false,
  children,
  onClick,
  className = "",
  disabled = false,
  title,
}: {
  primary?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        primary
          ? "bg-accent text-white hover:bg-accent-deep"
          : "bg-surface border border-line text-ink1 hover:border-ink3"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function Ghost({ children, onClick, className = "" }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button onClick={onClick} className={`text-[13px] font-medium text-accent hover:text-accent-deep ${className}`}>
      {children}
    </button>
  );
}

export function Progress({ value, tone = "accent", className = "" }: { value: number; tone?: "accent" | "ok" | "warn"; className?: string }) {
  const color = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : "bg-accent";
  return (
    <div className={`h-1.5 rounded-full bg-surface2 overflow-hidden ${className}`}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function PageHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-xl font-bold text-ink1">{title}</div>
        {sub && <div className="text-xs text-ink3 mt-1">{sub}</div>}
      </div>
      {right && <div className="flex items-center gap-2.5">{right}</div>}
    </div>
  );
}

export function Donut({ value, label = "/100", size = 110 }: { value: number; label?: string; size?: number }) {
  const r = 47;
  const c = 2 * Math.PI * r;
  const filled = (Math.min(100, value) / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
        <circle cx="55" cy="55" r={r} fill="none" stroke="#F1F4F9" strokeWidth="12" />
        <circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke="#2563EB"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold text-ink1">{value}</span>
        <span className="text-[11px] text-ink3 mt-1.5 ml-0.5">{label}</span>
      </div>
    </div>
  );
}
