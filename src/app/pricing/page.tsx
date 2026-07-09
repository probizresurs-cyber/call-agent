/**
 * Публичная страница тарифов Колл Агента.
 * Доступна без авторизации по /call-agent/pricing
 */
import type { Metadata } from "next";
import PricingClient from "./PricingClient";

export const metadata: Metadata = {
  title: "Тарифы — Колл Агент | AI-анализ звонков",
  description:
    "Прозрачные тарифы на AI-анализ звонков, встреч и переписок — от 9 800 ₽/мес, лимит по минутам разговоров. Чек-листы, сравнение с CRM, режимы Аналитика и Live. В разы дешевле Imot.io и SalesAI.",
  openGraph: {
    title: "Тарифы Колл Агент — AI-анализ звонков",
    description: "От 9 800 ₽/мес. AI-транскрипция, чек-листы, сравнение с CRM. 3 дня бесплатно.",
    type: "website",
  },
};

export default function PricingPage() {
  return <PricingClient />;
}
