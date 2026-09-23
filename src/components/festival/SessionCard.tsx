import {
  FORMAT_LABEL,
  gLink,
  isLong,
  statusOf,
  timeLabel,
  type Item,
  type NowInfo,
  type DescBlock,
} from "@/lib/festival";
import { Icon } from "./Icons";

function Segments({ block }: { block: DescBlock }) {
  const links = block.links ?? [];
  if (!links.length) return <>{block.text}</>;
  // Text mit verlinkten Teilstücken zusammensetzen
  const nodes: React.ReactNode[] = [];
  let rest = block.text;
  let key = 0;
  links.forEach((l) => {
    const idx = rest.indexOf(l.text);
    if (idx === -1) return;
    if (idx > 0) nodes.push(<span key={key++}>{rest.slice(0, idx)}</span>);
    nodes.push(
      <a key={key++} href={l.url} target="_blank" rel="noopener noreferrer">
        {l.text}
      </a>,
    );
    rest = rest.slice(idx + l.text.length);
  });
  if (rest) nodes.push(<span key={key++}>{rest}</span>);
  return <>{nodes}</>;
}

function Details({ s }: { s: Item }) {
  const first = s.description?.[0];
  const showTeaser =
    !!s.teaser && (!first || first.text.slice(0, 40) !== s.teaser.slice(0, 40));
  return (
    <div className="more-panel" id={`m-${s.id}`}>
      {s.websiteTime && (
        <p className="webtime">
          <Icon name="warn" className="" />
          <span>
            Die Website nennt {s.websiteTime} Uhr, der Flyer {s.start}–{s.end} Uhr.
          </span>
        </p>
      )}
      {showTeaser && <p className="teaser">{s.teaser}</p>}
      {(s.description ?? []).map((b, i) =>
        b.type === "heading" ? (
          <h4 key={i}>
            <Segments block={b} />
          </h4>
        ) : (
          <p key={i} className={b.type === "listItem" ? "li" : undefined}>
            <Segments block={b} />
          </p>
        ),
      )}
      {!!(s.speakers ?? []).length && (
        <>
          <h4>Mit</h4>
          <ul className="people">
            {(s.speakers ?? []).map((p, i) => {
              const meta = [p.role, p.organisation].filter((x) => x && x !== p.name).join(" · ");
              return (
                <li key={i}>
                  <b>{p.name}</b>
                  {meta && <span>{meta}</span>}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {(s.category || s.url) && (
        <p className="src">
          {s.category && <span className="cat">{s.category}</span>}
          {s.url && (
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              Auf faktor-d.org ansehen ↗
            </a>
          )}
        </p>
      )}
    </div>
  );
}

export function SessionCard({
  s,
  now,
  selected,
  clashes,
  open,
  onToggleOpen,
  onPick,
  showTime,
  showLinks,
  gcalOpened,
  onOpenGcal,
  onUnmarkGcal,
  extra,
}: {
  s: Item;
  now: NowInfo;
  selected: boolean;
  clashes: Item[];
  open: boolean;
  onToggleOpen: (id: string) => void;
  onPick: (id: string) => void;
  showTime?: boolean;
  showLinks?: boolean;
  gcalOpened?: boolean;
  onOpenGcal?: (id: string) => void;
  onUnmarkGcal?: (id: string) => void;
  extra?: React.ReactNode;
}) {
  const st = statusOf(s, now);
  const hasDetails = !!(s.description?.length || s.speakers?.length || s.teaser || s.url);
  return (
    <article className={`card${selected ? " sel" : ""}${st === "past" ? " past" : ""}`} id={`c-${s.id}`}>
      <Icon name={s.format} />
      <div className="txt">
        {showTime && <p className="when">{timeLabel(s)}</p>}
        <p className="kind">{FORMAT_LABEL[s.format]}</p>
        <h3>{s.title}</h3>
        {s.subtitle && <p className="sub">{s.subtitle}</p>}
        {s.people && <p className="who">{s.people}</p>}
        {s.room && <p className="where">{s.room}</p>}
        {s.note && <p className="note">{s.note}</p>}
        {(st === "now" || (isLong(s) && s.format !== "rahmen") || s.websiteTime) && (
          <div className="tags">
            {st === "now" && <span className="tag now">Läuft gerade</span>}
            {isLong(s) && s.format !== "rahmen" && (
              <span className="tag long">
                Durchgehend {s.start}–{s.end}
              </span>
            )}
            {s.websiteTime && <span className="tag diff">Website: {s.websiteTime}</span>}
          </div>
        )}
        {selected && clashes.length > 0 && (
          <p className="clash">
            <Icon name="warn" className="" />
            <span>
              Überschneidet sich mit{" "}
              {clashes.map((o) => `„${o.title}“ (${o.start}–${o.end})`).join(", ")}
            </span>
          </p>
        )}
        {extra}
        {hasDetails && (
          <button
            type="button"
            className="more"
            aria-expanded={open}
            aria-controls={`m-${s.id}`}
            onClick={() => onToggleOpen(s.id)}
          >
            {open ? "Weniger anzeigen" : "Mehr erfahren"}
            <Icon name="chev" className="" />
          </button>
        )}
        {showLinks && (
          <div className="links">
            {gcalOpened ? (
              <>
                <span className="incal">
                  <Icon name="check" className="" />
                  In Google Kalender geöffnet
                </span>
                <a href={gLink(s)} target="_blank" rel="noopener noreferrer">
                  Nochmal öffnen ↗
                </a>
                <button type="button" className="linkbtn" onClick={() => onUnmarkGcal?.(s.id)}>
                  Markierung entfernen
                </button>
              </>
            ) : (
              <a
                href={gLink(s)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onOpenGcal?.(s.id)}
              >
                In Google Kalender öffnen ↗
              </a>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        className="pick"
        aria-pressed={selected}
        aria-label={
          (selected ? "Aus meinem Programm entfernen: " : "Zu meinem Programm hinzufügen: ") + s.title
        }
        onClick={() => onPick(s.id)}
      >
        <Icon name={selected ? "check" : "plus"} className="" />
      </button>
      {open && hasDetails && <Details s={s} />}
    </article>
  );
}
