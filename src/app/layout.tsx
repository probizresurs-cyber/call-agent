import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Call-Agent — анализатор звонков Битрикс24",
  description:
    "Транскрибация и AI-анализ звонков из Битрикс24. Дашборд по менеджерам, скрипту, возражениям.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
