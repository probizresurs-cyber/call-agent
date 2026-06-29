import type { Metadata, Viewport } from "next";
import "./globals.css";
import YandexMetrika from "./_components/YandexMetrika";

export const metadata: Metadata = {
  title: "Call-Agent — AI-анализ коммуникаций с заказчиками",
  description:
    "ОКК: AI-анализ звонков, чатов и встреч вашего отдела продаж. Дашборд отдела продаж. Интеграция с вашей CRM — Битрикс24, amoCRM и другими. Коучинг ваших продаж.",
  openGraph: {
    title: "Call-Agent — AI-анализ коммуникаций с заказчиками",
    description:
      "ОКК: AI-анализ звонков, чатов и встреч вашего отдела продаж. Дашборд отдела продаж. Интеграция с вашей CRM — Битрикс24, amoCRM и другими. Коучинг ваших продаж.",
    type: "website",
    siteName: "Call-Agent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        {children}
        <YandexMetrika />
      </body>
    </html>
  );
}
