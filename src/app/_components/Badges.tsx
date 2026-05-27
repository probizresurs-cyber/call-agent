/**
 * Общие визуальные компоненты: статусные бейджи, sentiment-индикатор,
 * иконочные значки. Без эмодзи — всё через lucide-react.
 */
import {
  CheckCircle2,
  XCircle,
  CircleDot,
  Clock,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

export function SentimentBadge({ value }: { value: string | null }) {
  if (!value) return <span style={{ color: "var(--muted-foreground)" }}>—</span>;
  if (value === "positive")
    return (
      <span className="ds-badge ds-badge-success" style={{ paddingLeft: 6 }}>
        <CheckCircle2 size={12} strokeWidth={2.5} />
        Позитив
      </span>
    );
  if (value === "negative")
    return (
      <span className="ds-badge ds-badge-danger" style={{ paddingLeft: 6 }}>
        <XCircle size={12} strokeWidth={2.5} />
        Негатив
      </span>
    );
  return (
    <span className="ds-badge" style={{ paddingLeft: 6 }}>
      <CircleDot size={12} strokeWidth={2.5} />
      Нейтр.
    </span>
  );
}

export function StatusBadge({ value }: { value: string }) {
  if (value === "done")
    return (
      <span className="ds-badge ds-badge-success" style={{ paddingLeft: 6 }}>
        <CheckCircle2 size={12} strokeWidth={2.5} />
        Готово
      </span>
    );
  if (value === "failed")
    return (
      <span className="ds-badge ds-badge-danger" style={{ paddingLeft: 6 }}>
        <AlertTriangle size={12} strokeWidth={2.5} />
        Ошибка
      </span>
    );
  return (
    <span className="ds-badge ds-badge-info" style={{ paddingLeft: 6 }}>
      <Clock size={12} strokeWidth={2.5} />
      {value}
    </span>
  );
}

export function ScoreColor(value: number): string {
  // 0..1 → цвет
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return pct >= 80 ? "var(--success)" : pct >= 40 ? "var(--warning)" : "var(--destructive)";
}

export function IconLabel({
  icon: Icon,
  children,
  size = 14,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  size?: number;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Icon size={size} strokeWidth={2} />
      {children}
    </span>
  );
}
