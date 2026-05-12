// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * Document HTML racine pour la version Web/PWA.
 * — Meta tags iOS et Android pour transformer le site en APK/iOS app
 *   une fois epingle a l'ecran d'accueil.
 * — Service Worker enregistre tres tot pour PWA installable.
 * — Mini-bandeau iOS Safari (non-standalone) qui guide l'ajout au Home.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fr" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no, maximum-scale=1, user-scalable=no"
        />
        <meta name="theme-color" content="#00ffff" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#050505" />
        <meta name="color-scheme" content="dark" />
        <meta name="format-detection" content="telephone=no" />

        {/* PWA Apple — convertit le site en app iOS standalone une fois epingle */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="FX Pro" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="FX Pro 2026" />
        <meta name="msapplication-TileColor" content="#050505" />
        <meta name="msapplication-tap-highlight" content="no" />

        {/* SEO */}
        <title>FX Pro 2026 — Conversion & Transferts</title>
        <meta name="description" content="FX Pro 2026 : conversion de devises, transferts P2P securises et taux temps reel." />
        <meta property="og:title" content="FX Pro 2026" />
        <meta property="og:description" content="Wallet multi-devises, transferts instantanes et taux en direct." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="/icons/app-icon-512.png" />
        <meta name="twitter:card" content="summary_large_image" />

        {/* Manifest + icones */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/app-icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icons/app-icon-512.png" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <link rel="mask-icon" href="/icons/app-icon-192.png" color="#00ffff" />

        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root { color-scheme: dark; }
              html { -webkit-text-size-adjust: 100%; }
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; }
              body {
                background: #050505;
                color: #ffffff;
                overscroll-behavior: none;
                -webkit-tap-highlight-color: transparent;
                -webkit-touch-callout: none;
                touch-action: manipulation;
              }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }
              /* Coach iOS - bandeau "Ajouter a l'ecran d'accueil" */
              #ios-add-home {
                position: fixed;
                left: 12px;
                right: 12px;
                bottom: max(12px, env(safe-area-inset-bottom));
                z-index: 99999;
                display: none;
                padding: 14px 16px;
                border-radius: 18px;
                background: rgba(8, 12, 24, 0.92);
                color: #ffffff;
                font: 500 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                border: 1px solid rgba(0, 255, 255, 0.35);
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55), 0 0 24px rgba(0, 255, 255, 0.15);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
              }
              #ios-add-home strong { color: #00ffff; font-weight: 700; }
              #ios-add-home .row { display: flex; align-items: center; gap: 10px; }
              #ios-add-home .icon { font-size: 22px; }
              #ios-add-home button {
                margin-left: auto;
                background: transparent;
                color: #00ffff;
                border: 1px solid rgba(0, 255, 255, 0.5);
                border-radius: 999px;
                padding: 6px 12px;
                font-weight: 700;
                font-size: 12px;
                cursor: pointer;
              }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}

        {/* Bandeau coach iOS uniquement si Safari mobile non standalone */}
        <div id="ios-add-home" role="dialog" aria-live="polite">
          <div className="row">
            <span className="icon" aria-hidden="true">📲</span>
            <div>
              Pour installer <strong>FX Pro</strong>, appuyez sur <strong>Partager</strong> puis <strong>{"« Sur l'écran d'accueil »"}</strong>.
            </div>
            <button type="button" data-fxpro-dismiss-hint="1">OK</button>
          </div>
        </div>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Enregistrement Service Worker (PWA installable)
                if ('serviceWorker' in navigator && location.protocol !== 'file:') {
                  window.addEventListener('load', function () {
                    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
                      .catch(function () {});
                  });
                }

                // Coach iOS : visible seulement si Safari iOS et non-standalone
                try {
                  var ua = navigator.userAgent || '';
                  var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
                  var isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
                    || window.navigator.standalone === true;
                  var dismissed = false;
                  try { dismissed = localStorage.getItem('fx_ios_hint_dismissed') === '1'; } catch (e) {}
                  if (isIOS && !isStandalone && !dismissed) {
                    setTimeout(function () {
                      var el = document.getElementById('ios-add-home');
                      if (el) el.style.display = 'block';
                    }, 1800);
                  }
                  // Annonce installation native (Android/Desktop)
                  window.addEventListener('appinstalled', function () {
                    try { localStorage.setItem('fx_ios_hint_dismissed', '1'); } catch (e) {}
                  });

                  // Fermeture manuelle du coach iOS
                  document.addEventListener('click', function (ev) {
                    var t = ev.target;
                    if (t && t.getAttribute && t.getAttribute('data-fxpro-dismiss-hint') === '1') {
                      try { localStorage.setItem('fx_ios_hint_dismissed', '1'); } catch (e) {}
                      var el = document.getElementById('ios-add-home');
                      if (el) el.style.display = 'none';
                    }
                  }, true);
                } catch (e) {}
              })();
            `,
          }}
        />
      </body>
    </html>
  );
}
