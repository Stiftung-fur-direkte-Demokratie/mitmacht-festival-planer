# Mitmacht Festival Planner

Baue eine mobile-first Web-App „Mitmacht 2026 Programmplaner" für das Demokratiefestival Mitmacht 2026 × reCampaign (23.–26. September 2026, SRH Hochschule Berlin). Besucher*innen stellen damit ihr persönliches Festivalprogramm zusammen und übernehmen es in ihren Kalender. Die gesamte Oberfläche ist auf Deutsch.

## Anhänge – bitte zuerst ansehen
- **programm-daten.json**: die einzige Datenquelle. Übernimm sie 1:1 als `src/data/programm.json`: alle 92 Einträge mit sämtlichen Feldern und Texten, ohne Kürzen, Umformulieren oder Ergänzen. Erfinde keine Inhalte. Falls du den Anhang nicht vollständig lesen kannst, sag das bitte ausdrücklich, statt Daten zu raten.
- **mitmacht-programm-referenz.html**: ein funktionierender Prototyp als Single-File-HTML. Übernimm Verhalten, Texte und Design daraus. Ignoriere alles rund um `window.claude` (claude.ai-spezifisch).
- **3 Screenshots** (Desktop, Mobil „Programm", Mobil „Mein Programm") als visuelle Vorlage.

## Technik
- Reine Client-App (React + TypeScript + Tailwind). Kein Login, kein Backend, keine Datenbank.
- Die Auswahl der Nutzer*innen wird in localStorage gespeichert.
- Alle Uhrzeiten gelten in Europe/Berlin (Sommerzeit, +02:00), unabhängig von der Zeitzone des Geräts.

## Datenmodell (programm-daten.json)
- `items[]` hat die Felder id, date, start, end, format, title, people, room, note, subtitle, teaser, websiteTime, category, url, description[] (type: heading | paragraph | listItem, text, optional links[{text,url}]) und speakers[] (name, organisation, role).
- `format` ist einer von: keynote, workshop, panel, fishbowl, strategie, kultur, rahmen, pause, ende. pause und ende sind nicht auswählbar und werden nur als Trennzeilen angezeigt.
- Weitere Blöcke: `days[]`, `formats[]` (Labels) und `festival` (Adresse, Bereiche, Raum-Hinweise, Quellen).

## Design
Übernimm das Design aus Referenz und Screenshots, es lehnt sich an den Festival-Flyer an.
- Schrift: DM Sans (Google Fonts), Gewichte 400/500/700/800.
- Farben hell: Hintergrund #FFFFFF, Karten #F5EFEC, Karte hervorgehoben #EDE4DF, Text dunkelgrün #0B3A2A, Text gedämpft #4B6459, Linien #E3D8D2, Rot #E63B2E, Navy #2E2C84, Hellblau #8CCBF0, Pink #F08DC9.
- Dunkelmodus nach Systemeinstellung: Hintergrund #0A1310, Karten #13201A, Text #EAF3EE, gedämpft #9DB4A9, Zeit-Pillen hellgrün #CDEBDB mit dunkler Schrift, Rot #FF5C4B, Navy #A3A1F7.
- Header: großer Titel „Mitmacht 2026", ein roter Kreis oben rechts angeschnitten, dazu ein hellblaues Punktraster als Deko.
- Zeitangaben als dunkelgrüne Pillen. Tages-Überschriften als Navy-Balken, der vom linken Rand kommt.
- Die Format-Icons sind kleine Punkt-Cluster wie im Flyer, als Inline-SVG wie in der Referenz:
  - Keynote: grüner Punkt
  - Workshop: 3 rote Punkte
  - Panel: 3 Navy-Punkte in einer Reihe
  - Fishbowl: hellblauer Kreis mit Blase
  - Strategierunde: rote „Pfote" aus einem großen und vier kleinen Punkten
  - Kunst & Kultur: pinke Punkte
  - Rahmenprogramm: Ring
- Karten ohne Schatten. Gemerkte Karten bekommen eine 2px-Kontur in Textfarbe und einen roten runden ✓-Button, ungemerkte einen umrandeten +-Button (44px Touch-Target).
- Sticky Leiste oben: Umschalter „Programm / Mein Programm (Anzahl)" und darunter die Tages-Tabs (Mi 23. … Sa 26.). Der aktuelle Tag ist mit „Heute" markiert, gemerkte Sessions werden pro Tag gezählt.

## Funktionen
1. **Programm-Ansicht**
   - Tages-Tabs. Beim Öffnen ist automatisch der heutige Festivaltag gewählt, sonst Mittwoch.
   - Sessions nach Zeitslot gruppiert (gleiche Start- und Endzeit, Reihenfolge wie in den Daten), Pausen als Trennzeilen.
   - Filter-Chips nach Format (Mehrfachauswahl).
   - Volltextsuche über alle Tage. Sie durchsucht Titel, Personen, Raum, Untertitel, Teaser, Beschreibung sowie Namen, Organisationen und Rollen der Speaker. Wörter mit bis zu 3 Buchstaben (z. B. „KI") nur als ganzes Wort, längere als Teilstring. Treffer werden nach Tagen gruppiert und die Anzahl angezeigt.
2. **Session-Karte**
   - Inhalt: Format-Label, Titel, Untertitel (gedämpft), Personen, Raum, Hinweis.
   - Tags: „Läuft gerade", „Durchgehend hh:mm–hh:mm" bei Kunst & Kultur mit mindestens 180 Minuten, rot umrandet „Website: …", wenn websiteTime gesetzt ist.
   - Vergangene Sessions werden gedimmt. Der Status aktualisiert sich jede Minute.
   - „Mehr erfahren" klappt einen Detailbereich auf:
     - Warnung zur abweichenden Website-Zeit
     - Teaser, falls er nicht mit dem ersten Absatz identisch ist
     - Beschreibung mit Zwischenüberschriften, Absätzen, Listen und Links (neuer Tab)
     - „Mit": Speaker-Liste mit Name fett, darunter „Rolle · Organisation"
     - Kategorie-Chip
     - Link „Auf faktor-d.org ansehen ↗"
3. **Mein Programm**
   - Alle gemerkten Sessions nach Tag, mit Uhrzeit auf der Karte.
   - Überschneidungs-Warnung in Rot („Überschneidet sich mit „…" (hh:mm–hh:mm)"). Ignoriere dabei Einträge mit mindestens 180 Minuten Dauer und den Eintrag mit der id mi00 (Soft Opening).
   - Toast-Meldungen beim Merken und Entfernen.
   - „Programm leeren" mit Bestätigung direkt auf der Seite, ohne confirm()-Dialog.
   - Leerer Zustand mit Hinweis und Button „Zum Programm".
4. **Kalender-Export** (oben in „Mein Programm")
   - a) Button „Kalenderdatei (.ics) laden" für das ganze persönliche Programm, Dateiname `mitmacht-2026-mein-programm.ics`.
     - RFC-5545-konform mit VTIMEZONE für Europe/Berlin und DTSTART/DTEND mit TZID.
     - Stabile UID pro Session-id, SUMMARY „Mitmacht: {Titel}".
     - DESCRIPTION wie in der Referenz-Funktion `evDetails`: Format + Personen, Untertitel, Ort, Hinweis, Website-Zeit-Hinweis, Anmelde-Link, „Mehr: {url}".
     - LOCATION-Regeln wie `evLocation` in der Referenz.
     - Darunter eine kurze Anleitung: iPhone/Mac öffnen die Datei direkt. Für Google Kalender am Computer: Einstellungen → Importieren & exportieren.
   - b) Google-Kalender-Durchklick-Modus wie in der Referenz: großer Button „Termin X von Y in Google Kalender öffnen ↗" mit einem Google-Calendar-Template-Link (render?action=TEMPLATE, dates, ctz=Europe/Berlin, details, location) und Fortschrittsbalken. Beim Klick wird der Termin als geöffnet markiert, danach ist der nächste dran. Pro Karte gibt es zusätzlich „In Google Kalender öffnen ↗" bzw. „✓ In Google Kalender geöffnet · Nochmal öffnen · Markierung entfernen". Wurden entfernte Sessions schon übergeben, erscheint ein Hinweis mit Button „Erledigt".
5. **Programm aufs Handy übertragen**
   - Button „Link zu meinem Programm kopieren" erzeugt eine URL mit den gewählten ids (z. B. `?p=do05,do21`).
   - Wer den Link öffnet, sieht einen Hinweis „X Sessions übernehmen?" mit den Buttons „Ersetzen" und „Hinzufügen".
6. **Unten**
   - Aufklappbarer Bereich „Anreise, Orte & Räume" mit Adresse, Google-Maps-Link, Veranstaltungsbereichen, Raum-Hinweisen und „Gut zu wissen", alles aus `festival`.
   - Fußzeile mit der Quellenangabe aus `festival.sources` und einem Link auf `festival.programUrl`.

## Qualität
- Funktioniert bei 360–400px Breite ohne horizontales Scrollen, mit mindestens 16px Seitenrand.
- Sichtbarer Fokus, aria-pressed/aria-expanded, `prefers-reduced-motion` berücksichtigen.
- Seitentitel „Mitmacht 2026 Programmplaner", Meta-Beschreibung auf Deutsch.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mitmacht-festival-planer.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2fb38467-9768-4150-8ae3-798451517e8e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
