/**
 * /onboarding-requests — просмотр заявок с публичной формы онбординга.
 *
 * Server component: guard canViewTeam (manager → redirect /dashboard).
 * Читает onboarding_requests напрямую через getDbAsync (НЕ через fetch).
 * Парсит payload_json и передаёт список в client-компонент.
 */
import { redirect } from "next/navigation";
import { getSessionUser, canViewTeam } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";
import { OnboardingRequestsClient, type OnboardingItem } from "./OnboardingRequestsClient";

export const dynamic = "force-dynamic";

interface OnboardingRow {
  id: number;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  bitrix_url: string;
  telephony_type: string | null;
  status: string;
  payload_json: string | null;
  created_at: string;
}

export default async function OnboardingRequestsPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!canViewTeam(me.role)) redirect("/dashboard");

  const db = getDbAsync();

  let rows: OnboardingRow[] = [];
  try {
    rows = await db
      .prepare(
        `SELECT id, company_name, contact_name, contact_email, contact_phone,
                bitrix_url, telephony_type, status, payload_json, created_at
           FROM onboarding_requests
          ORDER BY created_at DESC`
      )
      .all<OnboardingRow>();
  } catch {
    // таблица может ещё не существовать — показываем пустое состояние
    rows = [];
  }

  const items: OnboardingItem[] = rows.map((r) => {
    let payload: Record<string, unknown> = {};
    if (r.payload_json) {
      try {
        payload = JSON.parse(r.payload_json) as Record<string, unknown>;
      } catch {
        payload = {};
      }
    }
    return {
      id: r.id,
      company_name: r.company_name,
      contact_name: r.contact_name,
      contact_email: r.contact_email,
      contact_phone: r.contact_phone,
      bitrix_url: r.bitrix_url,
      telephony_type: r.telephony_type,
      status: r.status,
      created_at: r.created_at,
      payload,
    };
  });

  return <OnboardingRequestsClient items={items} />;
}
