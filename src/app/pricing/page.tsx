/**
 * Публичная страница тарифов Call-Agent.
 * Доступна без авторизации по /call-agent/pricing
 */
import type { Metadata } from "next";
import PricingClient from "./PricingClient";

export const metadata: Metadata = {
  title: "Тарифы — Call-Agent | AI-анализ звонков",
  description:
    "Прозрачные тарифы на AI-анализ звонков, встреч и переписок. От 3 500 ₽/мес. Чек-листы, Bitrix24, геймификация. В разы дешевле Imot.io и SalesAI.",
  openGraph: {
    title: "Тарифы Call-Agent — AI-анализ звонков",
    description: "От 3 500 ₽/мес. AI-транскрипция, чек-листы, Bitrix24-интеграция. 14 дней бесплатно.",
    type: "website",
  },
};

export default function PricingPage() {
  return <PricingClient />;
}
