"use client";

import { useEffect } from "react";

export function PublicDashboardAutoRefresh({ intervalSec }: { intervalSec: number }) {
  useEffect(() => {
    const t = setInterval(() => window.location.reload(), intervalSec * 1000);
    return () => clearInterval(t);
  }, [intervalSec]);
  return null;
}
