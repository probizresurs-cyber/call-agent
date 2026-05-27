"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReprocessButton({ callId }: { callId: number }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function go() {
    setBusy(true);
    try {
      const r = await fetch(`/call-agent/api/calls/${callId}/process`, { method: "POST" });
      const data = await r.json();
      if (!data.ok) alert("Ошибка: " + data.error);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={go} disabled={busy} className="ds-btn ds-btn-primary">
      {busy ? <span className="spinner" /> : null}
      Перезапустить обработку
    </button>
  );
}
