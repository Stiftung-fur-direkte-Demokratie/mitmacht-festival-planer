import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Rating = {
  q_overall: number;
  q_content: number;
  q_interaction: number;
  comment: string;
  share_name: boolean;
};
type Queued = Rating & { sessionId: string };

const CLIENT_KEY = "mm-client-id";
const RATED_KEY = "mm-rated";
const QUEUE_KEY = "mm-feedback-queue";
const DISMISS_KEY = "mm-rate-dismissed";

function read<T>(k: string, fb: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? "null");
    return v ?? fb;
  } catch {
    return fb;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* voll */
  }
}
export function clientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function post(sessionId: string, r: Rating): Promise<{ ok: boolean; retry: boolean; error?: string }> {
  try {
    const t = await token();
    const res = await fetch("/api/public/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: JSON.stringify({
        sessionId,
        clientId: clientId(),
        q_overall: r.q_overall,
        q_content: r.q_content,
        q_interaction: r.q_interaction,
        comment: r.comment.trim() || null,
        shareName: r.share_name,
      }),
    });
    if (res.ok) return { ok: true, retry: false };
    const d = await res.json().catch(() => ({}));
    return { ok: false, retry: res.status >= 500 || res.status === 429, error: d.error ?? "Senden fehlgeschlagen" };
  } catch {
    return { ok: false, retry: true, error: "Keine Verbindung" };
  }
}

export function useFeedback(opts: { userId: string | null; online: boolean; notify: (m: string) => void }) {
  const { userId, online, notify } = opts;
  const [rated, setRated] = useState<Record<string, Rating>>({});
  const [queue, setQueue] = useState<Queued[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    setRated(read(RATED_KEY, {}));
    setQueue(read(QUEUE_KEY, []));
    setDismissed(read(DISMISS_KEY, []));
  }, []);

  const saveRated = (fn: (r: Record<string, Rating>) => Record<string, Rating>) =>
    setRated((cur) => {
      const n = fn(cur);
      write(RATED_KEY, n);
      return n;
    });
  const saveQueue = (fn: (q: Queued[]) => Queued[]) =>
    setQueue((cur) => {
      const n = fn(cur);
      write(QUEUE_KEY, n);
      return n;
    });

  // Eigene Bewertungen vom Server (angemeldet)
  useEffect(() => {
    if (!userId || !online) return;
    let off = false;
    (async () => {
      const t = await token();
      if (!t) return;
      const r = await fetch("/api/public/feedback", { headers: { Authorization: `Bearer ${t}` } }).catch(() => null);
      if (!r?.ok || off) return;
      const d = (await r.json()) as { items: (Omit<Rating, "comment"> & { session_id: string; comment: string | null })[] };
      saveRated((cur) => {
        const n = { ...cur };
        d.items.forEach((i) => (n[i.session_id] = { q_overall: i.q_overall, q_content: i.q_content, q_interaction: i.q_interaction, comment: i.comment ?? "", share_name: i.share_name }));
        return n;
      });
    })();
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, online]);

  // Warteschlange nachsenden
  const flush = useCallback(async () => {
    const q = read<Queued[]>(QUEUE_KEY, []);
    if (!q.length || !navigator.onLine) return;
    const rest: Queued[] = [];
    let sent = 0;
    for (const it of q) {
      const r = await post(it.sessionId, it);
      if (r.ok) sent++;
      else if (r.retry) rest.push(it);
    }
    saveQueue(() => rest);
    if (sent) notify(sent === 1 ? "Bewertung gesendet ✓" : `${sent} Bewertungen gesendet ✓`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify]);
  useEffect(() => {
    if (online) void flush();
  }, [online, userId, flush]);

  const submit = useCallback(
    async (sessionId: string, r: Rating): Promise<{ ok: boolean; queued?: boolean; error?: string }> => {
      saveRated((cur) => ({ ...cur, [sessionId]: r }));
      const enqueue = () => saveQueue((q) => [...q.filter((x) => x.sessionId !== sessionId), { ...r, sessionId }]);
      if (!navigator.onLine) {
        enqueue();
        return { ok: true, queued: true };
      }
      const res = await post(sessionId, r);
      if (res.ok) {
        saveQueue((q) => q.filter((x) => x.sessionId !== sessionId));
        return { ok: true };
      }
      if (res.retry) {
        enqueue();
        return { ok: true, queued: true };
      }
      return { ok: false, error: res.error };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const dismiss = (id: string) =>
    setDismissed((d) => {
      const n = [...new Set([...d, id])];
      write(DISMISS_KEY, n);
      return n;
    });

  return { rated, queuedIds: new Set(queue.map((q) => q.sessionId)), dismissed, dismiss, submit };
}

export async function adminFeedbackSummary() {
  const t = await token();
  const r = await fetch("/api/public/feedback/export?format=json", { headers: t ? { Authorization: `Bearer ${t}` } : {} });
  if (!r.ok) throw new Error("Laden fehlgeschlagen");
  return (await r.json()) as {
    total: number;
    sessions: { id: string; title: string; day: string; start: string; count: number; overall: number | null; content: number | null; interaction: number | null }[];
  };
}

export async function downloadFeedbackCsv(sessionId?: string) {
  const t = await token();
  const r = await fetch("/api/public/feedback/export" + (sessionId ? `?session=${encodeURIComponent(sessionId)}` : ""), {
    headers: t ? { Authorization: `Bearer ${t}` } : {},
  });
  if (!r.ok) throw new Error("Download fehlgeschlagen");
  const blob = await r.blob();
  const cd = r.headers.get("content-disposition") ?? "";
  const name = cd.match(/filename="([^"]+)"/)?.[1] ?? "mitmacht-2026-feedback.csv";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
