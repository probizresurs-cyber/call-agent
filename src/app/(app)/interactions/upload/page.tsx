/**
 * Страница ручной загрузки взаимодействия (чат / email / встреча).
 * §3.2-§3.4 MASTER-TZ — омниканальный сбор, минимальный режим без подключения
 * Bitrix Open Lines / IMAP / S3-watcher (это отдельные адаптеры в будущих итерациях).
 */
import { redirect } from "next/navigation";
import { Upload } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { UploadForm } from "./UploadForm";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (me.role === "manager") redirect("/dashboard");

  return (
    <>
      <h1 className="ds-h1" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
        <Upload size={22} strokeWidth={2} /> Загрузить запись встречи / диктофона
      </h1>
      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 20 }}>
        Запись Zoom, Яндекс Телемост или голосовая запись с телефона/диктофона —
        пройдёт через транскрипцию (Whisper) и тот же AI-анализ что и звонки.
        Результат появится в <a href="/call-agent/calls" style={{ color: "var(--primary)" }}>списке взаимодействий</a> через 30-60 секунд.
      </p>

      <UploadForm />
    </>
  );
}
