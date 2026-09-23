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
  const mergedFor = useRef<string | null>(null);
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

  /* Profil, Rolle, Zusagen laden und mit localStorage vereinigen */
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setIsAdmin(false);
      setPublicIds({});
      mergedFor.current = null;
      remoteIds.current = new Set();
      return;
    }
    if (!online || mergedFor.current === userId) return;
    let cancelled = false;
    (async () => {
      const [{ data: p }, { data: roles }, { data: att }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, avatar_url, role_title, organisation, linkedin_url, visible, consent_at, profile_done").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("attendance").select("session_id, is_public").eq("user_id", userId),
      ]);
      if (cancelled) return;
      if (p) {
        setProfile(p as MyProfile);
        if (!p.profile_done) setFirstLogin(true);
      }
      setIsAdmin(!!roles?.some((r) => r.role === "admin"));
      const map: Record<string, boolean> = {};
      (att ?? []).forEach((a) => (map[a.session_id] = a.is_public));
      remoteIds.current = new Set(Object.keys(map));
      setPublicIds(map);
      mergedFor.current = userId;
      setSel((cur) => Array.from(new Set([...cur, ...Object.keys(map)])));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, online, setSel]);

  /* Änderungen der Auswahl nachsenden */
  useEffect(() => {
    if (!userId || !online || mergedFor.current !== userId) return;
    const t = setTimeout(async () => {
      const want = new Set(sel);
      const add = sel.filter((id) => !remoteIds.current.has(id));
      const del = [...remoteIds.current].filter((id) => !want.has(id));
      if (add.length) {
        const { error: e } = await supabase
          .from("attendance")
          .upsert(add.map((session_id) => ({ user_id: userId, session_id, is_public: false })), {
            onConflict: "user_id,session_id",
            ignoreDuplicates: true,
          });
        if (!e) add.forEach((id) => remoteIds.current.add(id));
      }
      if (del.length) {
        const { error: e } = await supabase.from("attendance").delete().eq("user_id", userId).in("session_id", del);
        if (!e) {
          del.forEach((id) => remoteIds.current.delete(id));
          setPublicIds((m) => {
            const n = { ...m };
            del.forEach((id) => delete n[id]);
            return n;
          });
          if (del.some((id) => publicIds[id])) void loadPeople();
        }
      }
    }, 800);
    return () => clearTimeout(t);
  }, [sel, userId, online, publicIds, loadPeople]);

  const login = useCallback(() => {
    if (configured === false) {
      setError(LI_ERRORS["config"]!);
      return;
    }
    window.location.href = `/api/public/auth/linkedin/start?return=${encodeURIComponent("/")}`;
  }, [configured]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    notify("Abgemeldet");
  }, [notify]);

  const saveProfile = useCallback(
    async (patch: Partial<Pick<MyProfile, "display_name" | "role_title" | "organisation" | "linkedin_url" | "visible" | "consent_at">>) => {
      if (!userId) return false;
      const { data, error: e } = await supabase
        .from("profiles")
        .update({ ...patch, profile_done: true })
        .eq("id", userId)
        .select("id, display_name, avatar_url, role_title, organisation, linkedin_url, visible, consent_at, profile_done")
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
    session, userId, profile, isAdmin, publicIds, people, stand, configured, firstLogin, error,
    clearError: () => setError(null), login, logout, saveProfile, setPublic, deleteAccount, setHidden, loadPeople,
  };
}
