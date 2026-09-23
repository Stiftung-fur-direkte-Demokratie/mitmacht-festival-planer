// Gemeinsame Regeln für Session-Feedback (Client + Server)
import type { Item } from "@/lib/festival";

/** Letzter Bewertungstag: 7 Tage nach Festivalende (Ende des 03.10.2026, Berlin/CEST) */
export const FEEDBACK_DEADLINE_MS = Date.parse("2026-10-03T23:59:59+02:00");

/** Festival liegt komplett in der Sommerzeit (CEST, +02:00) */
export function sessionEndMs(s: Pick<Item, "date" | "end">) {
  return Date.parse(`${s.date}T${s.end}:00+02:00`);
}
export function canRateAt(s: Pick<Item, "date" | "end">, nowMs: number) {
  return nowMs >= sessionEndMs(s) - 10 * 60000 && nowMs <= FEEDBACK_DEADLINE_MS;
}
export const FEEDBACK_QUESTIONS = [
  { key: "q_overall", label: "Gesamteindruck" },
  { key: "q_content", label: "Inhalt & Relevanz" },
  { key: "q_interaction", label: "Interaktion & Moderation" },
] as const;
