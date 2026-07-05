/**
 * /knowledge/[slug] — статья Центра знаний.
 */
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getArticle } from "@/lib/knowledge/articles";

export const dynamic = "force-dynamic";

export default async function KnowledgeArticlePage(props: { params: Promise<{ slug: string }> }) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const { slug } = await props.params;
  const article = getArticle(slug);
  if (!article) notFound();

  return (
    <main style={{ padding: "clamp(16px, 3vw, 40px)", maxWidth: 880, margin: "0 auto" }}>
      <Link href="/knowledge" className="ds-body-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted-foreground)", textDecoration: "none", marginBottom: 20 }}>
        <ArrowLeft size={15} /> Центр знаний
      </Link>
      <h1 className="ds-h1" style={{ fontSize: "clamp(26px, 3.4vw, 34px)", lineHeight: 1.18, letterSpacing: "-0.015em", marginBottom: 8 }}>{article!.title}</h1>
      <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 24 }}>Обновлено {article!.updated}</div>
      <div className="ds-card kb-prose" style={{ boxShadow: "var(--shadow)" }} dangerouslySetInnerHTML={{ __html: article!.html }} />
    </main>
  );
}
