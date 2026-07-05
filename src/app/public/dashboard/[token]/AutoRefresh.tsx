"use client";

import { useEffect } from "react";

/**
 * Автообновление публичного дашборда/ТВ-табло + (опц.) трекер захода.
 * token+kind заданы → при монтировании пингуем /api/public/report-view,
 * чтобы ТВ-заходы тоже попадали в журнал владельца (троттлинг на сервере).
 */
export function PublicDashboardAutoRefresh({
  intervalSec,
  token,
  kind = "dashboard",
}: {
  intervalSec: number;
  token?: string;
  kind?: "dashboard" | "tv";
}) {
  useEffect(() => {
    const t = setInterval(() => window.location.reload(), intervalSec * 1000);
    return () => clearInterval(t);
  }, [intervalSec]);

  useEffect(() => {
    if (!token) return;
    fetch("/call-agent/api/public/report-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, kind }),
      keepalive: true,
    }).catch(() => {});
  }, [token, kind]);

  return null;
}
