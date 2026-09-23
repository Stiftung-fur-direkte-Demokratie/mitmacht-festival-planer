import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type InboxItem = {
  conversation_id: string;
  partner_id: string;
  display_name: string;
  avatar_url: string | null;
  role_title: string | null;
  organisation: string | null;
  linkedin_url: string | null;
  partner_exists: boolean;
  last_body: string;
  last_sender: string;
  last_message_at: string;
  unread: number;
  blocked_me: boolean;
  can_reply: boolean;
};

export type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };
export type BlockedPerson = { user_id: string; display_name: string; avatar_url: string | null; created_at: string };
export type AdminReport = {
  id: string;
  created_at: string;
  reason: string;
  message_body_snapshot: string | null;
  reporter_name: string;
  reported_user_id: string | null;
  reported_name: string;
  reported_hidden: boolean;
};

export const MSG_MAX = 1000;
const CACHE_KEY = "mm-inbox-cache";

export const MSG_ERRORS: Record<string, string> = {
  auth: "Bitte melde dich erneut an.",
  body: "Die Nachricht muss 1–1000 Zeichen lang sein.",
  sender_hidden: "Dein Profil wurde ausgeblendet. Du kannst gerade keine Nachrichten senden.",
  gone: "Diese Person hat ihr Konto gelöscht.",
  blocked: "Hier sind keine Nachrichten möglich (blockiert).",
  rate_msg: "Du hast gerade sehr viele Nachrichten geschrieben. Bitte warte ein paar Minuten.",
  rate_conv: "Du hast heute schon 10 neue Unterhaltungen begonnen. Morgen geht es weiter.",
  not_reachable: "Diese Person empfängt gerade keine Nachrichten.",
  rate_report: "Du hast heute schon viele Meldungen geschickt. Bitte versuche es morgen wieder.",
  failed: "Senden fehlgeschlagen. Bitte noch einmal versuchen.",
};
export function msgError(code: string | undefined | null) {
  return MSG_ERRORS[code ?? "failed"] ?? MSG_ERRORS["failed"]!;
}
function rpcCode(e: { message?: string } | null) {
  return /mm:([a-z_]+)/.exec(e?.message ?? "")?.[1] ?? "failed";
}

type Cache = { userId: string; items: InboxItem[]; messages: Record<string, Message[]> };
function readCache(userId: string): Cache | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as Cache | null;
    return c && c.userId === userId ? c : null;
  } catch {
    return null;
  }
}
function writeCache(c: Cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* voll */
  }
}

export function useInbox(opts: { userId: string | null; online: boolean; isAdmin: boolean; openId: string | null }) {
  const { userId, online, isAdmin, openId } = opts;
  const [items, setItems] = useState<InboxItem[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [blocks, setBlocks] = useState<BlockedPerson[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loaded, setLoaded] = useState(false);
  const stateRef = useRef<{ items: InboxItem[]; messages: Record<string, Message[]> }>({ items: [], messages: {} });
  stateRef.current = { items, messages };
  const openRef = useRef(openId);
  openRef.current = openId;

  const persist = useCallback(
    (next: Partial<{ items: InboxItem[]; messages: Record<string, Message[]> }>) => {
      if (!userId) return;
      writeCache({ userId, items: next.items ?? stateRef.current.items, messages: next.messages ?? stateRef.current.messages });
    },
    [userId],
  );

  // Cache beim Login laden, beim Abmelden leeren
  useEffect(() => {
    if (!userId) {
      setItems([]);
      setMessages({});
      setBlocks([]);
      setReports([]);
      setLoaded(false);
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch {
        /* egal */
      }
      return;
    }
    const c = readCache(userId);
    if (c) {
      setItems(c.items);
      setMessages(c.messages);
    }
  }, [userId]);

  const loadInbox = useCallback(async () => {
    if (!userId || !navigator.onLine) return;
    const { data, error } = await supabase.rpc("inbox");
    if (error || !data) return;
    const list = data as InboxItem[];
    setItems(list);
    setLoaded(true);
    persist({ items: list });
  }, [userId, persist]);

  const loadMessages = useCallback(
    async (convId: string) => {
      if (!userId || !navigator.onLine) return;
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error || !data) return;
      const list = (data as Message[]).reverse();
      setMessages((m) => {
        const next = { ...m, [convId]: list };
        persist({ messages: next });
        return next;
      });
    },
    [userId, persist],
  );

  const markRead = useCallback(
    async (convId: string) => {
      if (!userId || !navigator.onLine) return;
      await supabase.rpc("mark_read", { _conversation_id: convId });
      setItems((l) => l.map((i) => (i.conversation_id === convId ? { ...i, unread: 0 } : i)));
    },
    [userId],
  );

  const loadBlocks = useCallback(async () => {
    if (!userId || !navigator.onLine) return;
    const { data } = await supabase.rpc("my_blocks");
    if (data) setBlocks(data as BlockedPerson[]);
  }, [userId]);

  const loadReports = useCallback(async () => {
    if (!userId || !isAdmin || !navigator.onLine) return;
    const { data } = await supabase.rpc("admin_reports");
    if (data) setReports(data as AdminReport[]);
  }, [userId, isAdmin]);

  useEffect(() => {
    if (!userId || !online) return;
    void loadInbox();
    void loadBlocks();
  }, [userId, online, loadInbox, loadBlocks]);
  useEffect(() => {
    if (online) void loadReports();
  }, [online, loadReports]);

  // Realtime: neue Nachrichten (RLS liefert nur eigene Unterhaltungen)
  useEffect(() => {
    if (!userId) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`mm-inbox-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        setMessages((cur) => {
          const list = cur[m.conversation_id];
          if (!list || list.some((x) => x.id === m.id)) return cur;
          const next = { ...cur, [m.conversation_id]: [...list, m].slice(-50) };
          persist({ messages: next });
          return next;
        });
        if (openRef.current === m.conversation_id && m.sender_id !== userId && document.visibilityState === "visible") {
          void supabase.rpc("mark_read", { _conversation_id: m.conversation_id });
        }
        if (t) clearTimeout(t);
        t = setTimeout(() => void loadInbox(), 400);
      })
      .subscribe();
    return () => {
      if (t) clearTimeout(t);
      void supabase.removeChannel(channel);
    };
  }, [userId, loadInbox, persist]);

  useEffect(() => {
    if (!userId) return;
    const vis = () => {
      if (document.visibilityState !== "visible") return;
      void loadInbox();
      if (openRef.current) {
        void loadMessages(openRef.current);
        void markRead(openRef.current);
      }
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [userId, loadInbox, loadMessages, markRead]);

  const send = useCallback(
    async (target: { conversationId?: string | null; to?: string | null }, body: string) => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return { ok: false as const, error: msgError("auth") };
      try {
        const r = await fetch("/api/public/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ conversationId: target.conversationId ?? null, to: target.to ?? null, body }),
        });
        const d = (await r.json().catch(() => ({}))) as { ok?: boolean; code?: string; conversationId?: string };
        if (!r.ok || !d.ok || !d.conversationId) return { ok: false as const, error: msgError(d.code) };
        await loadMessages(d.conversationId);
        void loadInbox();
        return { ok: true as const, conversationId: d.conversationId };
      } catch {
        return { ok: false as const, error: msgError("failed") };
      }
    },
    [loadMessages, loadInbox],
  );

  const block = useCallback(
    async (uid: string) => {
      const { error } = await supabase.rpc("block_user", { _other: uid });
      if (error) return false;
      void loadInbox();
      void loadBlocks();
      return true;
    },
    [loadInbox, loadBlocks],
  );
  const unblock = useCallback(
    async (uid: string) => {
      const { error } = await supabase.rpc("unblock_user", { _other: uid });
      if (error) return false;
      void loadInbox();
      void loadBlocks();
      return true;
    },
    [loadInbox, loadBlocks],
  );
  const report = useCallback(
    async (messageId: string | null, reported: string | null, reason: string) => {
      const { error } = await supabase.rpc("report_message", {
        _message_id: messageId as string,
        _reported: reported as string,
        _reason: reason.slice(0, 500),
      });
      if (error) return { ok: false, error: msgError(rpcCode(error)) };
      void loadReports();
      return { ok: true, error: null };
    },
    [loadReports],
  );

  const unreadTotal = items.reduce((n, i) => n + (i.unread || 0), 0);

  return {
    items, messages, blocks, reports, loaded, unreadTotal,
    loadInbox, loadMessages, markRead, send, block, unblock, report, loadReports,
  };
}

export function relTime(iso: string, now = Date.now()) {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t);
  const min = Math.round(diff / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const tz = "Europe/Berlin";
  const day = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: tz });
  const hm = new Date(t).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const today = day(new Date(now));
  const yest = day(new Date(now - 86400000));
  const d = day(new Date(t));
  if (d === today) return hm;
  if (d === yest) return `gestern ${hm}`;
  return new Date(t).toLocaleDateString("de-DE", { day: "numeric", month: "numeric", timeZone: tz }) + ` ${hm}`;
}

export function dayHeading(iso: string, now = Date.now()) {
  const tz = "Europe/Berlin";
  const day = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: tz });
  const d = day(new Date(iso));
  if (d === day(new Date(now))) return "Heute";
  if (d === day(new Date(now - 86400000))) return "Gestern";
  return new Date(iso).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
}

export function timeHM(iso: string) {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
}
