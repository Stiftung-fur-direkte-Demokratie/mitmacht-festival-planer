# Community mit LinkedIn-Login

Programm, Mein Programm, PWA, Push, Design, Team-Bild, Footer und `src/data/programm.json` bleiben unverändert und funktionieren weiter ohne Login.

## 1. LinkedIn-Anmeldung
- `GET /api/public/auth/linkedin/start?return=…`: erzeugt zufällige Werte für `state` und `nonce`, speichert sie in `oauth_states` (10 Min. gültig, nur Server-Zugriff) und leitet zu LinkedIn weiter (scope „openid profile email"). `return` ist nur als relativer Pfad erlaubt, also mit `/`, aber nicht mit `//` oder `/\`.
- `GET /api/public/auth/linkedin/callback`: Redirect-URL **https://mitmacht.demokratie.ch/api/public/auth/linkedin/callback**.
  - Prüft den `state` und verbraucht ihn danach.
  - Tauscht den Code gegen ein Token und ruft `userinfo` ab.
  - Ohne verifizierte E-Mail kommt eine freundliche Fehlermeldung.
  - Sucht die Person über `linkedin_sub`, sonst per E-Mail, sonst wird sie neu angelegt (`email_confirm`).
  - Aktualisiert Name und Bild.
  - Erzeugt einen Einmal-Login mit `generateLink` (magiclink) und leitet mit dem `hashed_token` zurück auf `/#li_token=…`.
  - Das LinkedIn-Token wird nicht gespeichert.
- Fehler leiten auf `/#li_error=cancelled|state|unreachable|noemail|config` zurück. Die App zeigt dazu eine deutsche Meldung.
- Der Client löst den Token mit `verifyOtp({ token_hash, type: 'magiclink' })` ein und entfernt das Fragment sofort aus der URL.
- Solange die Secrets fehlen, antwortet `start` mit `config`. Der Anmelde-Button zeigt dann den Hinweis „LinkedIn-Anmeldung wird gerade eingerichtet" statt eines Fehlers.

## 2. Datenbank (eine Migration, alles mit GRANT und RLS)
- `profiles`: Spalten wie gewünscht. Lesen und Ändern nur für die eigene Zeile. `visible`, `consent_at` und `hidden_by_admin` schützt ein Trigger: `hidden_by_admin` dürfen nur Admins ändern, und `visible = true` braucht `consent_at`.
- `attendance`: Nur eigene Zeilen, Session-IDs werden gegen die bekannten IDs geprüft (Check über eine Hilfsfunktion mit fester ID-Liste).
- `user_roles` mit Enum `app_role` ('admin') und `has_role()` als Security-Definer-Funktion.
- `oauth_states`: Nur der Server hat Zugriff.
- `community_public()` (Security Definer, auch für anonyme Besucher*innen ausführbar) liefert nur `user_id`, Name, Bild, Funktion, Organisation, LinkedIn-URL und die öffentlichen Session-IDs. Und zwar nur für Profile mit visible, consent_at gesetzt und nicht ausgeblendet.
- `admin_set_hidden(user_id, hidden)` darf nur mit `has_role` aufgerufen werden. Admins sehen dafür auch ausgeblendete Profile, zusammen mit dem Status.
- `DELETE /api/public/auth/account` prüft das Bearer-Token und löscht dann Profil, attendance und den Auth-User.

## 3. Frontend
- Neuer Hook `useCommunity` für Session, Profil, Sync und die gecachte öffentliche Liste (localStorage mit „Stand: hh:mm").
- Sync: Beim Login werden localStorage und attendance vereinigt. Danach werden Änderungen nachgesendet, sobald Verbindung besteht. Neue Einträge starten mit is_public=false, localStorage bleibt die Offline-Quelle.
- Kopfzeile: Neben dem Zahnrad ein schlichtes LinkedIn-Icon zum Anmelden bzw. ein runder Avatar. Er öffnet das Sheet „Mein Profil & Sichtbarkeit".
- Das Sheet nutzt dasselbe Muster wie die Einstellungen:
  - Profilformular mit Name, Funktion und Organisation (je max. 80 Zeichen) und LinkedIn-URL (`https://www.linkedin.com/in/…`).
  - Sichtbarkeits-Schalter plus Einwilligungs-Checkbox mit Datenschutz-Link.
  - „Alle meine Sessions freigeben", „Abmelden" und „Konto und alle Daten löschen" mit Bestätigung direkt im Sheet.
- Nach dem ersten Login öffnet sich das Sheet automatisch mit dem Formular.
- Tabs: „Programm | Mein Programm | Community", auf 360 px heisst der zweite Tab „Mein Progr.".
- Community-Tab:
  - Einleitung, Suche und Filter „Heute dabei".
  - Karten mit Foto (bei Ladefehler Initialen), „Wo finde ich sie/ihn?" und aufklappbarer Session-Liste.
  - Hinweis-Karte zum Anmelden, „Ausblenden" für Admins, Session-Filter-Chip.
- In Mein Programm: pro Session der Schalter „Öffentlich zeigen, dass ich dabei bin", nur wenn eingeloggt.
- Session-Karten: Avatar-Stapel „N aus der Community dabei". Ein Klick öffnet den Community-Tab, gefiltert auf diese Session.
- Offline sind Anmelden und Freigaben deaktiviert, mit Hinweis.

## 4. Test
- Anonymer Aufruf von `community_public`: nur Freigegebenes, keine E-Mail. Direkter Zugriff auf `profiles` und `attendance` wird verweigert.
- Mit zwei Test-Usern: Freigabe, Widerruf, Admin-Ausblenden, Konto löschen. Test-User werden danach entfernt.
- Login-Brücke: `start` ohne Secrets, ungültiger `return`, falscher bzw. abgelaufener `state`, `error=user_cancelled_login`.
- UI bei 360 und 390 px, hell und dunkel.

## Danach von dir
- Secrets `LINKEDIN_CLIENT_ID` und `LINKEDIN_CLIENT_SECRET` frage ich über die Secret-Eingabe ab.
- Bei LinkedIn das Produkt „Sign In with LinkedIn using OpenID Connect" aktivieren und die Redirect-URL oben eintragen.
- Admin werden: Ich nenne dir die SQL-Zeile bzw. trage dich nach deinem ersten Login ein.
