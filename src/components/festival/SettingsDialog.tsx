import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import type { OfflineStatus } from "@/lib/pwa";

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
};

export function SettingsDialog(p: SettingsProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
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
          'button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])',
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
              <button type="button" className="btn small" onClick={p.onCheckUpdate}>
                Nach Updates suchen
              </button>
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
                    <b>iPhone/iPad:</b> Einstellungen → Mitteilungen → <b>Mitmacht 26</b> → Mitteilungen
                    erlauben.
                  </li>
                  <li>
                    <b>Android:</b> Einstellungen → Apps → <b>Mitmacht 26</b> → Benachrichtigungen.
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

            <p className="statusline sub2">
              {p.remCount === 0
                ? "Noch keine gemerkte Session bekommt eine Erinnerung."
                : `${p.remCount} gemerkte Session${p.remCount === 1 ? "" : "s"} bekommen eine Erinnerung.`}
              {p.remNext ? ` Nächste: ${p.remNext}.` : ""}
            </p>

            <ul className="fine">
              <li>
                Web-Apps können nur erinnern, solange die App geöffnet ist oder im Hintergrund noch
                läuft.
              </li>
              <li>Installationen und ganztägige Angebote (ab 3 Stunden) werden nicht erinnert.</li>
              <li>
                Garantiert auch bei geschlossener App: die Kalenderdatei in „Mein Programm" – sie
                enthält dieselbe Vorlaufzeit ({p.remLead} Minuten) als Weckzeit.
              </li>
            </ul>
          </section>
        </div>

        <div className="sheet-foot">
          <button type="button" className="btn primary" onClick={p.onClose}>
            Fertig
          </button>
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
