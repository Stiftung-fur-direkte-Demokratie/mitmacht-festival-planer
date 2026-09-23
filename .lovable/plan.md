# Echte Push-Erinnerungen (Hintergrund / geschlossene App)

Ziel: Erinnerungen kommen vom Server, auch wenn die App geschlossen ist (Android; iPhone ab iOS 16.4 als installierte App). Anonym, ohne Login. Unverändert bleiben: `src/data/programm.json`, Design, Team-Bild, Footer, GitHub-Link.

## Schritte

1. **Lovable Cloud aktivieren** (Datenbank, Secrets, Zeitplan-Jobs).
2. **VAPID-Schlüssel**: Paar lokal erzeugen und als Secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:info@demokratie.ch` speichern. Den Public Key zusätzlich fest ins Frontend übernehmen (er ist öffentlich).
3. **Datenbank** (eine Migration): `push_subscriptions`, `push_sent` (unique subscription_id+session_id), `push_tests`, mit den verlangten Spalten und Check `lead_minutes in (5,10,15)`. RLS aktiv, **keine** Policies, nur Grants an `service_role` – anon/authenticated haben keinerlei Zugriff.
4. **Server-Endpunkte** statt Edge Functions (in dieser App-Architektur laufen Serverfunktionen direkt in der App; gleiche Aufgaben, gleiche Validierung, Service-Role-Zugriff nur serverseitig):
   - `POST /api/public/push/subscribe` – Validierung (bekannte Session-ids, max. 100, lead 5/10/15, https-Endpoint, Plattform kurz), Upsert per endpoint.
   - `POST /api/public/push/unsubscribe` – löscht Subscription inkl. push_sent/push_tests.
   - `POST /api/public/push/test` – Test mit due_at = jetzt + 60 s.
   - `POST /api/public/push/send-reminders` – geschützt per geheimem Header (`CRON_SECRET`, generiert). Logik: Minuten bis Start in Europe/Berlin, 0 < min ≤ lead, nicht in push_sent, ≥180 Min und `mi00` überspringen; fällige Tests senden und löschen; 404/410 → Subscription löschen; ab 27.09.2026 alles löschen. Zeitplan als kompakte Kopie (id, date, start, end, title, room, format) in einer eigenen Datei.
   - Web Push mit einer Worker-kompatiblen Bibliothek (`@negrel/webpush` via Web Crypto; `web-push` ist Node-only und fällt weg).
   - Optionaler Zeit-Override für Tests nur mit gültigem `CRON_SECRET`.
5. **Cron**: pg_cron + pg_net ruft jede Minute `send-reminders` auf der veröffentlichten Adresse auf (mit `CRON_SECRET`-Header). Falls pg_cron nicht verfügbar ist, melde ich das klar; Alternative: externer Minuten-Cron (z. B. cron-job.org) auf dieselbe URL.
6. **Service Worker**: `push`-Handler zeigt immer eine Notification (Icon/Badge `/icons/icon-192.png`, `data.url`); `notificationclick` nutzt `data.url`, sonst bisheriges Verhalten. Cache-Version wird mitgezogen.
7. **Frontend (Einstellungen → Erinnerungen)**:
   - Bei An + Erlaubt + aktivem SW: `pushManager.subscribe` und Sync; bei Änderung von Auswahl/Vorlauf/An-Aus mit 2 s Debounce, offline später nachholen; Aus → `unsubscribe()` + Server-Löschung.
   - Status: „Push im Hintergrund: aktiv ✓", „Nicht möglich: auf dem iPhone zuerst zum Home-Bildschirm hinzufügen", „Fehler: {Grund}", plus „zuletzt synchronisiert hh:mm".
   - Bei aktivem Push zeigt der lokale Timer keine System-Benachrichtigung mehr, nur den In-App-Banner; ohne Push bleibt der lokale Weg.
   - Button „Test-Push in 1 Minute" mit Hinweis zum Schließen/Sperren.
   - Datenschutz-Hinweis im verlangten Wortlaut.
   - Diagnose ergänzt: Push unterstützt, Subscription vorhanden, Push-Dienst-Host, letzte Server-Antwort, zuletzt synchronisiert.

## Tests
- Endpunkte mit einer Fake-Subscription (Validierung, Upsert, Unsubscribe, Test-Eintrag).
- `send-reminders` mit simulierter Zeit zweimal hintereinander: pro Session genau ein push_sent-Eintrag; 410 löscht die Subscription.
- Cron-Job-Eintrag prüfen. Echte Zustellung erst auf mitmacht.demokratie.ch; am Ende eine Test-Checkliste für iPhone und Android.

## Technische Hinweise
- Abweichung vom Wunsch „Edge Functions": bewusst App-Server-Endpunkte, weil diese App-Architektur das so vorsieht; funktional identisch.
- Neues Secret `CRON_SECRET` (automatisch erzeugt), damit niemand den Versand von außen auslösen kann.
