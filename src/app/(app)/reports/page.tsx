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
import { ReportsClient } from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!canViewTeam(me.role)) redirect("/dashboard");

  // Список менеджеров тенанта — id здесь это Bitrix manager_id (он же Bitrix user id),
  // его и шлём в API как managerId.
  const managers = await getDbAsync()
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

  return <ReportsClient managers={managers} />;
}
