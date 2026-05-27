"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/call-agent/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, password }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error || "Ошибка входа");
      return;
    }
    startTransition(() => router.replace("/dashboard"));
  }

  return (
    <div style={{
      minHeight: "100vh", display: "grid", placeItems: "center",
      background: "linear-gradient(160deg,#f5f3ff 0%,#eef0ff 100%)",
    }}>
      <form onSubmit={submit} className="ds-card" style={{ width: 360, padding: 28 }}>
        <h1 className="ds-h2" style={{ marginBottom: 4 }}>Call-Agent</h1>
        <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 20 }}>
          Анализатор звонков Битрикс24
        </div>

        <label className="ds-caption" style={{ display: "block", marginBottom: 6 }}>Логин</label>
        <input
          className="ds-input"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          autoFocus
          required
        />

        <label className="ds-caption" style={{ display: "block", marginTop: 14, marginBottom: 6 }}>Пароль</label>
        <input
          className="ds-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && (
          <div style={{
            marginTop: 14, padding: "8px 12px",
            background: "rgba(212,67,67,0.10)",
            color: "var(--destructive)",
            borderRadius: 6, fontSize: 13,
          }}>{error}</div>
        )}

        <button type="submit" className="ds-btn ds-btn-primary" style={{ width: "100%", marginTop: 20 }} disabled={pending}>
          {pending ? <span className="spinner" /> : null}
          Войти
        </button>
      </form>
    </div>
  );
}
