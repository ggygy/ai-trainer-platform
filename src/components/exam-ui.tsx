// 考试相关 UI（选项行等）+ 通用组件再导出
import { Badge, Btn, Card, Chip, Ghost } from "./ui";
export { Badge, Btn, Card, Chip, Ghost };

export function OptionRow({
  letter,
  text,
  selected,
  onClick,
}: {
  letter: string;
  text: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-[10px] border text-left transition-colors ${
        selected ? "bg-accent-soft border-accent" : "bg-surface border-line hover:border-ink3"
      }`}
    >
      <span
        className={`w-[26px] h-[26px] rounded-full flex items-center justify-center text-xs shrink-0 ${
          selected ? "bg-accent text-white font-semibold" : "bg-surface2 text-ink2"
        }`}
      >
        {letter}
      </span>
      <span className={`text-sm leading-relaxed selectable ${selected ? "text-accent-deep font-medium" : "text-ink1"}`}>
        {text}
      </span>
    </button>
  );
}
