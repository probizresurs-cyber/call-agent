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
        display: "-webkit-box",
        WebkitLineClamp: expanded ? "unset" : 3,
        WebkitBoxOrient: "vertical",
        overflow: expanded ? "visible" : "hidden",
        lineHeight: 1.4,
        fontSize: 13,
        wordBreak: "break-word",
        cursor: "pointer",
        userSelect: expanded ? "text" : "none",
      } as React.CSSProperties}
    >
      {summary && <span>{summary}</span>}
      {nextAction && (
        <span style={{ color: "var(--muted-foreground)" }}>
          {summary ? " · " : ""}
          <b>След. шаг:</b> {nextAction}
        </span>
      )}
    </div>
  );
}
