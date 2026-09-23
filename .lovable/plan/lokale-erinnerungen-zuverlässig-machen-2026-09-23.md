# Lokale Erinnerungen zuverlässig machen

## Ziel
Lokale Erinnerungen sollen nie mehr still hängen oder nach einem Fehlversuch als erledigt gelten. In den Einstellungen kommt eine mobile Diagnose hinzu, mit der sich Zustellung, Timer, Berechtigungen und der Service Worker direkt auf dem Handy nachvollziehen lassen.

## Umsetzung

### 1. Sichere Benachrichtigungszustellung
- In `src/lib/pwa.ts` einen zeitlich begrenzten `getSwRegistration(timeoutMs = 2000)` ergänzen: zuerst vorhandene aktive Registrierung prüfen, andernfalls höchstens bis zum Timeout auf `ready` warten.
- Einen gemeinsamen `showLocalNotification(title, options)` ergänzen. Er versucht zuerst den Service Worker, nutzt nur auf Desktop die direkte Browser-Benachrichtigung und liefert immer ein eindeutiges Ergebnis mit verständlichem Fehlergrund.
- Geräte-/Browser-Erkennung und den Grund für einen deaktivierten Service Worker zentral bereitstellen, damit Zustellung und Diagnose dieselben Regeln verwenden.

### 2. Erinnerungslogik und Fallback
- Erinnerungen und Test-Button vollständig auf den gemeinsamen Helper umstellen.
- Eine Session erst nach bestätigter Anzeige in `notified` speichern.
- Bei einem Fehler: Diagnoseeintrag, Toast, sichtbarer Erinnerungsbanner und – falls unterstützt – kurze Vibration.
- Beim Zurückkehren in die App nicht erinnerte Sessions erkennen, die in den letzten 15 Minuten begonnen haben, und als „Verpasst?“ im Banner zeigen.
- Den bestehenden 30-Sekunden-Check behalten und zusätzlich immer einen exakten Timer auf den nächsten fälligen Erinnerungszeitpunkt planen. Auswahl, Vorlaufzeit, An/Aus, Sichtbarkeit und Fokus planen beziehungsweise prüfen neu.
- Eine Diagnose-Testsession in 60 Sekunden über denselben Planungs- und Zustellweg laufen lassen.

### 3. Persistente Diagnose
- Ein kompaktes Diagnosemodell ergänzen: letzte Prüfung, Anzahl Prüfungen, nächster exakter Timer, Umgebung, Service-Worker-Zustand, kommende Sessions und die letzten 40 Logzeilen.
- Logzeilen mit Uhrzeit in `localStorage` speichern und zugleich über `console.info("[mm-reminder]", …)` ausgeben.
- `#diagnose` öffnet die Einstellungen und klappt den Diagnoseabschnitt auf; beim Schließen werden sowohl `#einstellungen` als auch `#diagnose` entfernt.

### 4. Diagnose in den Einstellungen
- Ganz unten einen aufklappbaren Abschnitt „Diagnose“ ergänzen.
- Anzeigen: Gerät/Browser, Installationsstatus, Notification-Unterstützung und Berechtigung, Service-Worker-Unterstützung/Deaktivierungsgrund/controller/Registrierung/active/waiting, App-Build, Berlin-Zeit, Gerätezeitzone und Sichtbarkeit.
- Anzeigen: letzte Prüfung, Prüfanzahl, nächster Timer sowie die nächsten fünf gemerkten Sessions mit Minuten und Status.
- Buttons: „Jetzt prüfen“, „Test-Erinnerung in 1 Minute“, „Erinnert-Liste zurücksetzen“, „Log kopieren“ und „Log leeren“.
- Beim Kopieren einen Clipboard-Fallback als markierbaren Text anbieten.
- Bestehende Gestaltung übernehmen und nur notwendige kompakte Diagnose-Stile für gute Lesbarkeit bei 360 px ergänzen.

## Prüfung
- TypeScript-Prüfung für die geänderten Dateien.
- Vorschau-Test: Test-Benachrichtigung endet innerhalb des Timeouts mit klarer Fehlermeldung statt Hängen; `#diagnose`, Buttons, Log und 360-px-Darstellung funktionieren.
- Produktionsnaher Test mit aktiviertem Service Worker und simulierter Zeit über `window.__MM_NOW`: fällige Erinnerung, erfolgreiche `notified`-Markierung, exakter Timer, verpasste Erinnerung und Fehler-Fallback prüfen.
- Kontrollieren, dass `src/data/programm.json`, Team-Bild, Footer und GitHub-Link unverändert bleiben.

## Technische Hinweise
- Das bestehende Erinnerungs-`localStorage`-Format bleibt kompatibel; das Diagnose-Log erhält einen separaten Schlüssel.
- Direkte `Notification`-Objekte werden ausdrücklich nicht auf iOS oder Android verwendet.
- Browser drosseln oder pausieren JavaScript bei gesperrtem Bildschirm weiterhin. Diagnose und Kalenderhinweis machen diese Plattformgrenze sichtbar, können sie aber ohne Push-Dienst nicht aufheben.
