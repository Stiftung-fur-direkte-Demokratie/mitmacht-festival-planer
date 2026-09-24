import { useEffect, useRef, useState } from "react";

/* Illustrationen im unDraw-Stil (flach, eine Akzentfarbe über Design-Tokens) */
const A = "var(--brand-red, #E63B2E)";
const D = "var(--ink, #0B3A2A)";
const L = "var(--line, #e5e7eb)";
const S = "var(--surface, #fff)";

function IlloWelcome() {
  return (
    <svg viewBox="0 0 240 160" aria-hidden="true">
      <ellipse cx="120" cy="150" rx="100" ry="8" fill={L} />
      <rect x="40" y="30" width="110" height="112" rx="10" fill={S} stroke={D} strokeWidth="2.5" />
      <rect x="40" y="30" width="110" height="22" rx="10" fill={D} />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} className="intro-row" style={{ animationDelay: `${0.15 * i}s` }}>
          <rect x="52" y={62 + i * 19} width="12" height="12" rx="3" fill={i === 1 ? A : L} />
          <rect x="70" y={64 + i * 19} width={i % 2 ? 50 : 66} height="8" rx="4" fill={L} />
        </g>
      ))}
      <g className="intro-float">
        <circle cx="178" cy="62" r="24" fill={A} />
        <text x="178" y="71" textAnchor="middle" fontSize="26" fontWeight="800" fill={D}>M</text>
      </g>
      <circle cx="190" cy="118" r="10" fill={D} />
      <path d="M176 150c0-18 7-26 14-26s14 8 14 26z" fill={A} />
    </svg>
  );
}

function IlloPush() {
  return (
    <svg viewBox="0 0 240 160" aria-hidden="true">
      <ellipse cx="120" cy="150" rx="90" ry="8" fill={L} />
      <rect x="82" y="14" width="76" height="136" rx="14" fill={D} />
      <rect x="88" y="24" width="64" height="116" rx="8" fill={S} />
      <g className="intro-drop">
        <rect x="93" y="40" width="54" height="26" rx="6" fill={A} />
        <rect x="99" y="47" width="30" height="5" rx="2.5" fill={S} />
        <rect x="99" y="56" width="40" height="4" rx="2" fill={S} opacity=".7" />
      </g>
      <rect x="95" y="76" width="50" height="6" rx="3" fill={L} />
      <rect x="95" y="88" width="38" height="6" rx="3" fill={L} />
      <g className="intro-ring" style={{ transformOrigin: "190px 50px" }}>
        <path d="M178 62c0-18 4-26 12-26s12 8 12 26z" fill={A} />
        <rect x="174" y="60" width="32" height="5" rx="2.5" fill={D} />
        <circle cx="190" cy="69" r="4" fill={D} />
      </g>
    </svg>
  );
}

function IlloInstall() {
  return (
    <svg viewBox="0 0 240 160" aria-hidden="true">
      <ellipse cx="120" cy="150" rx="90" ry="8" fill={L} />
      <rect x="70" y="14" width="100" height="136" rx="16" fill={D} />
      <rect x="77" y="24" width="86" height="116" rx="10" fill={S} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={87 + (i % 3) * 25} y={36 + Math.floor(i / 3) * 25} width="16" height="16" rx="4" fill={L} />
      ))}
      <g className="intro-pop" style={{ transformOrigin: "120px 108px" }}>
        <rect x="104" y="92" width="32" height="32" rx="8" fill={A} />
        <text x="120" y="115" textAnchor="middle" fontSize="18" fontWeight="800" fill={D}>M</text>
      </g>
      <g className="intro-float">
        <circle cx="196" cy="54" r="16" fill={A} />
        <path d="M196 46v16M188 54h16" stroke={S} strokeWidth="3.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function IlloLinkedIn() {
  return (
    <svg viewBox="0 0 240 160" aria-hidden="true">
      <ellipse cx="120" cy="150" rx="100" ry="8" fill={L} />
      <path d="M72 96 L168 96" stroke={L} strokeWidth="3" strokeDasharray="6 6" className="intro-dash" />
      {[
        [60, 96, A],
        [180, 96, D],
      ].map(([x, y, c], i) => (
        <g key={i}>
          <circle cx={x as number} cy={(y as number) - 26} r="14" fill={c as string} />
          <path d={`M${(x as number) - 22} ${(y as number) + 40}c0-30 10-44 22-44s22 14 22 44z`} fill={c as string} />
        </g>
      ))}
      <g className="intro-pop" style={{ transformOrigin: "120px 60px" }}>
        <rect x="100" y="40" width="40" height="40" rx="9" fill="#0A66C2" />
        <text x="120" y="70" textAnchor="middle" fontSize="22" fontWeight="800" fill="#fff">in</text>
      </g>
    </svg>
  );
}

export type IntroStep = "welcome" | "install" | "push" | "linkedin";

export function Intro({
  steps,
  ios,
  canInstall,
  loggedIn,
  onInstall,
  onPush,
  onLinkedIn,
  onClose,
}: {
  steps: IntroStep[];
  ios: boolean;
  canInstall: boolean;
  loggedIn: boolean;
  onInstall: () => void;
  onPush: () => Promise<void> | void;
  onLinkedIn: () => void;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;
  const next = () => (last ? onClose() : setI(i + 1));

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(".btn.primary")?.focus();
  }, [i]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  if (!step) return null;

  let illo, title: string, text: string, primary: string, action: () => void;
  if (step === "welcome") {
    illo = <IlloWelcome />;
    title = "Willkommen beim Mitmacht-Planer";
    text = "Stöbere im Festivalprogramm, merke dir Sessions für deine Agenda, lass dich erinnern, bewerte Sessions und vernetze dich mit anderen Teilnehmenden – alles auch offline.";
    primary = "Los geht's";
    action = next;
  } else if (step === "install") {
    illo = <IlloInstall />;
    title = "Zum Home-Bildschirm hinzufügen";
    text = ios
      ? "Tippe in Safari unten auf „Teilen“ und dann auf „Zum Home-Bildschirm“. So startet der Planer wie eine App – auch offline."
      : "Installiere den Planer als App: schneller Start, eigenes Symbol, funktioniert auch offline.";
    primary = canInstall ? "Jetzt installieren" : "Verstanden";
    action = () => {
      if (canInstall) onInstall();
      next();
    };
  } else if (step === "push") {
    illo = <IlloPush />;
    title = "Push-Meldungen aktivieren";
    text = "Wir erinnern dich kurz vor deinen Sessions und melden neue Nachrichten – auch wenn die App geschlossen ist.";
    primary = "Aktivieren";
    action = () => {
      void onPush();
      next();
    };
  } else {
    illo = <IlloLinkedIn />;
    title = "Mit LinkedIn verbinden";
    text = loggedIn
      ? "Du bist verbunden. Ergänze dein Profil, damit andere dich in der Community finden und kontaktieren können."
      : "Melde dich mit LinkedIn an, lege dein Profil an und sieh, wer sonst noch zu deinen Sessions kommt. Freiwillig – der Planer funktioniert auch ohne.";
    primary = loggedIn ? "Profil ergänzen" : "Mit LinkedIn anmelden";
    action = () => {
      onClose();
      onLinkedIn();
    };
  }

  return (
    <div className="sheet-backdrop onb-backdrop" onClick={onClose}>
      <div ref={ref} className="onb intro" role="dialog" aria-modal="true" aria-labelledby="intro-t" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="intro-skip" onClick={onClose}>Überspringen</button>
        <div className="intro-illo" key={step}>{illo}</div>
        <div className="intro-body" key={step + "b"}>
          <h2 id="intro-t">{title}</h2>
          <p>{text}</p>
        </div>
        <div className="intro-dots" aria-label={`Schritt ${i + 1} von ${steps.length}`}>
          {steps.map((s, n) => (
            <span key={s} className={n === i ? "on" : ""} />
          ))}
        </div>
        <div className="onb-actions">
          <button type="button" className="btn primary" onClick={action}>{primary}</button>
          {step !== "welcome" && (
            <button type="button" className="btn" onClick={next}>{last ? "Fertig" : "Später"}</button>
          )}
        </div>
      </div>
    </div>
  );
}
