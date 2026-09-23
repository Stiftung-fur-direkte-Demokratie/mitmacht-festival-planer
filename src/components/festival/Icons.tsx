export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-keynote" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="var(--keynote)" />
        </symbol>
        <symbol id="i-workshop" viewBox="0 0 24 24">
          <circle cx="15.5" cy="5.6" r="4" fill="var(--red)" />
          <circle cx="6.2" cy="11.4" r="4.4" fill="var(--red)" />
          <circle cx="16" cy="16.6" r="5.2" fill="var(--red)" />
        </symbol>
        <symbol id="i-panel" viewBox="0 0 24 24">
          <circle cx="4" cy="12.5" r="3.4" fill="var(--navy)" />
          <circle cx="12" cy="11.2" r="3" fill="var(--navy)" opacity=".75" />
          <circle cx="19.8" cy="12.5" r="3.6" fill="var(--navy)" />
        </symbol>
        <symbol id="i-fishbowl" viewBox="0 0 24 24">
          <circle cx="11" cy="13" r="10" fill="var(--sky)" />
          <circle cx="17.4" cy="6.4" r="4.4" fill="var(--bg)" />
          <circle cx="18" cy="6" r="2.6" fill="var(--sky)" />
        </symbol>
        <symbol id="i-strategie" viewBox="0 0 24 24">
          <circle cx="12" cy="15.4" r="5.6" fill="var(--red)" />
          <circle cx="3.6" cy="11.6" r="2.7" fill="var(--red)" />
          <circle cx="8.4" cy="5.4" r="2.7" fill="var(--red)" />
          <circle cx="15.6" cy="5.4" r="2.7" fill="var(--red)" />
          <circle cx="20.4" cy="11.6" r="2.7" fill="var(--red)" />
        </symbol>
        <symbol id="i-kultur" viewBox="0 0 24 24">
          <circle cx="10.8" cy="7.4" r="4.4" fill="var(--pink)" />
          <circle cx="19.6" cy="6.2" r="2" fill="var(--pink)" />
          <circle cx="7.2" cy="17.2" r="5" fill="var(--pink)" />
          <circle cx="16.8" cy="14.2" r="3.4" fill="var(--pink)" />
        </symbol>
        <symbol id="i-rahmen" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" fill="none" stroke="var(--ink-soft)" strokeWidth="2.2" />
          <circle cx="12" cy="12" r="2.6" fill="var(--ink-soft)" />
        </symbol>
        <symbol id="i-plus" viewBox="0 0 24 24">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            fill="none"
          />
        </symbol>
        <symbol id="i-check" viewBox="0 0 24 24">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </symbol>
        <symbol id="i-warn" viewBox="0 0 24 24">
          <path
            d="M12 3.5L2.5 20h19L12 3.5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M12 10v4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="12" cy="17.2" r="1.3" fill="currentColor" />
        </symbol>
        <symbol id="i-chev" viewBox="0 0 24 24">
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </symbol>
        <symbol id="i-cal" viewBox="0 0 24 24">
          <rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </symbol>
      </defs>
    </svg>
  );
}

export function Icon({ name, className = "ico" }: { name: string; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}
