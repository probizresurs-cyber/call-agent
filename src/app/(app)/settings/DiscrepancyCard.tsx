"use client";

/**
 * Карточка настроек модуля «Сравнение с CRM-карточкой».
 * AI сравнивает транскрипт звонка с тем, что менеджер внёс в карточку Bitrix,
 * и подсвечивает расхождения. Кому отправлять, в каком режиме и какие поля
 * проверять — настраивается здесь.
 *
 * Видно только owner/admin/head.
 */
import { useState } from "react";
import {
  Scale,
  User as UserIcon,
  Users as UsersIcon,
  Loader2,
  Check,
  AlertTriangle,
  Hand,
  Wand2,
} from "lucide-react";

type RecipientMode = "manager" | "admins";
type ActionMode = "manual" | "auto_approve";
type Severity = "low" | "medium" | "high";

export interface DiscrepancyInitial {
  enabled: boolean;
  recipientMode: RecipientMode;
  adminUserIds: number[];
  actionMode: ActionMode;
  customFields: string[] | null;
  severityMin: Severity;
}

export interface RecipientUser {
  id: number;
  login: string;
  role: "owner" | "admin" | "head";
  name: string | null;
}

const ROLE_LABELS: Record<RecipientUser["role"], string> = {
  owner: "Владелец",
  admin: "Администратор",
  head: "Руководитель отдела",
};

const SEVERITY_LABELS: Record<Severity, string> = {
  low: "Низкая — показывать все мелочи",
  medium: "Средняя — пропускать незначительные",
  high: "Высокая — только критичные",
};

export function DiscrepancyCard({
  initial,
  recipients,
}: {
  initial: DiscrepancyInitial;
  recipients: RecipientUser[];
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [recipientMode, setRecipientMode] = useState<RecipientMode>(initial.recipientMode);
  const [adminUserIds, setAdminUserIds] = useState<number[]>(initial.adminUserIds);
  const [actionMode, setActionMode] = useState<ActionMode>(initial.actionMode);
  const [customFieldsText, setCustomFieldsText] = useState<string>(
    (initial.customFields ?? []).join(", ")
  );
  const [severityMin, setSeverityMin] = useState<Severity>(initial.severityMin);

  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function toggleRecipient(id: number) {
    setAdminUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function save() {
    setBusy(true);
    setErr(null);
    setSavedAt(null);
    try {
      const customFieldsArr = customFieldsText
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const customFields = customFieldsArr.length === 0 ? null : customFieldsArr;

      const res = await fetch("/call-agent/api/settings/discrepancy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled,
          recipientMode,
          adminUserIds: recipientMode === "admins" ? adminUserIds : [],
          actionMode,
          customFields,
          severityMin,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Не удалось сохранить");
      // Серверная сторона могла отфильтровать невалидных пользователей — синхронизируемся.
      if (data.settings && Array.isArray(data.settings.adminUserIds)) {
        setAdminUserIds(data.settings.adminUserIds as number[]);
      }
      setSavedAt(Date.now());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const fieldsDisabled = !enabled;
  const recipientsBlockShown = enabled && recipientMode === "admins";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p
        className="ds-body-sm"
        style={{ color: "var(--muted-foreground)", display: "flex", alignItems: "flex-start", gap: 8 }}
      >
        <Scale size={14} strokeWidth={2} style={{ marginTop: 2, flex: "0 0 auto" }} />
        <span>
          AI сравнит транскрипт звонка с тем, что внесено в карточку Bitrix.
          Если менеджер что-то не указал — расхождения попадут на проверку.
        </span>
      </p>

      {/* Toggle включения модуля */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 12px",
          background: enabled ? "rgba(34,197,94,0.06)" : "var(--muted)",
          border: "1px solid var(--border)",
          borderRadius: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Включить модуль</div>
          <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 2 }}>
            После каждого звонка AI будет сравнивать сказанное с тем, что записано
            в карточке Bitrix, и формировать список расхождений.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          disabled={busy}
          className="ds-btn"
          style={{
            background: enabled ? "var(--success)" : "var(--muted-foreground)",
            color: "white",
            minWidth: 84,
          }}
        >
          {enabled ? "ВКЛ" : "ВЫКЛ"}
        </button>
      </div>

      {/* Получатель расхождений */}
      <div style={{ opacity: fieldsDisabled ? 0.45 : 1, pointerEvents: fieldsDisabled ? "none" : "auto" }}>
        <div className="ds-caption" style={{ marginBottom: 8, fontWeight: 600 }}>
          Куда отправлять расхождения
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <RadioRow
            checked={recipientMode === "manager"}
            onSelect={() => setRecipientMode("manager")}
            icon={<UserIcon size={14} strokeWidth={2} />}
            title="В ЛК менеджера"
            subtitle="Менеджер сам видит расхождения по своим звонкам и правит карточку в Bitrix."
            disabled={fieldsDisabled}
          />
          <RadioRow
            checked={recipientMode === "admins"}
            onSelect={() => setRecipientMode("admins")}
            icon={<UsersIcon size={14} strokeWidth={2} />}
            title="Администратору / РОПу / Владельцу"
            subtitle="Выбранные сотрудники получают сводку расхождений по всей команде."
            disabled={fieldsDisabled}
          />
        </div>
      </div>

      {/* Multi-select получателей */}
      {recipientsBlockShown && (
        <div
          style={{
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--card)",
          }}
        >
          <div className="ds-caption" style={{ marginBottom: 8, fontWeight: 600 }}>
            Кому конкретно отправлять
          </div>
          {recipients.length === 0 ? (
            <div
              className="ds-body-sm"
              style={{
                color: "var(--muted-foreground)",
                padding: 8,
                background: "rgba(217,119,6,0.08)",
                border: "1px solid rgba(217,119,6,0.30)",
                borderRadius: 6,
                display: "flex",
                alignItems: "flex-start",
                gap: 6,
              }}
            >
              <AlertTriangle size={14} strokeWidth={2} style={{ marginTop: 2, flex: "0 0 auto" }} />
              <span>
                В тенанте нет пользователей с ролью Владелец/Администратор/РОП.
                Сначала добавьте их в блоке «Пользователи платформы».
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {recipients.map((u) => {
                const checked = adminUserIds.includes(u.id);
                return (
                  <label
                    key={u.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      cursor: "pointer",
                      background: checked ? "rgba(59,130,246,0.06)" : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRecipient(u.id)}
                      style={{ width: 16, height: 16 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {u.name || u.login}
                      </div>
                      <div
                        className="ds-body-sm"
                        style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}
                      >
                        {u.login} · {ROLE_LABELS[u.role]}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Режим применения правок */}
      <div style={{ opacity: fieldsDisabled ? 0.45 : 1, pointerEvents: fieldsDisabled ? "none" : "auto" }}>
        <div className="ds-caption" style={{ marginBottom: 8, fontWeight: 600 }}>
          Режим применения правок
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <RadioRow
            checked={actionMode === "manual"}
            onSelect={() => setActionMode("manual")}
            icon={<Hand size={14} strokeWidth={2} />}
            title="Ручной"
            subtitle="Получатель видит расхождения и сам идёт в Bitrix править карточку."
            disabled={fieldsDisabled}
          />
          <RadioRow
            checked={actionMode === "auto_approve"}
            onSelect={() => setActionMode("auto_approve")}
            icon={<Wand2 size={14} strokeWidth={2} />}
            title="Авто"
            subtitle="По кнопке «Принять» AI сам запишет правки в карточку Bitrix. «Отклонить» — пропустить."
            disabled={fieldsDisabled}
          />
        </div>
      </div>

      {/* Расширенные настройки */}
      <details
        style={{
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "10px 12px",
          opacity: fieldsDisabled ? 0.45 : 1,
          pointerEvents: fieldsDisabled ? "none" : "auto",
        }}
      >
        <summary
          style={{
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--muted-foreground)",
          }}
        >
          Расширенные настройки
        </summary>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
          <div>
            <label className="ds-caption" style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
              Custom-поля для проверки
            </label>
            <input
              type="text"
              className="ds-input"
              value={customFieldsText}
              onChange={(e) => setCustomFieldsText(e.target.value)}
              placeholder="UF_CRM_1234567890, UF_CRM_BUDGET, ..."
            />
            <div
              className="ds-body-sm"
              style={{ color: "var(--muted-foreground)", fontSize: 11, marginTop: 4 }}
            >
              Через запятую — какие UF_CRM_* поля проверять. Пусто = все custom-поля карточки.
            </div>
          </div>

          <div>
            <label className="ds-caption" style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
              Минимальная важность расхождений
            </label>
            <select
              className="ds-input"
              value={severityMin}
              onChange={(e) => setSeverityMin(e.target.value as Severity)}
            >
              {(["low", "medium", "high"] as Severity[]).map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABELS[s]}
                </option>
              ))}
            </select>
            <div
              className="ds-body-sm"
              style={{ color: "var(--muted-foreground)", fontSize: 11, marginTop: 4 }}
            >
              Расхождения с важностью ниже выбранной AI отбросит и не будет показывать.
            </div>
          </div>
        </div>
      </details>

      {/* Кнопка сохранить + статусы */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
        <button
          type="button"
          className="ds-btn ds-btn-primary"
          onClick={save}
          disabled={busy}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          {busy ? (
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Check size={14} />
          )}
          {busy ? "Сохраняю..." : "Сохранить"}
        </button>
        {savedAt && !busy && !err && (
          <span className="ds-body-sm" style={{ color: "var(--success)", fontSize: 12 }}>
            Сохранено
          </span>
        )}
        {err && (
          <span className="ds-body-sm" style={{ color: "var(--destructive)", fontSize: 12 }}>
            {err}
          </span>
        )}
      </div>
    </div>
  );
}

function RadioRow({
  checked,
  onSelect,
  icon,
  title,
  subtitle,
  disabled,
}: {
  checked: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  disabled?: boolean;
}) {
  return (
    <label
      onClick={(e) => {
        if (disabled) return;
        e.preventDefault();
        onSelect();
      }}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        border: `1px solid ${checked ? "var(--primary, #2563eb)" : "var(--border)"}`,
        borderRadius: 6,
        cursor: disabled ? "not-allowed" : "pointer",
        background: checked ? "rgba(59,130,246,0.06)" : "transparent",
      }}
    >
      <input
        type="radio"
        checked={checked}
        onChange={() => {}}
        disabled={disabled}
        style={{ width: 16, height: 16, marginTop: 2, flex: "0 0 auto" }}
      />
      <span style={{ marginTop: 2, color: "var(--muted-foreground)" }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        <div
          className="ds-body-sm"
          style={{ color: "var(--muted-foreground)", fontSize: 12, marginTop: 2 }}
        >
          {subtitle}
        </div>
      </div>
    </label>
  );
}
