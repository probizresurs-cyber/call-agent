/**
 * Layout для публичных страниц — без sidebar, без auth-проверки, чистая страница.
 * Используется для shareable дашборда.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", padding: "20px" }}>
      {children}
    </div>
  );
}
