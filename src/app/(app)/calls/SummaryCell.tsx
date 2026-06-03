"use client";

/**
 * Ячейка «Итог» в /calls — клик переключает между collapsed (3 строки)
 * и expanded (полный текст). Состояние per-row в локальном useState.
 */
import { useState } from "react";

interface Props {
  summary: string | null;
  nextAction: string | null;
}

export function SummaryCell({ summary, nextAction }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!summary && !nextAction) {
    return <span style={{ color: "var(--muted-foreground)" }}>—</span>;
  }

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      title={expanded ? "Свернуть" : "Кликните чтобы раскрыть полностью"}
      style={{
        cursor: "pointer",
        userSelect: expanded ? "text" : "none",
      }}
    >
      {summary && (
        <div style={{
          display: "-webkit-box",
          WebkitLineClamp: expanded ? "unset" : 3,
          WebkitBoxOrient: "vertical",
          overflow: expanded ? "visible" : "hidden",
          lineHeight: 1.4,
          fontSize: 13,
          wordBreak: "break-word",
          marginBottom: nextAction ? 6 : 0,
        } as React.CSSProperties}>
          {summary}
        </div>
      )}
      {nextAction && (
        <div style={{
          display: "-webkit-box",
          WebkitLineClamp: expanded ? "unset" : 2,
          WebkitBoxOrient: "vertical",
          overflow: expanded ? "visible" : "hidden",
          fontSize: 12,
          lineHeight: 1.4,
          color: "var(--muted-foreground)",
          wordBreak: "break-word",
        } as React.CSSProperties}>
          <b style={{ color: "var(--primary)" }}>След. шаг:</b> {nextAction}
        </div>
      )}
    </div>
  );
}
