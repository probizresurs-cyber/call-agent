"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface ManagerOption {
  id: string;
  name: string;
}

export function DiscrepanciesFilters({
  managers,
}: {
  managers?: ManagerOption[];
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();

  const statusParam = search.get("status") || "";
  const managerParam = search.get("manager_id") || "";
  const severityParam = search.get("severity") || "";

  function navigate(overrides: Record<string, string>) {
    const next = {
      status: statusParam,
      manager_id: managerParam,
      severity: severityParam,
      page: "1",
      ...overrides,
    };
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
    }
    startTransition(() =>
      router.push("/discrepancies" + (q.toString() ? `?${q}` : ""))
    );
  }

  function reset() {
    startTransition(() => router.push("/discrepancies"));
  }

  const hasFilters = !!(statusParam || managerParam || severityParam);

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: 16,
      }}
    >
      {/* Status */}
      <select
        className="ds-input"
        value={statusParam}
        onChange={(e) => navigate({ status: e.target.value })}
        disabled={pending}
        style={{
          width: 170,
          background: statusParam
            ? "color-mix(in oklch, var(--primary) 10%, var(--card))"
            : undefined,
          borderColor: statusParam ? "var(--primary)" : undefined,
          color: statusParam ? "var(--primary)" : undefined,
        }}
      >
        <option value="">Все статусы</option>
        <option value="pending">Ожидает</option>
        <option value="accepted">Принято</option>
        <option value="rejected">Отклонено</option>
        <option value="auto_applied">Авто-применено</option>
        <option value="manual_fixed">Исправлено вручную</option>
      </select>

      {/* Severity */}
      <select
        className="ds-input"
        value={severityParam}
        onChange={(e) => navigate({ severity: e.target.value })}
        disabled={pending}
        style={{
          width: 160,
          background: severityParam
            ? "color-mix(in oklch, var(--primary) 10%, var(--card))"
            : undefined,
          borderColor: severityParam ? "var(--primary)" : undefined,
          color: severityParam ? "var(--primary)" : undefined,
        }}
      >
        <option value="">Все важности</option>
        <option value="high">Высокий</option>
        <option value="medium">Средний</option>
        <option value="low">Низкий</option>
      </select>

      {/* Manager */}
      {managers && managers.length > 0 && (
        <select
          className="ds-input"
          value={managerParam}
          onChange={(e) => navigate({ manager_id: e.target.value })}
          disabled={pending}
          style={{
            width: 190,
            background: managerParam
              ? "color-mix(in oklch, var(--primary) 10%, var(--card))"
              : undefined,
            borderColor: managerParam ? "var(--primary)" : undefined,
            color: managerParam ? "var(--primary)" : undefined,
          }}
        >
          <option value="">Все менеджеры</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name || `ID ${m.id}`}
            </option>
          ))}
        </select>
      )}

      {/* Reset */}
      {hasFilters && (
        <button
          type="button"
          className="ds-btn ds-btn-ghost"
          onClick={reset}
          disabled={pending}
          style={{ marginLeft: "auto" }}
        >
          Сбросить фильтры
        </button>
      )}
    </div>
  );
}
