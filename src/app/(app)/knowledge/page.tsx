/**
 * /knowledge — Центр знаний Колл Агента: список материалов для команды.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, ArrowRight } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { KB_ARTICLES } from "@/lib/knowledge/articles";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");

  return (
    <main style={{ padding: "clamp(16px, 3vw, 32px)", maxWidth: 820, margin: "0 auto" }}>
      <h1 className="ds-h2" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <BookOpen size={22} color="var(--primary)" /> Центр знаний
      </h1>
      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 22 }}>
        Гайды и инструкции по работе с Колл Агентом.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {KB_ARTICLES.map((a) => (
          <Link key={a.slug} href={`/knowledge/${a.slug}`}
            style={{ textDecoration: "none", color: "inherit" }}>
            <div className="ds-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{a.title}</div>
                <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 3 }}>{a.excerpt}</div>
                <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12, marginTop: 6 }}>Обновлено {a.updated}</div>
              </div>
              <ArrowRight size={18} color="var(--muted-foreground)" style={{ flexShrink: 0 }} />
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
