import data from "@/data/programm.json";

export type DescBlock = {
  type: "heading" | "paragraph" | "listItem";
  text: string;
  links?: { text: string; url: string }[];
};
export type Speaker = { name: string; organisation?: string; role?: string };
export type Item = {
  id: string;
  date: string;
  start: string;
  end: string;
  format: string;
  title: string;
  people?: string;
  room?: string;
  note?: string;
  subtitle?: string;
  teaser?: string;
  websiteTime?: string;
  category?: string;
  url?: string;
  description?: DescBlock[];
  speakers?: Speaker[];
};
export type Day = { date: string; short: string; long: string; label: string };

export const FESTIVAL = data.festival as {
  name: string;
  tagline: string;
  dates: string;
  venue: string;
  entrance: string;
  timezone: string;
  areas: string[];
  rooms: string[];
  notes: string[];
  sources: string;
  programUrl: string;
};
export const DAYS = data.days as Day[];
export const ALL = data.items as Item[];
export const FORMATS = data.formats as { key: string; label: string }[];
export const FORMAT_LABEL: Record<string, string> = Object.fromEntries(
  FORMATS.map((f) => [f.key, f.label]),
);
export const SESSIONS = ALL.filter((s) => FORMAT_LABEL[s.format]);
export const BY_ID: Record<string, Item> = Object.fromEntries(SESSIONS.map((s) => [s.id, s]));
const ORDER: Record<string, number> = Object.fromEntries(SESSIONS.map((s, i) => [s.id, i]));

export function mins(t: string) {
  const p = t.split(":");
  return Number(p[0] ?? 0) * 60 + Number(p[1] ?? 0);
}
export function duration(s: Item) {
  return mins(s.end) - mins(s.start);
}
export function isLong(s: Item) {
  return duration(s) >= 180 || s.id === "mi00";
}
export function dayOf(date: string): Day {
  return DAYS.find((d) => d.date === date) ?? (DAYS[0] as Day);
}
export function timeLabel(s: Item) {
  return s.start === s.end ? s.start : `${s.start} – ${s.end}`;
}
export function bySchedule(a: Item, b: Item) {
  return (
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
    mins(a.start) - mins(b.start) ||
    mins(a.end) - mins(b.end) ||
    (ORDER[a.id] ?? 0) - (ORDER[b.id] ?? 0)
  );
}

export type NowInfo = { date: string; time: string };
export function nowBerlin(): NowInfo {
  try {
    const f = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const p: Record<string, string> = {};
    f.formatToParts(new Date()).forEach((x) => (p[x.type] = x.value));
    return {
      date: `${p["year"]}-${p["month"]}-${p["day"]}`,
      time: `${p["hour"] === "24" ? "00" : p["hour"]}:${p["minute"]}`,
    };
  } catch {
    return { date: "", time: "" };
  }
}
export function statusOf(s: Item, now: NowInfo): "" | "past" | "now" {
  if (!now.date) return "";
  if (s.date < now.date) return "past";
  if (s.date > now.date) return "";
  if (now.time >= s.end) return "past";
  if (now.time >= s.start) return "now";
  return "";
}

export function clashesFor(s: Item, selected: Item[]) {
  if (isLong(s)) return [];
  return selected.filter(
    (o) => o.id !== s.id && !isLong(o) && o.date === s.date && s.start < o.end && o.start < s.end,
  );
}

/* ---------- Suche ---------- */
const searchCache: Record<string, string> = {};
export function searchText(s: Item) {
  const cached = searchCache[s.id];
  if (cached != null) return cached;
  const parts: string[] = [
    s.title,
    s.people ?? "",
    s.room ?? "",
    s.note ?? "",
    s.subtitle ?? "",
    s.teaser ?? "",
    s.category ?? "",
    FORMAT_LABEL[s.format] ?? "",
  ];
  (s.description ?? []).forEach((b) => parts.push(b.text));
  (s.speakers ?? []).forEach((p) =>
    parts.push(p.name, p.organisation ?? "", p.role ?? ""),
  );
  return (searchCache[s.id] = parts.join(" ").toLowerCase());
}
export function matchesQuery(s: Item, q: string) {
  if (!q) return true;
  const hay = searchText(s);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((w) => {
    if (w.length <= 3) {
      const re = new RegExp(
        `(^|[^a-z0-9äöüß])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9äöüß])`,
      );
      return re.test(hay);
    }
    return hay.indexOf(w) !== -1;
  });
}

/* ---------- Kalender ---------- */
export function evLocation(s: Item) {
  const loc = s.room ?? "";
  if (/Tempel/.test(loc)) return "Tempel Garten, Tempelhofer Feld, Berlin";
  if (/^Extern/.test(loc)) return loc.replace(/^Extern – /, "") + ", Berlin";
  if (!loc) return "SRH Hochschule Berlin, Sonnenallee 221, 12059 Berlin";
  return loc + ", SRH Hochschule Berlin, Sonnenallee 221, 12059 Berlin";
}
export function evSummary(s: Item) {
  return "Mitmacht: " + s.title;
}
export function evDetails(s: Item) {
  const lines: string[] = [FORMAT_LABEL[s.format] + (s.people ? " mit " + s.people : "")];
  if (s.subtitle) lines.push(s.subtitle);
  if (s.room) lines.push("Ort: " + s.room);
  if (s.note) lines.push(s.note);
  if (s.websiteTime) lines.push("Hinweis: Die Website nennt " + s.websiteTime + " Uhr.");
  (s.description ?? []).forEach((b) =>
    (b.links ?? []).forEach((l) => {
      if (/Anmeldung/i.test(l.text)) lines.push("Anmeldung: " + l.url);
    }),
  );
  if (s.url) lines.push("Mehr: " + s.url);
  lines.push(
    "",
    "Mitmacht 2026 × reCampaign – Das Demokratiefestival für kollektive Strategien",
    "SRH Hochschule Berlin, Sonnenallee 221 A–F, 12059 Berlin",
  );
  return lines.join("\n");
}
export function gLink(s: Item) {
  const d = s.date.replace(/-/g, "");
  const t = (x: string) => x.replace(":", "") + "00";
  return (
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    "&text=" +
    encodeURIComponent(evSummary(s)) +
    "&dates=" +
    `${d}T${t(s.start)}/${d}T${t(s.end)}` +
    "&ctz=Europe%2FBerlin" +
    "&details=" +
    encodeURIComponent(evDetails(s)) +
    "&location=" +
    encodeURIComponent(evLocation(s))
  );
}

function icsEscape(v: string) {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
function fold(line: string) {
  if (line.length <= 73) return line;
  const out: string[] = [];
  let rest = line;
  out.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length) {
    out.push(" " + rest.slice(0, 72));
    rest = rest.slice(72);
  }
  return out.join("\r\n");
}
export function buildIcs(list: Item[]) {
  const stamp =
    new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mitmacht 2026//Programmplaner//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Mitmacht 2026 – Mein Programm",
    "X-WR-TIMEZONE:Europe/Berlin",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Berlin",
    "X-LIC-LOCATION:Europe/Berlin",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  list.forEach((s) => {
    const d = s.date.replace(/-/g, "");
    const t = (x: string) => x.replace(":", "") + "00";
    lines.push(
      "BEGIN:VEVENT",
      `UID:mitmacht2026-${s.id}@faktor-d.org`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Berlin:${d}T${t(s.start)}`,
      `DTEND;TZID=Europe/Berlin:${d}T${t(s.end)}`,
      fold(`SUMMARY:${icsEscape(evSummary(s))}`),
      fold(`DESCRIPTION:${icsEscape(evDetails(s))}`),
      fold(`LOCATION:${icsEscape(evLocation(s))}`),
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
