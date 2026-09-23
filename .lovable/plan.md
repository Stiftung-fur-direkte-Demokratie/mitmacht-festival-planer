# iPhone-Safe-Area der installierten App korrigieren

## Umsetzung
- Einen festen Statusleisten-Hintergrund als erstes Element der App ergänzen, im Hellmodus dunkelgrün und im Dunkelmodus mit der Seitenfarbe.
- Die klebende Navigationsleiste dauerhaft unterhalb des oberen Safe-Area-Rands positionieren; der bestehende Scrollzustand steuert nur noch den eingeblendeten Titel.
- Scrollziele für Tageswahl und Community-Bilder anhand des tatsächlichen Safe-Area-Abstands berechnen, einschließlich bereits klebender Navigation.
- Dekoration, Fußbereich, Dialoge und feste Überlagerungen an obere, untere und seitliche iPhone-Safe-Areas anpassen.
- Die Seitenwurzel gegen andersfarbiges Durchscheinen beim iOS-Rubber-Band-Scrollen absichern.
- Sprache auf Deutsch setzen und getrennte Statusleistenfarben für helles und dunkles Farbschema hinterlegen.

## Prüfung
- Hochformat 390 × 844 mit simulierten 47 px oben und 34 px unten: Seitenanfang, mittlerer Scrollstand, Tageswechsel und Community-Sprung in hell/dunkel.
- Querformat 844 × 390 mit simulierten 47 px seitlich.
- Prüfen, dass Navigation und Dialoge nicht unter Statusleiste, Dynamic Island oder Home-Indikator geraten und keine Überbreite entsteht.

## Technische Details
Die Safe-Area-Simulation wird ausschließlich im Browser-Test injiziert und nicht in den ausgelieferten Dateien gespeichert.
