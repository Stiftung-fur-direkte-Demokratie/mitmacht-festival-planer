import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import type { OfflineStatus } from "@/lib/pwa";

export type ReminderDiagnosticSession = {
  id: string;
  title: string;
  start: string;
  minutes: number;
  status: string;
};

export type ReminderDiagnostics = {
  device: string;
  browser: string;
  notificationSupported: boolean;
  swSupported: boolean;
  swDisabledReason: string | null;
  swController: boolean;
  swRegistration: boolean;
  swActive: boolean;
  swWaiting: boolean;
  build: string;
  berlinTime: string;
  deviceTimezone: string;
  visibility: string;
  lastCheck: string | null;
  checkCount: number;
  nextTimer: string | null;
  sessions: ReminderDiagnosticSession[];
  log: string[];
  copyFallback: string | null;
};

export type PushInfo = {
  supported: boolean;
  state: "active" | "ios-install" | "error" | "off" | "pending" | "unavailable";
  error: string | null;
  subscribed: boolean;
  host: string | null;
  lastResponse: string | null;
  lastSync: string | null;
};

export type SettingsProps = {
  open: boolean;
  onClose: () => void;
  /* Installation */
  standalone: boolean;
  ios: boolean;
  canInstall: boolean;
  onInstall: () => void;
  /* Offline */
  offline: OfflineStatus;
  online: boolean;
  onCheckUpdate: () => void;
  updateMsg: string | null;
  updateBusy: boolean;
  installedBuild: string;
  serverBuild: string | null;
  showReloadApp: boolean;
  onReloadApp: () => void;
  onResetOffline: () => void;
  /* Erinnerungen */
  remOn: boolean;
  remLead: number;
  onRemOn: (v: boolean) => void;
  onRemLead: (v: number) => void;
  perm: NotificationPermission | "unsupported";
  onAskPermission: () => void;
  onTestNotification: () => void;
  remCount: number;
  remNext: string | null;
  diagnosticsOpen: boolean;
  diagnostics: ReminderDiagnostics;
  onDiagnosticsToggle: (open: boolean) => void;
  onCheckNow: () => void;
  onScheduleTest: () => void;
  onResetNotified: () => void;
  onCopyLog: () => void;
  onClearLog: () => void;
  push: PushInfo;
  onTestPush: () => void;
  adminSlot?: import("react").ReactNode;
};

export function SettingsDialog(p: SettingsProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const diagnosticRef = useRef<HTMLElement | null>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!p.open) {
      setConfirmReset(false);
      return;
    }
    lastFocus.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.getClientRects().length > 0);
    const focusFirst = () => {
      const list = focusables();
      if (list.length) list[0]!.focus();
      else panel?.focus();
    };
    const t1 = setTimeout(focusFirst, 30);
    const t2 = setTimeout(focusFirst, 150);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        p.onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      lastFocus.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open]);

  useEffect(() => {
    if (!p.open || !p.diagnosticsOpen) return;
    const timer = setTimeout(() => diagnosticRef.current?.scrollIntoView({ block: "start" }), 180);
    return () => clearTimeout(timer);
  }, [p.diagnosticsOpen, p.open]);

  if (!p.open) return null;

  const offlineLabel =
    p.offline === "active"
      ? "Offline-Speicher aktiv ✓"
      : p.offline === "preparing"
        ? "Wird vorbereitet …"
        : "In der Vorschau nicht aktiv";

  const permLabel =
    p.perm === "granted"
      ? "Erlaubt ✓"
      : p.perm === "denied"
        ? "Blockiert"
        : p.perm === "unsupported"
          ? "Auf diesem Gerät nicht möglich"
          : "Noch nicht gefragt";

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="set-h"
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="sheet-head">
          <span className="grabber" aria-hidden="true" />
          <h2 id="set-h">
            <Icon name="gear" /> Einstellungen
          </h2>
          <button type="button" className="iconbtn" aria-label="Einstellungen schließen" onClick={p.onClose}>
            <Icon name="close" />
          </button>
        </div>

        <div className="sheet-body">
          {/* 1 – Installation */}
          <section className="setblock" aria-labelledby="set-1">
            <h3 id="set-1">
              <Icon name="home" /> Zum Home-Bildschirm hinzufügen
            </h3>
            <p className={`statusline${p.standalone ? " ok" : ""}`}>
              {p.standalone ? "Installiert ✓" : "Noch nicht installiert"}
            </p>

            {!p.standalone && p.canInstall && (
              <div className="btnrow">
                <button type="button" className="btn primary small" onClick={p.onInstall}>
                  App installieren
                </button>
              </div>
            )}

            {!p.standalone && p.ios && (
              <ol className="steps">
                <li>
                  <span className="stepno">1</span> Diese Seite in <b>Safari</b> öffnen
                </li>
                <li>
                  <span className="stepno">2</span> Unten auf das <Icon name="share" /> <b>Teilen-Symbol</b> tippen
                </li>
                <li>
                  <span className="stepno">3</span> <Icon name="plus" /> <b>„Zum Home-Bildschirm"</b> wählen
                </li>
                <li>
                  <span className="stepno">4</span> Oben rechts auf <b>„Hinzufügen"</b> tippen
                </li>
              </ol>
            )}

            {!p.standalone && p.ios && (
              <p className="fine">
                Nur so funktionieren Benachrichtigungen auf iPhone und iPad (ab iOS 16.4).
              </p>
            )}

            {!p.standalone && !p.ios && !p.canInstall && (
              <p className="fine">
                Am Computer: In Chrome oder Edge findest du rechts in der Adressleiste ein
                Installieren-Symbol. Auf dem Handy erscheint hier ein Button, sobald der Browser die
                Installation anbietet.
              </p>
            )}
          </section>

          {/* 2 – Offline */}
          <section className="setblock" aria-labelledby="set-2">
            <h3 id="set-2">
              <Icon name="cloud" /> Offline nutzen
            </h3>
            <p className={`statusline${p.offline === "active" ? " ok" : ""}`}>{offlineLabel}</p>
            <p className="statusline sub2">
              {p.online ? "Gerade online" : "Gerade offline"}
            </p>
            <ul className="fine">
              <li>Nach dem ersten Besuch funktioniert die App ohne Internet.</li>
              <li>
                <b>Offline verfügbar:</b> Programm, Mein Programm, Suche, Erinnerungen,
                Kalenderdatei.
              </li>
              <li>
                <b>Offline nicht verfügbar:</b> Links zu faktor-d.org, Google Kalender und Karten.
              </li>
              <li>Tipp: Öffne die App einmal mit Internet, bevor du ins Funkloch gehst.</li>
            </ul>
            <div className="btnrow">
              <button
                type="button"
                className="btn small"
                onClick={p.onCheckUpdate}
                disabled={p.updateBusy}
                aria-busy={p.updateBusy}
              >
                {p.updateBusy && <span className="spin" aria-hidden="true" />}
                {p.updateBusy ? "Wird geprüft …" : "Nach Updates suchen"}
              </button>
              {p.showReloadApp && (
                <button type="button" className="btn small" onClick={p.onReloadApp} disabled={p.updateBusy}>
                  App neu laden
                </button>
              )}
              {!confirmReset ? (
                <button type="button" className="btn small" onClick={() => setConfirmReset(true)}>
                  Offline-Speicher zurücksetzen
                </button>
              ) : (
                <>
                  <button type="button" className="btn small danger" onClick={p.onResetOffline}>
                    Wirklich zurücksetzen
                  </button>
                  <button type="button" className="linkbtn" onClick={() => setConfirmReset(false)}>
                    Abbrechen
                  </button>
                </>
              )}
            </div>
            {updateMsgLine(p.updateMsg)}
            <p className="fine">
              Installiert: Build {p.installedBuild}
              {p.serverBuild && <> · Verfügbar: Build {p.serverBuild}</>}
            </p>
            {confirmReset && (
              <p className="fine">
                Der Offline-Speicher wird geleert und die Seite neu geladen. Dein gemerktes Programm
                bleibt erhalten.
              </p>
            )}
          </section>

          {/* 3 – Erinnerungen */}
          <section className="setblock" aria-labelledby="set-3">
            <h3 id="set-3">
              <Icon name="bell" /> Erinnerungen
            </h3>
            <p className="sub">Kurz vor Beginn einer gemerkten Session – direkt auf diesem Gerät.</p>

            <label className="switch">
              <input
                type="checkbox"
                checked={p.remOn}
                onChange={(e) => p.onRemOn(e.target.checked)}
              />
              Erinnerungen an
            </label>

            <div className="row lead" role="group" aria-label="Vorlaufzeit">
              {[5, 10, 15].map((m) => (
                <button
                  type="button"
                  key={m}
                  className="chip"
                  aria-pressed={p.remLead === m}
                  onClick={() => p.onRemLead(m)}
                >
                  {m} Min vorher
                </button>
              ))}
            </div>

            <p className={`statusline${p.perm === "granted" ? " ok" : ""}`}>
              Benachrichtigungen: {permLabel}
            </p>

            {p.ios && !p.standalone ? (
              <p className="fine">
                Auf iPhone und iPad gehen Benachrichtigungen erst, wenn die App zum Home-Bildschirm
                hinzugefügt wurde – siehe <b>Abschnitt 1</b> oben.
              </p>
            ) : p.perm === "denied" ? (
              <div className="fine">
                <p>So erlaubst du Benachrichtigungen wieder:</p>
                <ul>
                  <li>
                    <b>Chrome/Edge (Android, Desktop):</b> Schloss-Symbol links in der Adressleiste →
                    Berechtigungen → Benachrichtigungen → Zulassen.
                  </li>
                  <li>
                    <b>iPhone/iPad:</b> Einstellungen → Mitteilungen → <b>Mitmacht 2026</b> → Mitteilungen
                    erlauben.
                  </li>
                  <li>
                    <b>Android:</b> Einstellungen → Apps → <b>Mitmacht 2026</b> → Benachrichtigungen.
                  </li>
                </ul>
                <p>Danach diese Seite neu laden.</p>
              </div>
            ) : p.perm !== "granted" ? (
              <div className="btnrow">
                <button type="button" className="btn small primary" onClick={p.onAskPermission}>
                  Benachrichtigungen erlauben
                </button>
              </div>
            ) : null}

            {p.perm === "granted" && (
              <div className="btnrow">
                <button type="button" className="btn small" onClick={p.onTestNotification}>
                  Test-Benachrichtigung senden
                </button>
              </div>
            )}

            {p.remOn && (
              <div className="pushbox">
                <p className={`statusline${p.push.state === "active" ? " ok" : ""}`}>
                  {p.push.state === "active"
                    ? "Push im Hintergrund: aktiv ✓"
                    : p.push.state === "ios-install"
                      ? "Push im Hintergrund – nicht möglich: auf dem iPhone zuerst zum Home-Bildschirm hinzufügen"
                      : p.push.state === "error"
                        ? `Push im Hintergrund – Fehler: ${p.push.error ?? "unbekannt"}`
                        : p.push.state === "pending"
                          ? "Push im Hintergrund: wird eingerichtet …"
                          : `Push im Hintergrund: nicht aktiv${p.push.error ? ` (${p.push.error})` : ""}`}
                </p>
                {p.push.lastSync && <p className="fine">zuletzt synchronisiert {p.push.lastSync}</p>}
                {p.push.state === "active" && (
                  <>
                    <div className="btnrow">
                      <button type="button" className="btn small" onClick={p.onTestPush}>
                        Test-Push in 1 Minute
                      </button>
                    </div>
                    <p className="fine">
                      Jetzt App schließen oder Bildschirm sperren – die Nachricht sollte trotzdem kommen.
                    </p>
                  </>
                )}
              </div>
            )}

            <p className="statusline sub2">
              {p.remCount === 0
                ? "Noch keine gemerkte Session bekommt eine Erinnerung."
                : `${p.remCount} gemerkte Session${p.remCount === 1 ? "" : "s"} bekommen eine Erinnerung.`}
              {p.remNext ? ` Nächste: ${p.remNext}.` : ""}
            </p>

            <ul className="fine">
              <li>
                Mit aktivem Push kommen Erinnerungen auch bei geschlossener App (Android; iPhone ab
                iOS 16.4 als installierte App). Ohne Push kann die Web-App nur erinnern, solange sie
                geöffnet ist oder im Hintergrund noch läuft.
              </li>
              <li>
                Für Erinnerungen im Hintergrund speichern wir anonym die Push-Adresse deines Geräts
                und die IDs deiner gemerkten Sessions – ohne Namen, nur bis Festivalende. Mit
                „Erinnerungen aus" wird alles gelöscht.
              </li>
              <li>Installationen und ganztägige Angebote (ab 3 Stunden) werden nicht erinnert.</li>
              <li>
                Garantiert auch bei geschlossener App: die Kalenderdatei in „Mein Programm" – sie
                enthält dieselbe Vorlaufzeit ({p.remLead} Minuten) als Weckzeit.
              </li>
            </ul>
          </section>

          {p.adminSlot}

          <section className="setblock diagblock" aria-labelledby="set-4" ref={diagnosticRef}>
            <details open={p.diagnosticsOpen} onToggle={(e) => p.onDiagnosticsToggle(e.currentTarget.open)}>
              <summary id="set-4">Diagnose</summary>
              <div className="diagbody">
                <h4>Umgebung</h4>
                <dl className="diaggrid">
                  <div><dt>Gerät / Browser</dt><dd>{p.diagnostics.device} · {p.diagnostics.browser}</dd></div>
                  <div><dt>Installiert</dt><dd>{p.standalone ? "ja" : "nein"}</dd></div>
                  <div><dt>Notification</dt><dd>{p.diagnostics.notificationSupported ? `ja · ${p.perm}` : "nein"}</dd></div>
                  <div><dt>Service Worker</dt><dd>{p.diagnostics.swSupported ? "unterstützt" : "nicht unterstützt"}</dd></div>
                  <div><dt>SW deaktiviert</dt><dd>{p.diagnostics.swDisabledReason ?? "nein"}</dd></div>
                  <div><dt>SW-Zustand</dt><dd>Controller {p.diagnostics.swController ? "ja" : "nein"} · Registrierung {p.diagnostics.swRegistration ? "ja" : "nein"} · active {p.diagnostics.swActive ? "ja" : "nein"} · waiting {p.diagnostics.swWaiting ? "ja" : "nein"}</dd></div>
                  <div><dt>App-Build</dt><dd>{p.diagnostics.build}</dd></div>
                  <div><dt>Berlin / Gerätezone</dt><dd>{p.diagnostics.berlinTime} · {p.diagnostics.deviceTimezone}</dd></div>
                  <div><dt>Push unterstützt</dt><dd>{p.push.supported ? "ja" : "nein"}</dd></div>
                  <div><dt>Push-Subscription</dt><dd>{p.push.subscribed ? "vorhanden" : "keine"}{p.push.host ? ` · ${p.push.host}` : ""}</dd></div>
                  <div><dt>Letzte Server-Antwort</dt><dd>{p.push.lastResponse ?? "–"}</dd></div>
                  <div><dt>Zuletzt synchronisiert</dt><dd>{p.push.lastSync ?? "–"}</dd></div>
                  <div><dt>Sichtbarkeit</dt><dd>{p.diagnostics.visibility}</dd></div>
                </dl>

                <h4>Timer</h4>
                <dl className="diaggrid">
                  <div><dt>Letzte Prüfung</dt><dd>{p.diagnostics.lastCheck ?? "noch keine"}</dd></div>
                  <div><dt>Prüfungen</dt><dd>{p.diagnostics.checkCount}</dd></div>
                  <div><dt>Nächster exakter Timer</dt><dd>{p.diagnostics.nextTimer ?? "nicht geplant"}</dd></div>
                </dl>

                <h4>Erinnerungen</h4>
                <p className="statusline sub2">{p.remOn ? `An · ${p.remLead} Min vorher` : "Aus"}</p>
                {p.diagnostics.sessions.length ? (
                  <ul className="diagsessions">
                    {p.diagnostics.sessions.map((s) => (
                      <li key={s.id}><b>{s.start} · {s.title}</b><span>{Number.isFinite(s.minutes) ? `${Math.round(s.minutes)} Min · ` : ""}{s.status}</span></li>
                    ))}
                  </ul>
                ) : <p className="fine">Keine gemerkten Sessions.</p>}

                <div className="btnrow diagbuttons">
                  <button type="button" className="btn small" onClick={p.onCheckNow}>Jetzt prüfen</button>
                  <button type="button" className="btn small" onClick={p.onScheduleTest}>Test-Erinnerung in 1 Minute</button>
                  <button type="button" className="btn small" onClick={p.onResetNotified}>Erinnert-Liste zurücksetzen</button>
                  <button type="button" className="btn small" onClick={p.onCopyLog}>Log kopieren</button>
                  <button type="button" className="btn small" onClick={p.onClearLog}>Log leeren</button>
                </div>
                <p className="fine">Einmal mit offener App testen, einmal App in den Hintergrund legen, einmal Bildschirm sperren.</p>

                <h4>Log</h4>
                <pre className="diaglog" tabIndex={0}>{p.diagnostics.log.length ? p.diagnostics.log.join("\n") : "Noch keine Einträge."}</pre>
                {p.diagnostics.copyFallback && (
                  <textarea className="diagcopy" readOnly value={p.diagnostics.copyFallback} aria-label="Diagnose-Log zum manuellen Kopieren" />
                )}
              </div>
            </details>
          </section>
        </div>

      </div>
    </div>
  );
}

function updateMsgLine(msg: string | null) {
  if (!msg) return null;
  return (
    <p className="statusline sub2" role="status">
      {msg}
    </p>
  );
}
