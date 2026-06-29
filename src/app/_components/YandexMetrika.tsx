"use client";

/**
 * Счётчик Яндекс.Метрики для Call-Agent.
 *
 * ОТДЕЛЬНЫЙ счётчик именно Call-Agent (№110246171) — не пересекается со
 * счётчиком основного сайта marketradar24.ru, потому что код стоит только
 * в приложении call-agent (под /call-agent/*).
 *
 * Номер счётчика не секрет (виден в коде страницы у всех), поэтому зашит
 * как значение по умолчанию — работает без правки .env. При необходимости
 * можно переопределить через NEXT_PUBLIC_YANDEX_METRIKA_ID (инлайнится при
 * сборке, поэтому смена ключа требует `npm run build`). Пустая строка в
 * переменной отключает метрику.
 *
 * Информирование пользователя об аналитике — через CookieBanner и
 * страницу /cookie-policy (соответствие инструкции по ПД).
 */
import Script from "next/script";

const YM_ID = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID ?? "110246171";

export default function YandexMetrika() {
  if (!YM_ID) return null;

  return (
    <>
      <Script id="yandex-metrika" strategy="afterInteractive">
        {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
        (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
        ym(${YM_ID}, "init", {clickmap:true, trackLinks:true, accurateTrackBounce:true, webvisor:true});`}
      </Script>
      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${YM_ID}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
