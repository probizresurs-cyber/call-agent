import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Call-Agent — AI-анализ коммуникаций с клиентами",
  description:
    "Транскрибация и AI-анализ звонков, чатов и встреч. Интеграция с Битрикс24, amoCRM и другими CRM. Дашборд по менеджерам, чек-листы, профиль клиента 360, коучинг.",
  openGraph: {
    title: "Call-Agent — AI-анализ коммуникаций с клиентами",
    description:
      "Транскрибация и AI-анализ звонков, чатов и встреч. Интеграция с Битрикс24, amoCRM и другими CRM. Дашборд по менеджерам, чек-листы, профиль клиента 360, коучинг.",
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
      <body>{children}</body>
    </html>
  );
}
