# Mitmacht 2026 Programmplaner

Online-Planer:in für das Demokratiefestival **Mitmacht 2026 × reCampaign** (23.–26. September 2026, SRH Hochschule Berlin, Sonnenallee 221).

Ein Online-Tool der [Stiftung für Direkte Demokratie](https://www.demokratie.ch) mit Inhalten vom [Mitmacht-Festival 2026](https://www.faktor-d.org/mitmachen/mitmacht-festival/2026/programm).

- Live: https://mitmacht.demokratie.ch
- Code: https://github.com/Stiftung-fur-direkte-Demokratie/mitmacht-festival-planer

## Funktionen

- **Programm**: Tagesauswahl, Gruppierung nach Zeitslots, Formatfilter, Volltextsuche, Status „Läuft gerade", aufklappbare Details
- **Mein Programm**: persönliche Auswahl (im Browser gespeichert), Überschneidungswarnungen, Teilen per Link (`?p=id1,id2`)
- **Kalender**: `.ics`-Export (Europe/Berlin, mit Erinnerungen) und Google-Kalender-Links
- **PWA**: installierbar auf dem Home-Bildschirm, komplett offline nutzbar, Update-Hinweis bei neuer Version
- **Erinnerungen**: lokale Benachrichtigungen vor gemerkten Sessions (5/10/15 Min), solange die App aktiv ist
- **Einstellungen**: Installation, Offline-Speicher, Erinnerungen (Deep-Link `#einstellungen`)
- Hell-/Dunkelmodus, mobile-first, barrierearm (Fokus, ARIA, Reduced Motion)

Kein Login, kein Backend – alle Daten bleiben im Browser (localStorage).

## Technik

- React 19, TypeScript, TanStack Start, Vite
- Tailwind CSS v4, Schrift DM Sans (lokal gebündelt)
- Service Worker (`public/sw.js`) mit versioniertem Cache pro Build
- Programmdaten: `src/data/programm.json` (92 Einträge)

## Entwicklung

```bash
bun install
bun run dev
```

Nützliche Parameter:

- `?nosw` – Service Worker und Offline-Caches abmelden (Notausgang)
- `?sw=on` – Service Worker lokal aktivieren (Test)
- `#einstellungen` – Einstellungen direkt öffnen

Der Service Worker wird nur auf der veröffentlichten Domain registriert, nicht in iframes oder Preview-Umgebungen.

## Datenschutz

[Datenschutzerklärung](https://www.demokratie.ch/datenschutz)

© 2026 Stiftung für Direkte Demokratie
