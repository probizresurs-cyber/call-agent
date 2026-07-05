/**
 * Layout для публичных страниц — без sidebar, без auth-проверки, чистая страница.
 * Используется для shareable дашборда (ссылка руководителю).
 *
 * Пред-пейнт скрипт применяет сохранённую тему (ca-report-theme) ДО отрисовки —
 * иначе при тёмной теме мигал бы светлый фон. Инлайн, чтобы выполниться сразу.
 */
const THEME_INIT = `
try {
  var t = localStorage.getItem('ca-report-theme');
  if (t === 'dark') document.documentElement.classList.add('dark');
} catch (e) {}
`;

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      <div style={{ minHeight: "100vh", background: "var(--background)", padding: "20px" }}>
        {children}
      </div>
    </>
  );
}
