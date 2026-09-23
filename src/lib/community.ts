import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type CommunityPerson = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  role_title: string | null;
  organisation: string | null;
  linkedin_url: string | null;
  session_ids: string[];
  hidden: boolean;
  accept_messages: boolean;
};

export type MyProfile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role_title: string | null;
  organisation: string | null;
  linkedin_url: string | null;
  visible: boolean;
  consent_at: string | null;
  profile_done: boolean;
  accept_messages: boolean;
};

const CACHE_KEY = "mm-community-cache";

export const LI_ERRORS: Record<string, string> = {
  cancelled: "Die Anmeldung mit LinkedIn wurde abgebrochen.",
  state: "Die Anmeldung ist abgelaufen oder ungültig. Bitte noch einmal versuchen.",
  unreachable: "LinkedIn ist gerade nicht erreichbar. Bitte später noch einmal versuchen.",
  noemail: "Dein LinkedIn-Konto hat keine bestätigte E-Mail-Adresse. Bitte bestätige sie bei LinkedIn und versuche es erneut.",
  config: "Die LinkedIn-Anmeldung wird gerade eingerichtet und ist bald verfügbar.",
  failed: "Die Anmeldung mit LinkedIn hat nicht geklappt. Bitte noch einmal versuchen.",
};

export const LINKEDIN_URL_RE = /^https:\/\/www\.linkedin\.com\/in\/[A-Za-z0-9_%.-]+\/?$/;

/* Sync-Metadaten: changedAt nur bei echten Nutzeränderungen */
const SYNC_KEY = "mm-program-sync";
type SyncMeta = { changedAt: number; syncedUserId: string | null };
function readSyncMeta(): SyncMeta {
  try {
    const m = JSON.parse(localStorage.getItem(SYNC_KEY) ?? "{}");
    return { changedAt: Number(m.changedAt) || 0, syncedUserId: typeof m.syncedUserId === "string" ? m.syncedUserId : null };
  } catch {
    return { changedAt: 0, syncedUserId: null };
  }
}
function writeSyncMeta(m: SyncMeta) {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(m));
  } catch {
    /* voll */
  }
}
export function markProgramChanged() {
  writeSyncMeta({ ...readSyncMeta(), changedAt: Date.now() });
}
function clearSyncedUser() {
  writeSyncMeta({ ...readSyncMeta(), syncedUserId: null });
}

/** Normalisiert Eingaben zu https://www.linkedin.com/in/<vanity> oder null */
export function normalizeLinkedIn(input: string): string | null {
  let v = input.trim();
  if (!v) return null;
  let vanity: string | null = null;
  const bare = v.replace(/^@/, "");
  if (!/[/.:]/.test(bare) && /^[\p{L}\p{N}_%-]+$/u.test(bare)) {
    vanity = bare;
  } else {
    if (!/^https?:\/\//i.test(v)) v = "https://" + v;
    let u: URL;
    try {
      u = new URL(v);
    } catch {
      return null;
    }
    const host = u.hostname.toLowerCase();
    if (host !== "linkedin.com" && !/^[a-z]{1,3}\.linkedin\.com$/.test(host)) return null;
    const m = u.pathname.match(/^\/in\/([^/]+)/i);
    if (!m) return null;
    try {
      vanity = decodeURIComponent(m[1]!);
    } catch {
      vanity = m[1]!;
    }
  }
  if (!vanity || !/^[\p{L}\p{N}_%.-]+$/u.test(vanity)) return null;
  const enc = /^[A-Za-z0-9_%.-]+$/.test(vanity) ? vanity : encodeURIComponent(vanity);
  const out = `https://www.linkedin.com/in/${enc}`;
  return out.length <= 200 && LINKEDIN_URL_RE.test(out) ? out : null;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase() || "?";
}

export function useCommunity(opts: {
  sel: string[];
  setSel: (fn: (cur: string[]) => string[]) => void;
  online: boolean;
  notify: (msg: string) => void;
}) {
  const { sel, setSel, online, notify } = opts;
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [publicIds, setPublicIds] = useState<Record<string, boolean>>({});
  const [people, setPeople] = useState<CommunityPerson[]>([]);
  const [stand, setStand] = useState<number | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [firstLogin, setFirstLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<{ state: "idle" | "ok" | "error" | "offline"; at: number | null }>({ state: "idle", at: null });
  const remoteIds = useRef<Set<string>>(new Set());
  const userId = session?.user.id ?? null;

  /* Cache laden, Konfiguration prüfen, Fragment auswerten */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const c = JSON.parse(raw) as { t: number; list: CommunityPerson[] };
        if (Array.isArray(c.list)) {
          setPeople(c.list);
          setStand(c.t);
        }
      }
    } catch {
      /* ignorieren */
    }
    fetch("/api/public/auth/linkedin/status")
      .then((r) => r.json())
      .then((d) => setConfigured(!!d.configured))
      .catch(() => setConfigured(null));

    const hash = window.location.hash;
    const m = hash.match(/li_token=([^&]+)/);
    const e = hash.match(/li_error=([a-z]+)/);
    if (m || e) history.replaceState(null, "", window.location.pathname + window.location.search);
    if (e) setError(LI_ERRORS[e[1]!] ?? LI_ERRORS["failed"]!);
    if (m) {
      supabase.auth
        .verifyOtp({ token_hash: decodeURIComponent(m[1]!), type: "magiclink" })
        .then(({ error: vErr }) => {
          if (vErr) setError(LI_ERRORS["failed"]!);
          else notify("Mit LinkedIn angemeldet");
        });
    }

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_OUT") clearSyncedUser();
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
        setSession(s);
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPeople = useCallback(async () => {
    const { data, error: err } = await supabase.rpc("community_public");
    if (err || !data) return;
    const list = data as CommunityPerson[];
    const t = Date.now();
    setPeople(list);
    setStand(t);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ t, list }));
    } catch {
      /* voll */
    }
  }, []);

  useEffect(() => {
    if (online) void loadPeople();
  }, [online, loadPeople, userId]);

  /* Profil, Rolle laden */
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setIsAdmin(false);
      setPublicIds({});
      remoteIds.current = new Set();
      setSync({ state: "idle", at: null });
      return;
    }
    if (!online) return;
    let cancelled = false;
    (async () => {
      const [{ data: p }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, avatar_url, role_title, organisation, linkedin_url, visible, consent_at, profile_done, accept_messages").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      if (cancelled) return;
      if (p) {
        setProfile(p as MyProfile);
        if (!p.profile_done) setFirstLogin(true);
      }
      setIsAdmin(!!roles?.some((r) => r.role === "admin"));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, online]);

  /* Programm-Abgleich: erster Sync vereinigt, danach „last writer wins" */
  const selRef = useRef(sel);
  selRef.current = sel;
  const running = useRef(false);
  const rerun = useRef(false);
  const reconcile = useCallback(async (): Promise<void> => {
    if (!userId) return;
    if (!navigator.onLine) {
      setSync((s) => ({ ...s, state: "offline" }));
      return;
    }
    if (running.current) {
      rerun.current = true;
      return;
    }
    running.current = true;
    try {
      const meta = readSyncMeta();
      const [{ data: p, error: pe }, { data: att, error: ae }] = await Promise.all([
        supabase.from("profiles").select("program_updated_at").eq("id", userId).maybeSingle(),
        supabase.from("attendance").select("session_id, is_public").eq("user_id", userId),
      ]);
      if (pe || ae) throw pe || ae;
      const map: Record<string, boolean> = {};
      (att ?? []).forEach((a) => (map[a.session_id] = a.is_public));
      const remote = new Set(Object.keys(map));
      remoteIds.current = new Set(remote);
      setPublicIds(map);
      const remoteAt = p?.program_updated_at ? new Date(p.program_updated_at).getTime() : 0;
      const local = selRef.current;

      const pushTo = async (want: string[], at: number) => {
        const w = new Set(want);
        const add = want.filter((id) => !remote.has(id));
        const del = [...remote].filter((id) => !w.has(id));
        if (add.length) {
          const { error: e } = await supabase
            .from("attendance")
            .upsert(add.map((session_id) => ({ user_id: userId, session_id, is_public: false })), {
              onConflict: "user_id,session_id",
              ignoreDuplicates: true,
            });
          if (e) throw e;
          add.forEach((id) => remoteIds.current.add(id));
        }
        if (del.length) {
          const { error: e } = await supabase.from("attendance").delete().eq("user_id", userId).in("session_id", del);
          if (e) throw e;
          del.forEach((id) => remoteIds.current.delete(id));
          setPublicIds((m) => {
            const n = { ...m };
            del.forEach((id) => delete n[id]);
            return n;
          });
          if (del.some((id) => map[id])) void loadPeople();
        }
        const { error: e } = await supabase.from("profiles").update({ program_updated_at: new Date(at).toISOString() }).eq("id", userId);
        if (e) throw e;
      };

      if (meta.syncedUserId !== userId) {
        // Erster Sync dieses Geräts mit diesem Konto: vereinigen
        const union = Array.from(new Set([...local, ...remote]));
        const at = Date.now();
        await pushTo(union, at);
        writeSyncMeta({ changedAt: at, syncedUserId: userId });
        if (union.length !== local.length) setSel(() => union);
      } else if (remoteAt > meta.changedAt) {
        // Profil ist neuer: lokale Liste ersetzen
        writeSyncMeta({ ...meta, changedAt: remoteAt });
        const next = [...remote];
        const same = next.length === local.length && next.every((id) => local.includes(id));
        if (!same) setSel(() => next);
      } else {
        const same = local.length === remote.size && local.every((id) => remote.has(id));
        if (!same || remoteAt !== meta.changedAt) await pushTo(local, meta.changedAt || Date.now());
      }
      setSync({ state: "ok", at: Date.now() });
    } catch (e) {
      console.info("[mm-sync] Fehler", e);
      setSync((s) => ({ ...s, state: navigator.onLine ? "error" : "offline" }));
    } finally {
      running.current = false;
      if (rerun.current) {
        rerun.current = false;
        void reconcile();
      }
    }
  }, [userId, setSel, loadPeople]);

  // bei Login, Online-Wechsel und Änderungen der Auswahl (entprellt)
  useEffect(() => {
    if (!userId) return;
    if (!online) {
      setSync((s) => ({ ...s, state: "offline" }));
      return;
    }
    const t = setTimeout(() => void reconcile(), 800);
    return () => clearTimeout(t);
  }, [sel, userId, online, reconcile]);

  // beim Wieder-Sichtbarwerden erneut abgleichen; bei Fehler alle 30 s erneut
  useEffect(() => {
    if (!userId) return;
    const vis = () => {
      if (document.visibilityState === "visible") void reconcile();
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [userId, reconcile]);
  useEffect(() => {
    if (sync.state !== "error") return;
    const t = setTimeout(() => void reconcile(), 30000);
    return () => clearTimeout(t);
  }, [sync.state, reconcile]);

  const login = useCallback(() => {
    if (configured === false) {
      setError(LI_ERRORS["config"]!);
      return;
    }
    window.location.href = `/api/public/auth/linkedin/start?return=${encodeURIComponent("/")}`;
  }, [configured]);

  const logout = useCallback(async () => {
    clearSyncedUser();
    await supabase.auth.signOut();
    notify("Abgemeldet");
  }, [notify]);

  const saveProfile = useCallback(
    async (patch: Partial<Pick<MyProfile, "display_name" | "role_title" | "organisation" | "linkedin_url" | "visible" | "consent_at" | "accept_messages">>) => {
      if (!userId) return false;
      const { data, error: e } = await supabase
        .from("profiles")
        .update({ ...patch, profile_done: true })
        .eq("id", userId)
        .select("id, display_name, avatar_url, role_title, organisation, linkedin_url, visible, consent_at, profile_done, accept_messages")
        .maybeSingle();
      if (e || !data) {
        notify("Speichern fehlgeschlagen");
        return false;
      }
      setProfile(data as MyProfile);
      setFirstLogin(false);
      void loadPeople();
      return true;
    },
    [userId, notify, loadPeople],
  );

  const setPublic = useCallback(
    async (ids: string[], value: boolean) => {
      if (!userId || !ids.length) return;
      const { error: e } = await supabase
        .from("attendance")
        .upsert(ids.map((session_id) => ({ user_id: userId, session_id, is_public: value })), { onConflict: "user_id,session_id" });
      if (e) {
        notify("Freigabe fehlgeschlagen");
        return;
      }
      ids.forEach((id) => remoteIds.current.add(id));
      setPublicIds((m) => {
        const n = { ...m };
        ids.forEach((id) => (n[id] = value));
        return n;
      });
      void loadPeople();
    },
    [userId, notify, loadPeople],
  );

  const deleteAccount = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return false;
    const r = await fetch("/api/public/auth/account", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      notify("Löschen fehlgeschlagen");
      return false;
    }
    await supabase.auth.signOut();
    void loadPeople();
    notify("Konto und alle Daten gelöscht");
    return true;
  }, [notify, loadPeople]);

  const setHidden = useCallback(
    async (uid: string, hidden: boolean) => {
      const { error: e } = await supabase.rpc("admin_set_hidden", { _user_id: uid, _hidden: hidden });
      if (e) notify("Nicht erlaubt");
      else {
        notify(hidden ? "Profil ausgeblendet" : "Profil wieder sichtbar");
        void loadPeople();
      }
    },
    [notify, loadPeople],
  );

  return {
    sync, session, userId, profile, isAdmin, publicIds, people, stand, configured, firstLogin, error,
    clearError: () => setError(null), login, logout, saveProfile, setPublic, deleteAccount, setHidden, loadPeople,
  };
}
