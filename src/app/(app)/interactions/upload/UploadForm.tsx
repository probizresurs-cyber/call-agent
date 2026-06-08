"use client";

import { useState } from "react";
import { Video, ArrowDownLeft, ArrowUpRight, FileText, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

type Type = "meeting";
type Channel = "zoom" | "yandex_telemost" | "dictaphone" | "other" | "manual";
type Direction = "in" | "out";

const CHANNELS_BY_TYPE: Record<Type, Array<{ value: Channel; label: string }>> = {
  meeting: [
    { value: "zoom",            label: "Zoom" },
    { value: "yandex_telemost", label: "Яндекс Телемост" },
    { value: "dictaphone",      label: "Диктофон / голосовая запись" },
    { value: "other",           label: "Другая платформа" },
  ],
};

const TYPE_LABELS: Record<Type, { label: string; icon: React.ReactNode; hint: string }> = {
  meeting: {
    label: "Встреча / запись",
    icon: <Video size={16} />,
    hint: "Загрузите аудио или видео — Zoom, Яндекс Телемост, запись с диктофона (.mp3 / .m4a / .wav / .ogg / .aac). Файл пройдёт транскрипцию и AI-разбор.",
  },
};

export function UploadForm() {
  const router = useRouter();
  const [type, setType] = useState<Type>("meeting");
  const [channel, setChannel] = useState<Channel>("zoom");
  const [direction, setDirection] = useState<Direction | "">("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientName, setClientName] = useState("");
  const [managerId, setManagerId] = useState("");
  const [bitrixDealId, setBitrixDealId] = useState("");
  const [bitrixLeadId, setBitrixLeadId] = useState("");
  const [bitrixContactId, setBitrixContactId] = useState("");
  const [contentText, setContentText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [startedAt, setStartedAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // При смене типа корректируем список каналов
  function onTypeChange(t: Type) {
    setType(t);
    const channels = CHANNELS_BY_TYPE[t];
    if (!channels.find((c) => c.value === channel)) setChannel(channels[0].value);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.set("type", type);
      fd.set("channel", channel);
      if (direction) fd.set("direction", direction);
      if (clientPhone) fd.set("client_phone", clientPhone);
      if (clientName)  fd.set("client_name", clientName);
      if (managerId)   fd.set("manager_id", managerId);
      if (bitrixDealId)    fd.set("bitrix_deal_id", bitrixDealId);
      if (bitrixLeadId)    fd.set("bitrix_lead_id", bitrixLeadId);
      if (bitrixContactId) fd.set("bitrix_contact_id", bitrixContactId);
      if (startedAt) fd.set("started_at", startedAt.replace("T", " ") + ":00");
      if (contentText.trim()) fd.set("content_text", contentText);
      if (file) fd.set("file", file);

      const r = await fetch("/call-agent/api/interactions/upload", { method: "POST", body: fd });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || "unknown");
      setMsg({ kind: "ok", text: `Загружено как #${data.callId}. Анализ запустится в течение 30 секунд.` });
      // Очистка контента, но не настроек — удобно лить несколько подряд
      setContentText("");
      setFile(null);
      setClientPhone("");
      setClientName("");
      // Через 2 секунды редирект в карточку
      setTimeout(() => router.push(`/calls/${data.callId}`), 1500);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const channels = CHANNELS_BY_TYPE[type];
  const showFileInput = true;   // для встреч/диктофона — всегда показываем загрузку файла
  const showTextInput = true;   // также можно вставить готовый транскрипт текстом

  return (
    <form onSubmit={submit} className="ds-card" style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 800, width: "100%" }}>
      {/* Заголовок типа — теперь только встреча/диктофон, выбор убран */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px",
        background: "color-mix(in oklch, var(--primary) 8%, transparent)",
        border: "1px solid color-mix(in oklch, var(--primary) 25%, transparent)",
        borderRadius: 6,
      }}>
        <Video size={18} color="var(--primary)" />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{TYPE_LABELS.meeting.label}</div>
          <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12, marginTop: 2 }}>
            {TYPE_LABELS.meeting.hint}
          </div>
        </div>
      </div>

      {/* Канал + направление */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Field label="Канал">
          <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className="ds-input" style={inputStyle}>
            {channels.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Направление">
          <div style={{ display: "flex", gap: 6 }}>
            <DirBtn checked={direction === "in"}  onClick={() => setDirection(direction === "in" ? "" : "in")}  icon={<ArrowDownLeft size={12} />} label="Входящ." />
            <DirBtn checked={direction === "out"} onClick={() => setDirection(direction === "out" ? "" : "out")} icon={<ArrowUpRight size={12} />} label="Исходящ." />
          </div>
        </Field>
      </div>

      {/* Метаданные */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Field label="Дата и время">
          <input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} className="ds-input" style={inputStyle} />
        </Field>
        <Field label="ID менеджера в Bitrix (опционально)">
          <input value={managerId} onChange={(e) => setManagerId(e.target.value)} placeholder="например 123" className="ds-input" style={inputStyle} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Field label="Телефон заказчика">
          <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="79161234567" className="ds-input" style={inputStyle} />
        </Field>
        <Field label="Имя заказчика (опционально)">
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Иван Петров" className="ds-input" style={inputStyle} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Field label="Bitrix Deal ID">
          <input value={bitrixDealId} onChange={(e) => setBitrixDealId(e.target.value)} placeholder="" className="ds-input" style={inputStyle} />
        </Field>
        <Field label="Bitrix Lead ID">
          <input value={bitrixLeadId} onChange={(e) => setBitrixLeadId(e.target.value)} placeholder="" className="ds-input" style={inputStyle} />
        </Field>
        <Field label="Bitrix Contact ID">
          <input value={bitrixContactId} onChange={(e) => setBitrixContactId(e.target.value)} placeholder="" className="ds-input" style={inputStyle} />
        </Field>
      </div>

      {/* Контент */}
      {showTextInput && (
        <Field label={type === "email" ? "Текст письма" : type === "chat" ? "Текст переписки" : "Транскрипт встречи (если уже есть текстом)"}>
          <textarea
            value={contentText}
            onChange={(e) => setContentText(e.target.value)}
            rows={10}
            placeholder={
              type === "email"
                ? "Скопируйте содержимое письма (можно с заголовками From/To)"
                : type === "chat"
                ? "Менеджер: Здравствуйте...\nЗаказчик:Добрый день..."
                : "Менеджер: ...\nЗаказчик:..."
            }
            className="ds-input"
            style={{ ...inputStyle, fontFamily: "monospace", fontSize: 13, resize: "vertical" }}
          />
        </Field>
      )}

      {showFileInput && (
        <Field label="Файл записи (audio / video — .mp3 / .m4a / .wav / .ogg / .aac / .mp4)">
          <input
            type="file"
            accept="audio/*,video/*,.mp3,.mp4,.wav,.m4a,.ogg,.aac,.opus,.webm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="ds-input"
            style={inputStyle}
          />
          {file && (
            <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 11, marginTop: 4 }}>
              <FileText size={11} style={{ verticalAlign: -1 }} /> {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
            </div>
          )}
        </Field>
      )}

      {msg && (
        <div style={{
          padding: 10,
          background: msg.kind === "ok" ? "rgba(34,197,94,0.08)" : "rgba(220,38,38,0.08)",
          border: `1px solid ${msg.kind === "ok" ? "rgba(34,197,94,0.30)" : "rgba(220,38,38,0.30)"}`,
          borderRadius: 6, fontSize: 13,
          color: msg.kind === "ok" ? "var(--success)" : "var(--destructive)",
        }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="submit" disabled={busy || (!contentText.trim() && !file)} className="ds-button" style={{
          background: "var(--primary)", color: "white",
          opacity: busy || (!contentText.trim() && !file) ? 0.6 : 1,
          minWidth: 140, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          {busy ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Загрузка...</> : "Загрузить"}
        </button>
      </div>
    </form>
  );
}

// ── helpers ──

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", fontSize: 13,
  background: "var(--background)", border: "1px solid var(--border)", borderRadius: 6,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="ds-body-sm" style={{ marginBottom: 4, fontSize: 12, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function DirBtn({ checked, onClick, icon, label }: { checked: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ds-button"
      style={{
        flex: 1, fontSize: 12,
        background: checked ? "var(--primary)" : "transparent",
        color: checked ? "white" : "var(--foreground)",
        border: `1px solid ${checked ? "var(--primary)" : "var(--border)"}`,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
      }}
    >
      {icon} {label}
    </button>
  );
}
