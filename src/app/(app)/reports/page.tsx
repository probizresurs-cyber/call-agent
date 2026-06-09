/**
 * /reports — формирование и отправка отчётов в Bitrix-мессенджер.
 *
 * Server component: guard canViewTeam (manager → redirect /dashboard).
 * Грузит список менеджеров тенанта (тот же запрос, что и dashboard-data.managersList)
 * и передаёт его в client-компонент ReportsClient.
 */
import { redirect } from "next/navigation";
import { getSessionUser, canViewTeam } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";
import { listSchedules, type ScheduleRow } from "@/lib/reports-scheduler";
import { listBotChats, type BotChat } from "@/lib/bitrix-im";
import { ReportsClient } from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!canViewTeam(me.role)) redirect("/dashboard");

  const db = getDbAsync();

  // Список звонящих менеджеров — «про кого» отчёт. id = Bitrix manager_id (= Bitrix user id).
  const managers = await db
    .prepare(
      `SELECT c.manager_id AS id,
              COALESCE(MAX(c.manager_name), MAX(m.name), '') AS name
         FROM calls c
         LEFT JOIN managers m ON m.id = c.manager_id
        WHERE c.tenant_id = ?
          AND c.manager_id IS NOT NULL AND c.manager_id != ''
          AND (m.is_active IS NULL OR m.is_active = 1)
        GROUP BY c.manager_id
        ORDER BY name`
    )
    .all<{ id: string; name: string }>(me.tenantId);

  // Пользователи платформы с Bitrix-привязкой — потенциальные получатели (РОПы/владельцы),
  // даже если сами не звонят и в списке менеджеров их нет.
  const platformUsers = await db
    .prepare(
      `SELECT bitrix_manager_id AS id,
              COALESCE(NULLIF(name, ''), login) AS name,
              role
         FROM users
        WHERE tenant_id = ?
          AND bitrix_manager_id IS NOT NULL
          AND bitrix_manager_id != ''`
    )
    .all<{ id: string; name: string; role: string }>(me.tenantId);

  // Пул получателей «Кому отправить» = звонящие менеджеры ∪ пользователи платформы.
  // Дедуп по Bitrix id; запись из users приоритетнее (несёт роль-метку).
  const roleLabel: Record<string, string> = {
    owner: "владелец", admin: "админ", head: "РОП", manager: "менеджер",
  };
  const recipientMap = new Map<string, { id: string; name: string }>();
  for (const c of managers) {
    const id = String(c.id);
    recipientMap.set(id, { id, name: c.name || `ID ${id}` });
  }
  for (const u of platformUsers) {
    const id = String(u.id);
    const tag = roleLabel[u.role] ? ` — ${roleLabel[u.role]}` : "";
    recipientMap.set(id, { id, name: `${u.name || `ID ${id}`}${tag}` });
  }
  const recipients = Array.from(recipientMap.values())
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  // Расписания автоотправки — список текущих + best-effort список чатов Bitrix
  // (если бот не зарегистрирован или нет прав — listBotChats вернёт пустой массив).
  let schedules: ScheduleRow[] = [];
  try {
    schedules = await listSchedules(me.tenantId);
  } catch (e) {
    console.warn("[reports] listSchedules failed:", (e as Error).message);
  }

  let chats: BotChat[] = [];
  try {
    chats = await listBotChats();
  } catch {
    chats = [];
  }

  return (
    <ReportsClient
      managers={managers}
      recipients={recipients}
      schedules={schedules}
      chats={chats}
    />
  );
}
