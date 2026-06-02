"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Save, X, Loader2, ShieldCheck, User as UserIcon, Headphones, Users } from "lucide-react";

type Role = "owner" | "admin" | "head" | "manager";

interface User {
  id: number;
  login: string;
  role: Role;
  name: string | null;
  email: string | null;
  is_active: number;
  bitrix_manager_id: string | null;
  bitrix_manager_name: string | null;
  updated_at: string;
}

interface BitrixManager { id: string; name: string }

const ROLE_LABELS: Record<Role, string> = {
  owner: "Владелец",
  admin: "Администратор",
  head: "Руководитель отдела",
  manager: "Менеджер",
};

const ROLE_ICONS: Record<Role, typeof UserIcon> = {
  owner: ShieldCheck,
  admin: ShieldCheck,
  head: Headphones,
  manager: UserIcon,
};

export function UsersCard() {
  const [users, setUsers] = useState<User[]>([]);
  const [managers, setManagers] = useState<BitrixManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const router = useRouter();

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    setLoading(true);
    try {
      const [u, m] = await Promise.all([
        fetch("/call-agent/api/users").then(r => r.json()),
        fetch("/call-agent/api/managers").then(r => r.json()),
      ]);
      if (u.ok) setUsers(u.items);
      if (m.ok) setManagers(m.items);
    } finally {
      setLoading(false);
    }
  }

  async function remove(user: User) {
    if (!confirm(`Удалить пользователя «${user.login}»? Его сессии будут завершены, данные сохранятся.`)) return;
    await fetch(`/call-agent/api/users/${user.id}`, { method: "DELETE" });
    void refresh();
  }

  if (editing) {
    return (
      <UserEditor
        initial={editing === "new" ? null : editing}
        managers={managers}
        onSave={() => { setEditing(null); void refresh(); router.refresh(); }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  if (loading) return <div className="ds-body-sm">Загрузка…</div>;

  return (
    <>
      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 12 }}>
        Управление доступом к платформе. Каждому менеджеру можно создать аккаунт и привязать его
        к Bitrix-менеджеру — тогда он будет видеть только свои звонки в личном кабинете.
      </p>

      {users.length === 0 ? (
        <div className="ds-body-sm" style={{ textAlign: "center", color: "var(--muted-foreground)", padding: 16 }}>
          Нет пользователей. Создайте первого.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {users.map((u) => {
            const Icon = ROLE_ICONS[u.role];
            return (
              <div key={u.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px",
                background: u.is_active ? "var(--card)" : "var(--muted)",
                opacity: u.is_active ? 1 : 0.55,
                border: "1px solid var(--border)",
                borderRadius: 6,
              }}>
                <Icon size={16} strokeWidth={2} color="var(--muted-foreground)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                    {u.name || u.login}
                    <span className="ds-badge ds-badge-info">{ROLE_LABELS[u.role]}</span>
                    {!u.is_active && <span className="ds-badge">отключён</span>}
                  </div>
                  <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12, marginTop: 2 }}>
                    {u.login}
                    {u.bitrix_manager_name && ` · Bitrix: ${u.bitrix_manager_name}`}
                  </div>
                </div>
                <button type="button" className="ds-btn ds-btn-secondary"
                  onClick={() => setEditing(u)} style={{ width: 36, padding: 0 }}>
                  <Pencil size={14} />
                </button>
                <button type="button" className="ds-btn ds-btn-ghost"
                  onClick={() => remove(u)} style={{ width: 36, padding: 0, color: "var(--destructive)" }}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button type="button" className="ds-btn ds-btn-primary" onClick={() => setEditing("new")}>
        <Plus size={14} /> Добавить пользователя
      </button>
    </>
  );
}

function UserEditor({ initial, managers, onSave, onCancel }: {
  initial: User | null;
  managers: BitrixManager[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const [login, setLogin] = useState(initial?.login || "");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(initial?.name || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [role, setRole] = useState<Role>(initial?.role || "manager");
  const [bxId, setBxId] = useState(initial?.bitrix_manager_id || "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!login.trim()) { alert("Логин обязателен"); return; }
    if (!initial && password.length < 6) { alert("Пароль минимум 6 символов"); return; }
    if (initial && password && password.length < 6) { alert("Пароль минимум 6 символов"); return; }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        login: login.trim(), role,
        name: name.trim() || null, email: email.trim() || null,
        bitrix_manager_id: bxId || null,
      };
      if (password) body.password = password;
      if (initial) {
        await fetch(`/call-agent/api/users/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch("/call-agent/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      onSave();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label className="ds-caption" style={{ display: "block", marginBottom: 4 }}>Логин (email)</label>
          <input className="ds-input" value={login} onChange={(e) => setLogin(e.target.value)}
            placeholder="manager@orlink.ru" autoFocus={!initial} disabled={!!initial} />
          {initial && <div className="ds-body-sm" style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>Логин нельзя менять</div>}
        </div>
        <div>
          <label className="ds-caption" style={{ display: "block", marginBottom: 4 }}>
            {initial ? "Новый пароль (пусто = не менять)" : "Пароль (минимум 6)"}
          </label>
          <input type="password" className="ds-input" value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={initial ? "оставьте пустым" : "минимум 6 символов"} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label className="ds-caption" style={{ display: "block", marginBottom: 4 }}>ФИО</label>
          <input className="ds-input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Иван Иванов" />
        </div>
        <div>
          <label className="ds-caption" style={{ display: "block", marginBottom: 4 }}>Email (необязательно)</label>
          <input className="ds-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label className="ds-caption" style={{ display: "block", marginBottom: 4 }}>Роль</label>
          <select className="ds-input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="manager">Менеджер — видит только свои звонки</option>
            <option value="head">Руководитель отдела — видит всю команду</option>
            <option value="admin">Администратор — управляет настройками</option>
            <option value="owner">Владелец — полный доступ</option>
          </select>
        </div>
        <div>
          <label className="ds-caption" style={{ display: "block", marginBottom: 4 }}>
            Привязка к Bitrix-менеджеру (для роли «Менеджер»)
          </label>
          <select className="ds-input" value={bxId} onChange={(e) => setBxId(e.target.value)}>
            <option value="">— не привязан —</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>{m.name || `ID ${m.id}`}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
        <b>Менеджер</b> видит в своём кабинете только звонки где он указан как ответственный в Битриксе
        (по привязке выше). <b>Руководитель</b> и выше видят все звонки команды.
      </p>

      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button type="button" className="ds-btn ds-btn-primary" onClick={save} disabled={busy}>
          {busy ? <Loader2 size={14} className="mr-spin" /> : <Save size={14} />} Сохранить
        </button>
        <button type="button" className="ds-btn ds-btn-secondary" onClick={onCancel} disabled={busy}>
          <X size={14} /> Отмена
        </button>
      </div>
    </div>
  );
}
