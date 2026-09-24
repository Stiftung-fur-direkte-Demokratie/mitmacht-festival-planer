import { currentSubscription, ensureSubscription, pushHost, pushSupported, removeSubscription, requestTestPush, syncSubscription } from "@/lib/push-client";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useInbox, type InboxItem } from "@/lib/inbox";
import { AdminReports, ConversationSheet, InboxList, type ConvPartner } from "@/components/festival/Inbox";
import teamImgSrc from "@/assets/team-circles.png";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ALL,
  BY_ID,
  DAYS,
  FESTIVAL,
  FORMATS,
  FORMAT_LABEL,
  buildIcs,
  bySchedule,
  clashesFor,
  dayOf,
  gLink,
  isLong,
  matchesQuery,
  minutesUntilEnd,
  minutesUntilStart,
  nowBerlin,
  timeLabel,
  type Item,
  type NowInfo,
} from "@/lib/festival";
import {
  APP_BUILD,
  browserInfo,
  checkForUpdate,
  applyUpdate,
  reloadApp,
  isPreviewHost,
  deviceKind,
  isIos,
  isStandalone,
  offlineStatus,
  registerServiceWorker,
  resetOffline,
  showLocalNotification,
  swDisabled,
  swDisabledReason,
  type OfflineStatus,
} from "@/lib/pwa";
import { Icon, IconSprite } from "@/components/festival/Icons";
import {
  SettingsDialog,
  type PushInfo,
  type ReminderDiagnostics,
} from "@/components/festival/SettingsDialog";
import { SessionCard } from "@/components/festival/SessionCard";
import { AdminFeedback, FeedbackSheet } from "@/components/festival/Feedback";
import { useFeedback } from "@/lib/feedback";
import { canRateAt, sessionEndMs } from "@/lib/feedback-rules";
import { Avatar, AvatarStack, HeroFaces, CommunityView, LinkedInIcon, ProfileSheet } from "@/components/festival/Community";
import { markProgramChanged, useCommunity } from "@/lib/community";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mitmacht 2026 Programmplaner" },
      {
        name: "description",
        content:
          "Stell dir dein persönliches Programm für das Demokratiefestival Mitmacht 2026 × reCampaign zusammen und übernimm es in deinen Kalender.",
      },
      { property: "og:title", content: "Mitmacht 2026 Programmplaner" },
      {
        property: "og:description",
        content:
          "Persönliches Festivalprogramm für Mitmacht 2026 × reCampaign, 23.–26. September 2026 in Berlin.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Planner,
});

const LS_KEY = "mitmacht26-programm-v1";
const LS_UI = LS_KEY + "-ui";
const LS_PWA = "mitmacht26-pwa-v1";
const LS_REM = "mitmacht26-reminders-v1";
const LS_REM_LOG = "mitmacht26-reminder-log-v1";

type Stored = { sel: string[]; gcal: Record<string, { v: string; t: number }> };
type RemStore = { on: boolean; lead: number; notified: string[] };
type ReminderFallback = { kind: "failed" | "missed" | "due"; title: string; start: string; room: string | undefined };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

function Planner() {
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [gcal, setGcal] = useState<Record<string, { v: string; t: number }>>({});
  const [view, setView] = useState<"all" | "mine" | "community">("all");
  const [cmSub, setCmSub] = useState<"leute" | "postfach">("leute");
  const [pendingInbox, setPendingInbox] = useState<string | null>(null);
  const [rateId, setRateId] = useState<string | null>(null);
  const [openConv, setOpenConv] = useState<{ conversationId: string | null; partner: ConvPartner } | null>(null);
  const [loginReason, setLoginReason] = useState(false);
  const [msgPush, setMsgPush] = useState(false);
  const [day, setDay] = useState<string>(DAYS[0]!.date);
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const [now, setNow] = useState<NowInfo>({ date: "", time: "" });
  const [toast, setToast] = useState("");
  const [shareIds, setShareIds] = useState<string[] | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLElement | null>(null);

  /* ---- PWA ---- */
  const [swUpdate, setSwUpdate] = useState<{ apply: () => void } | null>(null);
  const [online, setOnline] = useState(true);
  const [installEvt, setInstallEvt] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [iosHintOff, setIosHintOff] = useState(false);
  const [rem, setRem] = useState<RemStore>({ on: false, lead: 10, notified: [] });
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("unsupported");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [serverBuild, setServerBuild] = useState<string | null>(null);
  const [newBuild, setNewBuild] = useState<string | null>(null);
  const [newBuildDismissed, setNewBuildDismissed] = useState<string | null>(null);
  const [showReloadApp, setShowReloadApp] = useState(false);
  const [offline, setOffline] = useState<OfflineStatus>("disabled");
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [remLog, setRemLog] = useState<string[]>([]);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [checkCount, setCheckCount] = useState(0);
  const [nextExactTimer, setNextExactTimer] = useState<string | null>(null);
  const [swDiag, setSwDiag] = useState({ registration: false, active: false, waiting: false });
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [reminderFallback, setReminderFallback] = useState<ReminderFallback | null>(null);
  const [testDueAt, setTestDueAt] = useState<number | null>(null);
  const [push, setPush] = useState<PushInfo>({
    supported: false, state: "off", error: null, subscribed: false, host: null, lastResponse: null, lastSync: null,
  });
  const pushActiveRef = useRef(false);
  pushActiveRef.current = push.state === "active";
  const exactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const testTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- Laden ---- */
  useEffect(() => {
    const n = nowBerlin();
    setNow(n);
    if (DAYS.some((d) => d.date === n.date)) setDay(n.date);
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Stored;
        if (s && Array.isArray(s.sel)) {
          setSel(s.sel.filter((id) => BY_ID[id]));
          if (s.gcal && typeof s.gcal === "object") setGcal(s.gcal);
        }
      }
      const rawUi = localStorage.getItem(LS_UI);
      if (rawUi) {
        const u = JSON.parse(rawUi) as { types?: string[] };
        if (Array.isArray(u.types)) setTypes(u.types.filter((t) => FORMAT_LABEL[t]));
      }
    } catch {
      /* ignore */
    }
    try {
      const rawPwa = localStorage.getItem(LS_PWA);
      if (rawPwa) {
        const u = JSON.parse(rawPwa) as { iosHintOff?: boolean };
        if (u.iosHintOff) setIosHintOff(true);
      }
      const rawRem = localStorage.getItem(LS_REM);
      if (rawRem) {
        const r = JSON.parse(rawRem) as Partial<RemStore>;
        setRem({
          on: !!r.on,
          lead: [5, 10, 15].includes(Number(r.lead)) ? Number(r.lead) : 10,
          notified: Array.isArray(r.notified) ? r.notified : [],
        });
      }
      const rawLog = localStorage.getItem(LS_REM_LOG);
      if (rawLog) {
        const entries = JSON.parse(rawLog) as unknown;
        if (Array.isArray(entries)) setRemLog(entries.filter((x): x is string => typeof x === "string").slice(-40));
      }
    } catch {
      /* ignore */
    }
    setStandalone(isStandalone());
    setIos(isIos());
    setOnline(navigator.onLine);
    if ("Notification" in window) setPerm(Notification.permission);
    const params = new URLSearchParams(window.location.search);
    const p = params.get("p");
    if (p) {
      const ids = p.split(",").map((x) => x.trim()).filter((id) => BY_ID[id]);
      if (ids.length) setShareIds(ids);
    }
    const focusId = params.get("s");
    const rateParam = params.get("rate");
    if (rateParam) {
      if (BY_ID[rateParam]) setRateId(rateParam);
      params.delete("rate");
      const qs = params.toString();
      history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : "") + window.location.hash);
    }
    const inboxId = params.get("inbox");
    if (inboxId && /^[0-9a-f-]{36}$/i.test(inboxId)) {
      setPendingInbox(inboxId);
      setView("community");
      setCmSub("postfach");
    }
    if (inboxId) {
      params.delete("inbox");
      const qs = params.toString();
      history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : "") + window.location.hash);
    }
    if (window.location.hash === "#einstellungen" || window.location.hash === "#diagnose") {
      setSettingsOpen(true);
      setDiagnosticsOpen(window.location.hash === "#diagnose");
    }
    if (window.location.hash === "#mein" || focusId) setView("mine");
    if (focusId) {
      setTimeout(() => {
        document.getElementById("c-" + focusId)?.scrollIntoView({ block: "center" });
      }, 400);
    }
    setReady(true);
  }, []);

  /* ---- Speichern ---- */
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ sel, gcal, updatedAt: Date.now() }));
    } catch {
      /* ignore */
    }
  }, [sel, gcal, ready]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(LS_UI, JSON.stringify({ types }));
    } catch {
      /* ignore */
    }
  }, [types, ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(LS_REM, JSON.stringify(rem));
    } catch {
      /* ignore */
    }
  }, [rem, ready]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(LS_PWA, JSON.stringify({ iosHintOff }));
    } catch {
      /* ignore */
    }
  }, [iosHintOff, ready]);

  /* ---- Uhrzeit-Status jede Minute ---- */
  useEffect(() => {
    const t = setInterval(() => setNow(nowBerlin()), 60000);
    return () => clearInterval(t);
  }, []);

  /* ---- Service Worker, Offline, Installation ---- */
  useEffect(() => {
    registerServiceWorker((apply) => setSwUpdate({ apply }));
    setOffline(offlineStatus());
    const offTick = setInterval(() => setOffline(offlineStatus()), 3000);
    const onHash = () => {
      if (window.location.hash === "#einstellungen" || window.location.hash === "#diagnose") {
        setSettingsOpen(true);
        setDiagnosticsOpen(window.location.hash === "#diagnose");
      }
    };
    window.addEventListener("hashchange", onHash);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const bip = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as InstallPromptEvent);
    };
    const installed = () => {
      setInstallEvt(null);
      setStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", bip);
    window.addEventListener("appinstalled", installed);
    const mq = window.matchMedia("(display-mode: standalone)");
    const mqChange = () => setStandalone(isStandalone());
    mq.addEventListener?.("change", mqChange);
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { type?: string; id?: string } | null;
      if (data && data.type === "open-session") {
        setView("mine");
        if (data.id) {
          setTimeout(
            () => document.getElementById("c-" + data.id)?.scrollIntoView({ block: "center" }),
            250,
          );
        }
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => {
      clearInterval(offTick);
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("beforeinstallprompt", bip);
      window.removeEventListener("appinstalled", installed);
      mq.removeEventListener?.("change", mqChange);
      navigator.serviceWorker?.removeEventListener("message", onMsg);
    };
  }, []);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  }, []);

  /* ---- Sticky-Titel ---- */
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const on = () => {
      const inset = document.querySelector(".sb-shield")?.getBoundingClientRect().height ?? 0;
      const heroBottom = document.querySelector(".hero")?.getBoundingClientRect().bottom ?? Infinity;
      setStuck(heroBottom <= inset + 1);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
    };
  }, []);

  /* ---- Community ---- */
  const cm = useCommunity({ sel, setSel, online, notify: showToast });
  const [profileOpen, setProfileOpen] = useState(false);
  const [liNudgeOff, setLiNudgeOff] = useState(true);
  useEffect(() => {
    try {
      setLiNudgeOff(localStorage.getItem("mm-li-nudge-dismissed") === "1");
    } catch {
      setLiNudgeOff(false);
    }
  }, []);
  const dismissLiNudge = () => {
    setLiNudgeOff(true);
    try {
      localStorage.setItem("mm-li-nudge-dismissed", "1");
    } catch {
      /* ignorieren */
    }
  };
  const fb = useFeedback({ userId: cm.userId, online, notify: showToast });
  const nowMs = now.date ? Date.parse(`${now.date}T${now.time}:00+02:00`) : 0;
  const [cmSession, setCmSession] = useState<string | null>(null);
  const inbox = useInbox({ userId: cm.userId, online, isAdmin: cm.isAdmin, openId: openConv?.conversationId ?? null });
  useEffect(() => {
    try {
      setMsgPush(localStorage.getItem("mm-msg-push") === "1");
    } catch {
      /* egal */
    }
  }, []);
  const blockedIds = useMemo(() => {
    const set = new Set(inbox.blocks.map((b) => b.user_id));
    inbox.items.forEach((i) => i.blocked_me && set.add(i.partner_id));
    return set;
  }, [inbox.blocks, inbox.items]);
  const openItem = (i: InboxItem) =>
    setOpenConv({
      conversationId: i.conversation_id,
      partner: { id: i.partner_id, name: i.display_name, avatar: i.avatar_url, role: i.role_title, org: i.organisation, linkedin: i.linkedin_url },
    });
  // Deep-Link /?inbox=<id>: öffnen, sobald Anmeldung und Postfach bekannt sind
  useEffect(() => {
    if (!pendingInbox || !cm.userId || !inbox.loaded) return;
    const it = inbox.items.find((i) => i.conversation_id === pendingInbox);
    if (it) openItem(it);
    setPendingInbox(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInbox, cm.userId, inbox.loaded, inbox.items]);
  const openConvId = openConv?.conversationId ?? null;
  useEffect(() => {
    if (!openConvId) return;
    void inbox.loadMessages(openConvId);
    void inbox.markRead(openConvId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openConvId]);
  useEffect(() => {
    if (!cm.userId) setOpenConv(null);
    else setLoginReason(false);
  }, [cm.userId]);
  const messagePerson = (x: { user_id: string; display_name: string; avatar_url: string | null; role_title: string | null; organisation: string | null; linkedin_url: string | null }) => {
    if (!cm.userId) {
      setLoginReason(true);
      setCmSub("postfach");
      scrollToBar();
      return;
    }
    const it = inbox.items.find((i) => i.partner_id === x.user_id);
    if (it) return openItem(it);
    setOpenConv({
      conversationId: null,
      partner: { id: x.user_id, name: x.display_name, avatar: x.avatar_url, role: x.role_title, org: x.organisation, linkedin: x.linkedin_url },
    });
  };
  useEffect(() => {
    if (cm.firstLogin) setProfileOpen(true);
  }, [cm.firstLogin]);
  useEffect(() => {
    if (cm.error) {
      showToast(cm.error);
      cm.clearError();
    }
  }, [cm.error, cm, showToast]);
  const peopleBySession = useMemo(() => {
    const m: Record<string, typeof cm.people> = {};
    cm.people.forEach((x) => {
      if (x.hidden) return;
      x.session_ids.forEach((id) => (m[id] ??= []).push(x));
    });
    return m;
  }, [cm.people]);
  const openCommunityFor = (id: string) => {
    setCmSession(id);
    setView("community");
    scrollToBar();
  };
  const cardExtra = (id: string, mine: boolean) => {
    const ps = peopleBySession[id] ?? [];
    const showToggle = mine && !!cm.userId;
    const it = BY_ID[id];
    const showRate = mine && !!it && canRateAt(it, nowMs);
    if (!ps.length && !showToggle && !showRate) return undefined;
    return (
      <>
        {showRate && (
          <button type="button" className={`btn small ratebtn${fb.rated[id] ? "" : " primary"}`} onClick={() => setRateId(id)}>
            {fb.rated[id] ? (fb.queuedIds.has(id) ? "Bewertet ✓ (wird gesendet) – ändern" : "Bewertet ✓ – ändern") : "Bewerten"}
          </button>
        )}
        <AvatarStack people={ps} onClick={() => openCommunityFor(id)} />
        {showToggle && (
          <label className="switch small pubtoggle">
            <input
              type="checkbox"
              checked={!!cm.publicIds[id]}
              disabled={!online}
              onChange={(e) => void cm.setPublic([id], e.target.checked)}
            />
            Öffentlich zeigen, dass ich dabei bin
          </label>
        )}
      </>
    );
  };

  const selected = useMemo(
    () => (sel.map((id) => BY_ID[id]).filter(Boolean) as Item[]).sort(bySchedule),
    [sel],
  );
  const clashesOf = useCallback((s: Item) => clashesFor(s, selected), [selected]);
  const rateBanner = useMemo(() => {
    if (!nowMs) return null;
    const c = selected
      .filter((s) => sessionEndMs(s) <= nowMs && canRateAt(s, nowMs) && !fb.rated[s.id] && !fb.dismissed.includes(s.id))
      .sort((a, b) => sessionEndMs(b) - sessionEndMs(a));
    return c[0] ?? null;
  }, [selected, nowMs, fb.rated, fb.dismissed]);

  /* ---- Lokale Erinnerungen ---- */
  const remRef = useRef(rem);
  remRef.current = rem;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const processingRef = useRef(new Set<string>());

  const addReminderLog = useCallback((message: string) => {
    const line = `${new Date().toLocaleTimeString("de-DE")} · ${message}`;
    console.info("[mm-reminder]", message);
    setRemLog((current) => {
      const next = [...current, line].slice(-40);
      try {
        localStorage.setItem(LS_REM_LOG, JSON.stringify(next));
      } catch {
        /* Diagnose bleibt zumindest bis zum Neuladen sichtbar. */
      }
      return next;
    });
  }, []);

  const refreshSwDiagnostics = useCallback(async () => {
    if (!("serviceWorker" in navigator)) {
      setSwDiag({ registration: false, active: false, waiting: false });
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      setSwDiag({
        registration: !!registration,
        active: !!registration?.active,
        waiting: !!registration?.waiting,
      });
    } catch {
      setSwDiag({ registration: false, active: false, waiting: false });
    }
  }, []);

  const notifySession = useCallback(async (s: Item, n: NowInfo) => {
    if (processingRef.current.has(s.id)) return;
    processingRef.current.add(s.id);
    const u = Math.max(0, Math.round(minutesUntilStart(s, n)));
    const title = u <= 0 ? `Jetzt: ${s.title}` : `In ${u} Min: ${s.title}`;
    addReminderLog(`fällig: ${s.id} · ${s.title}`);
    if (pushActiveRef.current) {
      // Push vom Server übernimmt die Systemmeldung – hier nur In-App-Banner.
      addReminderLog(`Push aktiv – nur In-App-Banner: ${s.id}`);
      setReminderFallback({ kind: "due", title: s.title, start: s.start, room: s.room });
      setRem((current) => current.notified.includes(s.id)
        ? current
        : { ...current, notified: [...current.notified, s.id] });
      processingRef.current.delete(s.id);
      return;
    }
    const result = await showLocalNotification(title, {
      body: `${s.start}–${s.end}${s.room ? " · " + s.room : ""}`,
      tag: s.id,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    });
    if (result.ok) {
      addReminderLog(`angezeigt via ${result.via}: ${s.id}`);
      setRem((current) => current.notified.includes(s.id)
        ? current
        : { ...current, notified: [...current.notified, s.id] });
    } else {
      const reason = result.error ?? "unbekannter Fehler";
      addReminderLog(`Fehler: ${s.id} · ${reason}`);
      setReminderFallback({ kind: "failed", title: s.title, start: s.start, room: s.room });
      showToast(`Erinnerung fehlgeschlagen: ${reason}`);
      navigator.vibrate?.(200);
    }
    processingRef.current.delete(s.id);
    void refreshSwDiagnostics();
  }, [addReminderLog, refreshSwDiagnostics, showToast]);

  const checkReminders = useCallback((reason = "Timer", includeMissed = false) => {
    const n = nowBerlin();
    setNow(n);
    const r = remRef.current;
    const checkedAt = new Date().toLocaleTimeString("de-DE");
    setLastCheck(checkedAt);
    setCheckCount((count) => count + 1);
    addReminderLog(`Prüfung (${reason}) · ${n.date} ${n.time}`);
    if (!r.on) return;
    const due = selectedRef.current.filter((s) => {
      if (isLong(s) || r.notified.includes(s.id)) return false;
      const u = minutesUntilStart(s, n);
      return u <= r.lead && u > -1;
    });
    due.forEach((s) => void notifySession(s, n));
    if (includeMissed) {
      const missed = selectedRef.current
        .filter((s) => !isLong(s) && !r.notified.includes(s.id))
        .map((s) => ({ s, minutes: minutesUntilStart(s, n) }))
        .filter(({ minutes }) => minutes < 0 && minutes >= -15)
        .sort((a, b) => b.minutes - a.minutes)[0];
      if (missed) {
        addReminderLog(`verpasst: ${missed.s.id} · Beginn ${missed.s.start}`);
        setReminderFallback({ kind: "missed", title: missed.s.title, start: missed.s.start, room: missed.s.room });
      }
    }
  }, [addReminderLog, notifySession]);

  useEffect(() => {
    checkReminders("Start");
    const t = setInterval(() => checkReminders("30-Sekunden-Timer"), 30000);
    const vis = () => {
      addReminderLog(document.hidden ? "App versteckt" : "App sichtbar");
      if (!document.hidden) checkReminders("sichtbar", true);
    };
    const focus = () => checkReminders("Fokus", true);
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("focus", focus);
    };
  }, [addReminderLog, checkReminders]);

  // Sofort prüfen, wenn sich Einstellungen oder Auswahl ändern
  useEffect(() => {
    if (!ready) return;
    checkReminders("Änderung");
  }, [ready, rem.on, rem.lead, sel, perm, checkReminders]);

  useEffect(() => {
    if (!settingsOpen) return;
    void refreshSwDiagnostics();
  }, [settingsOpen, refreshSwDiagnostics]);

  /* Exakt zum nächsten Erinnerungszeitpunkt prüfen; Browser können Timer im Hintergrund drosseln. */
  useEffect(() => {
    if (exactTimerRef.current) clearTimeout(exactTimerRef.current);
    setNextExactTimer(null);
    if (!ready || !rem.on) return;
    const n = nowBerlin();
    const next = selected
      .filter((s) => !isLong(s) && !rem.notified.includes(s.id))
      .map((s) => ({ s, delay: (minutesUntilStart(s, n) - rem.lead) * 60000 }))
      .filter(({ delay }) => delay > 0)
      .sort((a, b) => a.delay - b.delay)[0];
    if (!next) return;
    const delay = Math.min(next.delay, 2147483000);
    const target = new Date(Date.now() + delay);
    setNextExactTimer(`${target.toLocaleString("de-DE")} · ${next.s.title}`);
    addReminderLog(`exakter Timer geplant: ${next.s.id} in ${Math.round(delay / 60000)} Min`);
    exactTimerRef.current = setTimeout(() => checkReminders("exakter Timer"), delay);
    return () => {
      if (exactTimerRef.current) clearTimeout(exactTimerRef.current);
    };
  }, [addReminderLog, checkReminders, ready, rem.lead, rem.notified, rem.on, selected]);


  const upcoming = useMemo(() => {
    if (!now.date) return null;
    const live = selected.find(
      (s) => !isLong(s) && minutesUntilStart(s, now) <= 0 && minutesUntilEnd(s, now) > 0,
    );
    if (live) return { s: live, live: true, mins: 0 };
    const soon = selected
      .filter((s) => !isLong(s))
      .map((s) => ({ s, u: minutesUntilStart(s, now) }))
      .filter((x) => x.u > 0 && x.u <= 60)
      .sort((a, b) => a.u - b.u)[0];
    return soon ? { s: soon.s, live: false, mins: soon.u } : null;
  }, [selected, now]);

  const remStats = useMemo(() => {
    const list = selected.filter((s) => !isLong(s));
    const next = now.date
      ? list.find((s) => minutesUntilStart(s, now) > 0)
      : list[0];
    const d = next ? dayOf(next.date) : null;
    return {
      count: list.length,
      next: next ? `${d ? d.short + " " : ""}${next.start} Uhr · ${next.title}` : null,
    };
  }, [selected, now]);

  const diagnosticSessions = useMemo(() => selected
    .map((s) => {
      const minutes = minutesUntilStart(s, now);
      const status = isLong(s)
        ? "übersprungen (≥ 3 h)"
        : rem.notified.includes(s.id)
          ? "erinnert"
          : minutes < 0 && minutes >= -15
            ? "verpasst"
            : minutes <= rem.lead && minutes >= 0
              ? "fällig"
              : "wartet";
      return { id: s.id, title: s.title, start: s.start, minutes, status };
    })
    .filter((s) => s.minutes >= -15)
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, 5), [now, rem.lead, rem.notified, selected]);

  const diagnostics: ReminderDiagnostics = {
    device: deviceKind(),
    browser: browserInfo(),
    notificationSupported: typeof window !== "undefined" && "Notification" in window,
    swSupported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    swDisabledReason: typeof window !== "undefined" ? swDisabledReason() : "Server-Ansicht",
    swController: typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller,
    swRegistration: swDiag.registration,
    swActive: swDiag.active,
    swWaiting: swDiag.waiting,
    build: APP_BUILD,
    berlinTime: now.date && now.time ? `${now.date} ${now.time}` : "unbekannt",
    deviceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unbekannt",
    visibility: typeof document !== "undefined" ? document.visibilityState : "unbekannt",
    lastCheck,
    checkCount,
    nextTimer: testDueAt
      ? `${new Date(testDueAt).toLocaleString("de-DE")} · Diagnose-Test`
      : nextExactTimer,
    sessions: diagnosticSessions,
    log: remLog,
    copyFallback,
  };

  const askPermission = async () => {
    if (typeof Notification === "undefined") {
      showToast("Benachrichtigungen werden hier nicht unterstützt");
      return;
    }
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p === "granted") {
        setRem((r) => ({ ...r, on: true }));
        showToast("Erinnerungen aktiviert");
      } else {
        showToast("Benachrichtigungen nicht erlaubt");
      }
    } catch {
      showToast("Benachrichtigungen nicht möglich");
    }
  };

  const enableMsgPush = async () => {
    try {
      localStorage.setItem("mm-msg-push", "1");
    } catch {
      /* egal */
    }
    setMsgPush(true);
    if (typeof Notification === "undefined") {
      showToast("Benachrichtigungen werden hier nicht unterstützt");
      return;
    }
    if (Notification.permission !== "granted") {
      try {
        const res = await Notification.requestPermission();
        setPerm(res);
        if (res !== "granted") return showToast("Benachrichtigungen nicht erlaubt");
      } catch {
        return showToast("Benachrichtigungen nicht möglich");
      }
    }
    showToast("Push für Nachrichten wird eingerichtet");
  };

  const installApp = async () => {
    if (!installEvt) return;
    await installEvt.prompt();
    await installEvt.userChoice;
    setInstallEvt(null);
  };

  /* ---- Erstes Öffnen: Installations- und Push-Hinweis ---- */
  const [onboard, setOnboard] = useState<null | "install" | "push">(null);
  const onboardQueue = useRef<("install" | "push")[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (localStorage.getItem("mm-onboard-done")) return;
        localStorage.setItem("mm-onboard-done", "1");
      } catch {
        return;
      }
      if (window.self !== window.top && !/[?&]onboard/.test(location.search)) return;
      const q: ("install" | "push")[] = [];
      const sa = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!sa) q.push("install");
      if (typeof Notification !== "undefined" && Notification.permission === "default" && !(isIos() && !sa)) q.push("push");
      onboardQueue.current = q.slice(1);
      if (q[0]) setOnboard(q[0]);
    }, 1200);
    return () => clearTimeout(t);
  }, []);
  const closeOnboard = () => setOnboard(onboardQueue.current.shift() ?? null);

  const openSettings = () => {
    setUpdateMsg(null);
    setSettingsOpen(true);
  };

  const closeSettings = () => {
    setSettingsOpen(false);
    if (window.location.hash === "#einstellungen" || window.location.hash === "#diagnose") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };

  const runApplyUpdate = async (build: string) => {
    setUpdateBusy(true);
    showToast("App wird aktualisiert …");
    await applyUpdate(build);
  };

  const doCheckUpdate = async () => {
    setUpdateBusy(true);
    setShowReloadApp(false);
    setUpdateMsg("Suche nach Updates …");
    const res = await checkForUpdate();
    if (res.status === "available") {
      setServerBuild(res.build);
      setNewBuild(res.build);
      setUpdateMsg("Neue Version verfügbar");
      await runApplyUpdate(res.build);
      return;
    }
    setUpdateBusy(false);
    if (res.status === "current") {
      setServerBuild(res.build);
      setUpdateMsg(`Du hast die neueste Version (Build ${res.build}).`);
      setShowReloadApp(true);
    } else if (res.status === "offline") {
      setUpdateMsg("Offline – Update-Prüfung ist nur mit Internet möglich.");
    } else {
      setUpdateMsg(`Update-Prüfung fehlgeschlagen: ${res.error}`);
      setShowReloadApp(true);
    }
  };

  const doReloadApp = () => {
    setUpdateBusy(true);
    showToast("App wird neu geladen …");
    void reloadApp();
  };

  /* Automatische Versionsprüfung beim Start und beim Zurückkehren (max. alle 5 Min.) */
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (isPreviewHost() && sp.get("sw") !== "on") return;
    let last = 0;
    const check = async () => {
      if (!navigator.onLine || document.visibilityState !== "visible") return;
      if (Date.now() - last < 5 * 60 * 1000) return;
      last = Date.now();
      const res = await checkForUpdate();
      if (res.status === "available" || res.status === "current") setServerBuild(res.build);
      if (res.status === "available") setNewBuild(res.build);
    };
    void check();
    const onVis = () => void check();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const doResetOffline = () => {
    void resetOffline();
  };

  /* ---- Server-Push ---- */
  const pushSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncPush = useCallback(async () => {
    const supported = pushSupported();
    const stamp = () => new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    const wantPush = rem.on || (msgPush && !!cm.userId);
    if (!wantPush) {
      const had = await currentSubscription().catch(() => null);
      if (had) {
        if (!navigator.onLine) return;
        try {
          await removeSubscription();
          addReminderLog("Push abgemeldet, Serverdaten gelöscht");
          setPush((p) => ({ ...p, supported, state: "off", error: null, subscribed: false, host: null, lastResponse: "gelöscht", lastSync: stamp() }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          addReminderLog(`Push-Abmeldung fehlgeschlagen: ${msg}`);
          setPush((p) => ({ ...p, state: "error", error: msg, lastResponse: msg }));
        }
      } else setPush((p) => ({ ...p, supported, state: "off", error: null, subscribed: false, host: null }));
      return;
    }
    if (ios && !standalone) {
      setPush((p) => ({ ...p, supported, state: "ios-install", error: null }));
      return;
    }
    if (!supported) {
      setPush((p) => ({ ...p, supported, state: "unavailable", error: "Browser unterstützt kein Push" }));
      return;
    }
    if (perm !== "granted") {
      setPush((p) => ({ ...p, supported, state: "unavailable", error: "Benachrichtigungen noch nicht erlaubt" }));
      return;
    }
    if (swDisabled()) {
      setPush((p) => ({ ...p, supported, state: "unavailable", error: "Service Worker hier nicht aktiv (Vorschau)" }));
      return;
    }
    if (!navigator.onLine) {
      addReminderLog("Push-Sync verschoben: offline");
      return;
    }
    setPush((p) => (p.state === "active" ? p : { ...p, supported, state: "pending" }));
    try {
      const sub = await ensureSubscription();
      const token = cm.userId ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null;
      await syncSubscription(
        sub,
        rem.on ? selectedRef.current.filter((x) => !isLong(x)).map((x) => x.id) : [],
        rem.lead,
        deviceKind(),
        token,
      );
      addReminderLog(`Push synchronisiert (${pushHost(sub)})`);
      setPush({ supported, state: "active", error: null, subscribed: true, host: pushHost(sub), lastResponse: "ok", lastSync: stamp() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const detail = (e as { detail?: string } | null)?.detail;
      addReminderLog(`Push-Fehler: ${msg}${detail ? ` – Details: ${detail}` : ""}`);
      const sub = await currentSubscription().catch(() => null);
      setPush((p) => ({ ...p, supported, state: "error", error: msg, subscribed: !!sub, host: pushHost(sub), lastResponse: msg }));
    }
  }, [addReminderLog, ios, perm, rem.lead, rem.on, standalone, msgPush, cm.userId]);

  useEffect(() => {
    if (!ready) return;
    if (pushSyncRef.current) clearTimeout(pushSyncRef.current);
    pushSyncRef.current = setTimeout(() => void syncPush(), 2000);
    return () => {
      if (pushSyncRef.current) clearTimeout(pushSyncRef.current);
    };
  }, [ready, sel, syncPush]);

  useEffect(() => {
    const again = () => void syncPush();
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, [syncPush]);

  // Nach fehlgeschlagenem Sync erneut versuchen (Einstellungen geöffnet / App sichtbar)
  const pushErrRef = useRef(false);
  pushErrRef.current = push.state === "error";
  useEffect(() => {
    if (settingsOpen && pushErrRef.current) void syncPush();
  }, [settingsOpen, syncPush]);
  useEffect(() => {
    const vis = () => {
      if (document.visibilityState === "visible" && pushErrRef.current) void syncPush();
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [syncPush]);

  const testPush = async () => {
    try {
      await requestTestPush();
      addReminderLog("Test-Push beim Server bestellt (in ca. 1 Minute)");
      setPush((p) => ({ ...p, lastResponse: "Test geplant" }));
      showToast("Test-Push kommt in etwa 1 Minute");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addReminderLog(`Test-Push fehlgeschlagen: ${msg}`);
      setPush((p) => ({ ...p, lastResponse: msg }));
      showToast(`Test-Push fehlgeschlagen: ${msg}`);
    }
  };

  const testNotification = async () => {
    const title = "Test: Erinnerungen funktionieren";
    const opts: NotificationOptions = {
      body: `So sieht eine Erinnerung ${rem.lead} Minuten vor einer Session aus.`,
      tag: "mm-test",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    };
    const result = await showLocalNotification(title, opts);
    const text = result.ok
      ? result.via === "sw" ? "Über Service Worker angezeigt" : "Direkt angezeigt"
      : `Fehlgeschlagen: ${result.error ?? "unbekannter Grund"}`;
    addReminderLog(`Test: ${text}`);
    showToast(text);
    void refreshSwDiagnostics();
  };

  const scheduleTestReminder = () => {
    if (testTimerRef.current) clearTimeout(testTimerRef.current);
    const dueAt = Date.now() + 60000;
    setTestDueAt(dueAt);
    addReminderLog(`Test-Erinnerung geplant: ${new Date(dueAt).toLocaleTimeString("de-DE")}`);
    showToast("Test-Erinnerung für in 1 Minute geplant");
    testTimerRef.current = setTimeout(() => {
      const n = nowBerlin();
      const fake: Item = {
        id: `diagnose-test-${dueAt}`,
        date: n.date,
        start: n.time,
        end: n.time,
        format: "rahmen",
        title: "Diagnose-Test-Erinnerung",
        room: "Test auf diesem Gerät",
      };
      addReminderLog("fällig: Diagnose-Test-Erinnerung");
      void notifySession(fake, n);
      setTestDueAt(null);
    }, 60000);
  };

  useEffect(() => () => {
    if (testTimerRef.current) clearTimeout(testTimerRef.current);
  }, []);

  const resetNotified = () => {
    setRem((current) => ({ ...current, notified: [] }));
    addReminderLog("Erinnert-Liste zurückgesetzt");
    showToast("Erinnert-Liste zurückgesetzt");
  };

  const clearReminderLog = () => {
    setRemLog([]);
    setCopyFallback(null);
    try { localStorage.removeItem(LS_REM_LOG); } catch { /* ignore */ }
    console.info("[mm-reminder]", "Log geleert");
  };

  const copyReminderLog = async () => {
    const text = remLog.join("\n") || "Noch keine Diagnose-Einträge.";
    try {
      await navigator.clipboard.writeText(text);
      setCopyFallback(null);
      showToast("Log kopiert");
    } catch {
      setCopyFallback(text);
      showToast("Log unten markieren und kopieren");
    }
  };

  const togglePick = (id: string) => {
    const s = BY_ID[id];
    if (!s) return;
    if (sel.includes(id)) {
      markProgramChanged();
      setSel(sel.filter((x) => x !== id));
      showToast("Aus deinem Programm entfernt");
    } else {
      const cl = clashesFor(s, selected);
      markProgramChanged();
      setSel([...sel, id]);
      showToast(cl.length ? "Gemerkt – mit Überschneidung" : "Zu deinem Programm hinzugefügt");
    }
  };
  const toggleOpen = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const toggleType = (t: string) =>
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const matches = useCallback(
    (s: Item) => {
      if (types.length && !types.includes(s.format)) return false;
      return matchesQuery(s, q);
    },
    [types, q],
  );

  const scrollToBar = (behavior: ScrollBehavior = "auto", always = false) => {
    const inset = document.querySelector(".sb-shield")?.getBoundingClientRect().height ?? 0;
    const hero = document.querySelector(".hero");
    // Natürliche Position der Leiste = Unterkante des Heros (offsetTop ist bei sticky verfälscht)
    const natural = hero
      ? hero.getBoundingClientRect().bottom + window.scrollY
      : (barRef.current?.offsetTop ?? 0);
    const top = Math.max(0, Math.round(natural - inset));
    if (always || window.scrollY > top) window.scrollTo({ top, behavior });
  };

  /* ---- Automatisch zur aktuellen Session scrollen (Programm + Agenda) ---- */
  const autoScrolled = useRef(false);
  useEffect(() => {
    if (view === "community" || q) return;
    if (!autoScrolled.current) {
      autoScrolled.current = true;
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("s") || sp.get("rate") || sp.get("inbox") || (window.location.hash && window.location.hash !== "#mein")) return;
    }
    if (view === "all" && day !== now.date) return;
    const t = window.setTimeout(() => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>("main.wrap article.card"));
      if (!cards.length || !cards[0]!.classList.contains("past")) return;
      const target = cards.find((c) => !c.classList.contains("past"));
      if (!target) return;
      const barBottom = barRef.current?.getBoundingClientRect().height ?? 0;
      const inset = document.querySelector(".sb-shield")?.getBoundingClientRect().height ?? 0;
      const top = target.getBoundingClientRect().top + window.scrollY - barBottom - inset - 12;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }, 120);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, day, now.date]);

  /* ---- Gruppierung ---- */
  const renderDay = (date: string, filtered: boolean) => {
    const rows = ALL.filter((s) => s.date === date);
    const out: React.ReactNode[] = [];
    let group: { label: string; items: Item[] } | null = null;
    let cardCount = 0;
    const flush = () => {
      if (!group) return;
      const g = group;
      out.push(
        <section className="slot" key={`slot-${date}-${out.length}`}>
          <div className="time">{g.label}</div>
          <div className="items">
            {g.items.map((s) => (
              <SessionCard
                key={s.id}
                s={s}
                now={now}
                selected={sel.includes(s.id)}
                clashes={clashesOf(s)}
                open={!!open[s.id]}
                onToggleOpen={toggleOpen}
                onPick={togglePick}
                extra={cardExtra(s.id, false)}
              />
            ))}
          </div>
        </section>,
      );
      group = null;
    };
    rows.forEach((s) => {
      if (s.format === "pause" || s.format === "ende") {
        if (filtered) return;
        flush();
        out.push(
          <div className="pause" key={s.id}>
            <div className="time">{timeLabel(s)}</div>
            <span>{s.title}</span>
          </div>,
        );
        return;
      }
      if (!matches(s)) return;
      cardCount++;
      const label = timeLabel(s);
      if (!group || group.label !== label) {
        flush();
        group = { label, items: [] };
      }
      group.items.push(s);
    });
    flush();
    return { nodes: out, count: cardCount };
  };

  /* ---- Export-Status ---- */
  const pendingAdd = selected.filter((s) => !gcal[s.id]);
  const pendingRemove = Object.keys(gcal)
    .filter((id) => !sel.includes(id) && BY_ID[id])
    .map((id) => BY_ID[id] as Item)
    .sort(bySchedule);
  const doneCount = selected.length - pendingAdd.length;
  const next = pendingAdd[0];

  const markOpened = (id: string) => {
    setTimeout(() => {
      setGcal((g) => (g[id] ? g : { ...g, [id]: { v: "link", t: Date.now() } }));
      const left = pendingAdd.length - 1;
      showToast(
        left > 0
          ? "Termin in Google speichern – danach ist der nächste dran"
          : "Letzter Termin – danach ist alles übernommen",
      );
    }, 80);
  };

  const downloadIcs = () => {
    if (!selected.length) return;
    const blob = new Blob([buildIcs(selected, rem.lead)], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mitmacht-2026-mein-programm.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast("Kalenderdatei geladen");
  };

  const copyShareLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?p=${sel.join(",")}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyMsg("Link kopiert – öffne ihn auf deinem Handy.");
    } catch {
      setCopyMsg(url);
    }
  };

  const nowCount = (date: string) => sel.filter((id) => BY_ID[id]?.date === date).length;

  return (
    <div className="mm">
      <div className="sb-shield" aria-hidden="true" />
      <IconSprite />

      <header className="hero">
        <div className="hero-circle" aria-hidden="true" />
        <div className="hero-dots" aria-hidden="true" />
        <div className="wrap">
          <p className="eyebrow">{"Online-Planer:in [🚀 Beta 3.1]"}</p>
          <h1>Mitmacht 2026</h1>
          <p className="lede">
            {"Festival-Programm 🚀 zusammenstellen & in Kalender eintragen. Läuft sogar offline als App 🤩"}
          </p>
          <p className="facts">
            <span>23.–26. September 2026</span>
            <span>
              <a
                href="https://www.google.com/maps/search/?api=1&query=SRH%20Hochschule%20Berlin%2C%20Sonnenallee%20221%2C%2012059%20Berlin"
                target="_blank"
                rel="noopener noreferrer"
              >
                SRH Hochschule Berlin, Sonnenallee 221 ↗
              </a>
            </span>
          </p>
          <HeroFaces
            people={cm.people}
            onOpen={() => {
              setView("community");
              scrollToBar("smooth", true);
            }}
          />
        </div>
      </header>

      <nav className={`bar${stuck ? " stuck" : ""}`} aria-label="Ansicht und Tag" ref={barRef}>
        <div className="wrap">
          <div className={`bartop${stuck ? " on" : ""}`}>
            <span className={`bartitle${stuck ? " show" : ""}`} aria-hidden={!stuck}>Mitmacht 2026</span>
          </div>
          <div className="viewrow">
          <div className="views" role="tablist" aria-label="Ansicht">
            <button
              type="button"
              role="tab"
              aria-selected={view === "all"}
              onClick={() => {
                setView("all");
                setConfirmClear(false);
              }}
            >
              Programm
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "mine"}
              onClick={() => {
                setView("mine");
                setConfirmClear(false);
              }}
            >
              <span className="lg">Agenda</span>
              <span className="sm">Agenda</span> <span className="count">{sel.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "community"}
              onClick={() => {
                setView("community");
                setConfirmClear(false);
              }}
            >
              Community{inbox.unreadTotal > 0 && <> <span className="count" aria-label={`${inbox.unreadTotal} ungelesene Nachrichten`}>{inbox.unreadTotal}</span></>}
            </button>
          </div>
            <span className="barbtns">
            {cm.userId ? (
              <button
                type="button"
                className="settingsbtn"
                onClick={() => setProfileOpen(true)}
                aria-label="Mein Profil & Sichtbarkeit"
                title="Mein Profil & Sichtbarkeit"
              >
                <Avatar name={cm.profile?.display_name ?? ""} url={cm.profile?.avatar_url ?? null} size={28} />
              </button>
            ) : (
              <button
                type="button"
                className="settingsbtn"
                onClick={cm.login}
                disabled={!online}
                aria-label={online ? "Mit LinkedIn anmelden" : "Anmelden ist offline nicht möglich"}
                title={cm.configured === false ? "LinkedIn-Anmeldung wird gerade eingerichtet" : "Mit LinkedIn anmelden"}
              >
                <LinkedInIcon />
              </button>
            )}
            <button type="button" className="settingsbtn" onClick={openSettings} aria-label="Einstellungen" title="Einstellungen">
              <Icon name="gear" />
            </button>
            </span>
          </div>
          {view === "all" && (
            <div className="days" role="tablist" aria-label="Festivaltag">
              {DAYS.map((d) => {
                const n = nowCount(d.date);
                const active = day === d.date && !q;
                return (
                  <button
                    type="button"
                    role="tab"
                    key={d.date}
                    aria-selected={active}
                    onClick={() => {
                      setDay(d.date);
                      setQ("");
                      scrollToBar();
                    }}
                  >
                    {now.date === d.date && <span className="today">Heute</span>}
                    <span className="d1">
                      {d.short} {d.label.slice(0, 3)}
                    </span>
                    <span className="d2">{n ? `${n} gemerkt` : d.long}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      <main className="wrap">
        {newBuild && newBuildDismissed !== newBuild && !swUpdate && (
          <div className="notice small" role="status">
            <div className="row">
              <p>Neue Version verfügbar</p>
              <button
                type="button"
                className="btn small primary"
                disabled={updateBusy}
                onClick={() => void runApplyUpdate(newBuild)}
              >
                {updateBusy ? "Wird aktualisiert …" : "Jetzt aktualisieren"}
              </button>
              <button
                type="button"
                className="linkbtn close"
                aria-label="Hinweis schließen"
                onClick={() => setNewBuildDismissed(newBuild)}
              >
                ✕
              </button>
            </div>
          </div>
        )}
        {swUpdate && (
          <div className="notice" role="status">
            <div className="row">
              <p>Neue Version verfügbar.</p>
              <button type="button" className="btn small primary" onClick={swUpdate.apply}>
                Neu laden
              </button>
              <button type="button" className="linkbtn close" onClick={() => setSwUpdate(null)}>
                Später
              </button>
            </div>
          </div>
        )}

        {!online && (
          <p className="offline" role="status">
            <span className="dot" aria-hidden="true" />
            Offline – dein Programm ist auf diesem Gerät gespeichert.
          </p>
        )}

        {upcoming && (
          <div className={`nextup${upcoming.live ? " live" : ""}`} role="status">
            {upcoming.live ? (
              <>
                Läuft gerade: <b>{upcoming.s.title}</b> · {upcoming.s.start}–{upcoming.s.end}
                {upcoming.s.room ? ` · ${upcoming.s.room}` : ""}
              </>
            ) : (
              <>
                Als Nächstes: <b>{upcoming.s.title}</b> · {upcoming.s.start} Uhr
                {upcoming.s.room ? ` · ${upcoming.s.room}` : ""} (in {upcoming.mins} Min)
              </>
            )}
          </div>
        )}

        {reminderFallback && (
          <div className={`nextup${reminderFallback.kind === "missed" ? " missed" : ""}`} role="alert">
            {reminderFallback.kind === "missed" ? "Verpasst? " : "Erinnerung: "}
            <b>{reminderFallback.title}</b>{reminderFallback.kind === "missed" ? " hat" : " beginnt"} um {reminderFallback.start}
            {reminderFallback.room ? ` · ${reminderFallback.room}` : ""}
          </div>
        )}

        {!standalone && !iosHintOff && (installEvt || (ios && !swDisabled())) && (
          <div className="notice small">
            <div className="row">
              <p>
                <button type="button" className="linkbtn" onClick={openSettings}>
                  Als App installieren – so geht&#39;s
                </button>
              </p>
              <button
                type="button"
                className="linkbtn close"
                aria-label="Hinweis schließen"
                onClick={() => setIosHintOff(true)}
              >
                Verstanden
              </button>
            </div>
          </div>
        )}

        {online && cm.profile?.visible && !cm.profile.linkedin_url && !liNudgeOff && (
          <div className="notice small">
            <div className="row">
              <p>
                Damit dich andere aus der Community kontaktieren können, ergänze deinen LinkedIn-Link.{" "}
                <button type="button" className="linkbtn" onClick={() => setProfileOpen(true)}>
                  Jetzt ergänzen
                </button>
              </p>
              <button type="button" className="linkbtn close" aria-label="Hinweis schließen" onClick={dismissLiNudge}>
                ×
              </button>
            </div>
          </div>
        )}

        {rateBanner && (
          <div className="notice small">
            <div className="row">
              <p>
                Wie war „{rateBanner.title}“?{" "}
                <button type="button" className="linkbtn" onClick={() => setRateId(rateBanner.id)}>
                  Jetzt bewerten (10 Sekunden)
                </button>
              </p>
              <button type="button" className="linkbtn close" aria-label="Hinweis schließen" onClick={() => fb.dismiss(rateBanner.id)}>
                ×
              </button>
            </div>
          </div>
        )}

        {shareIds && (
          <div className="share" role="status">
            <p>{shareIds.length} Sessions übernehmen?</p>
            <div className="btnrow">
              <button
                type="button"
                className="btn primary small"
                onClick={() => {
                  markProgramChanged();
                  setSel(shareIds);
                  setShareIds(null);
                  showToast("Programm übernommen");
                }}
              >
                Ersetzen
              </button>
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  markProgramChanged();
                  setSel((cur) => Array.from(new Set([...cur, ...shareIds])));
                  setShareIds(null);
                  showToast("Sessions hinzugefügt");
                }}
              >
                Hinzufügen
              </button>
              <button type="button" className="linkbtn" onClick={() => setShareIds(null)}>
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {view === "all" ? (
          <section>
            <div className="tools">
              <div className="search">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
                  <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Thema, Titel, Person, Organisation oder Raum"
                  autoComplete="off"
                  aria-label="Programm durchsuchen"
                />
                {q && (
                  <button
                    type="button"
                    className="clear"
                    aria-label="Suche löschen"
                    onClick={() => setQ("")}
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="chips" aria-label="Nach Format filtern">
                {FORMATS.map((f) => (
                  <button
                    type="button"
                    key={f.key}
                    className="chip"
                    aria-pressed={types.includes(f.key)}
                    onClick={() => toggleType(f.key)}
                  >
                    <Icon name={f.key} />
                    {f.label}
                  </button>
                ))}
                {types.length > 0 && (
                  <button type="button" className="chip reset" onClick={() => setTypes([])}>
                    Alle Formate
                  </button>
                )}
              </div>
              {q &&
                (() => {
                  const total = DAYS.reduce(
                    (acc, d) => acc + renderDay(d.date, true).count,
                    0,
                  );
                  return (
                    <p className="hint">
                      {total ? (
                        <>
                          <b>{total}</b> Treffer an allen Festivaltagen
                        </>
                      ) : (
                        <>Keine Treffer für „{q.trim()}“.</>
                      )}
                    </p>
                  );
                })()}
            </div>

            <div className="list">
              {q
                ? DAYS.map((d) => {
                    const r = renderDay(d.date, true);
                    if (!r.count) return null;
                    return (
                      <div key={d.date}>
                        <h2 className="dayhead">
                          {d.long} {d.label}2026
                        </h2>
                        {r.nodes}
                      </div>
                    );
                  })
                : (() => {
                    const d = dayOf(day);
                    const filtered = types.length > 0;
                    const r = renderDay(d.date, filtered);
                    return (
                      <>
                        <h2 className="dayhead">
                          {d.long} {d.label}2026
                        </h2>
                        {r.nodes}
                        {filtered && !r.count && (
                          <p className="none">
                            An diesem Tag gibt es kein Angebot in den gewählten Formaten.
                          </p>
                        )}
                      </>
                    );
                  })()}
            </div>
          </section>
        ) : view === "community" ? (
          <CommunityView
            people={cm.people}
            now={now}
            stand={cm.stand}
            online={online}
            loggedIn={!!cm.userId}
            isAdmin={cm.isAdmin}
            configured={cm.configured}
            sessionFilter={cmSession}
            onClearSessionFilter={() => setCmSession(null)}
            onLogin={cm.login}
            onOpenProfile={() => setProfileOpen(true)}
            currentUserId={cm.userId}
            sub={cmSub}
            onSub={(v) => {
              setCmSub(v);
              if (v === "postfach") void inbox.loadInbox();
            }}
            unread={inbox.unreadTotal}
            blockedIds={blockedIds}
            onMessage={messagePerson}
            inbox={
              <>
                {cm.isAdmin && <AdminReports reports={inbox.reports} online={online} onHide={(uid, h) => void cm.setHidden(uid, h).then(() => inbox.loadReports())} />}
                <InboxList
                  loggedIn={!!cm.userId}
                  online={online}
                  items={inbox.items}
                  loginReason={loginReason}
                  configured={cm.configured}
                  onOpen={openItem}
                  onLogin={cm.login}
                  pushHint={
                    cm.userId && push.state !== "active" ? (
                      <div className="notice small">
                        <div className="row">
                          <p>
                            {ios && !standalone
                              ? "Push für neue Nachrichten: auf dem iPhone zuerst zum Home-Bildschirm hinzufügen."
                              : "Push aktivieren, um neue Nachrichten zu sehen"}
                          </p>
                          {!(ios && !standalone) && (
                            <button type="button" className="btn small" onClick={() => void enableMsgPush()} disabled={!online}>
                              Push aktivieren
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null
                  }
                />
              </>
            }
            onHide={(uid, h) => void cm.setHidden(uid, h)}
          />
        ) : (
          <section>
            {!selected.length ? (
              <div className="empty">
                <h2>Noch nichts gemerkt</h2>
                <p>
                  Tippe im Programm auf <b>+</b> bei allem, was du sehen willst. Hier erscheint dann
                  dein persönlicher Ablauf – mit Hinweisen auf Überschneidungen und Export in deinen
                  Kalender.
                </p>
                <div className="btnrow" style={{ marginTop: 14 }}>
                  <button type="button" className="btn primary" onClick={() => setView("all")}>
                    Zum Programm
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="backupline" role="status">
                  {cm.userId ? (
                    !online || cm.sync.state === "offline" ? (
                      "Offline – wird gesichert, sobald du wieder online bist"
                    ) : cm.sync.state === "error" ? (
                      "Sicherung fehlgeschlagen – wird erneut versucht"
                    ) : cm.sync.at ? (
                      `☁︎ In deinem Profil gesichert · zuletzt ${new Date(cm.sync.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })}`
                    ) : (
                      "☁︎ Wird in deinem Profil gesichert …"
                    )
                  ) : (
                    <>
                      Nur auf diesem Gerät gespeichert.{" "}
                      <button type="button" className="linkbtn" onClick={cm.login} disabled={!online}>
                        Mit LinkedIn anmelden
                      </button>
                      , um dein Programm im Profil zu sichern und auf allen Geräten zu haben. Das veröffentlicht nichts: Deine Sessions bleiben privat, bis du sie einzeln freigibst.
                    </>
                  )}
                </p>
                <p className="remline">
                  <Icon name="bell" />
                  {rem.on ? (
                    <>
                      <span>
                        Erinnerungen: <b>an</b> · {rem.lead} Min vorher
                      </span>
                      <button type="button" className="linkbtn" onClick={openSettings}>
                        Einstellungen ändern
                      </button>
                    </>
                  ) : (
                    <>
                      <span>
                        Erinnerungen: <b>aus</b>
                      </span>
                      <button type="button" className="linkbtn" onClick={openSettings}>
                        einschalten
                      </button>
                    </>
                  )}
                </p>

                <section className="export" aria-labelledby="exp-h">
                  <h2 id="exp-h">
                    <Icon name="cal" className="" />
                    In den Kalender übernehmen
                  </h2>
                  <p className="sub">
                    {selected.length} Termin{selected.length === 1 ? "" : "e"} in deinem Programm
                    {selected.filter((s) => clashesOf(s).length).length > 0 && (
                      <>
                        {" · "}
                        <span style={{ color: "var(--warn)", fontWeight: 600 }}>
                          {selected.filter((s) => clashesOf(s).length).length} mit Überschneidung
                        </span>
                      </>
                    )}
                  </p>

                  <div className="block">
                    <p className="status">
                      Alles auf einmal – als Kalenderdatei für Apple Kalender, Outlook und Google
                      Kalender:
                    </p>
                    <div className="btnrow">
                      <button type="button" className="btn" onClick={downloadIcs}>
                        Kalenderdatei (.ics) laden
                      </button>
                    </div>
                    <p className="fine">
                      Die Datei enthält Erinnerungen ({rem.lead} Minuten vorher) – Apple Kalender
                      und Outlook übernehmen sie, Google Kalender nutzt beim Import meist seine
                      eigenen Standard-Erinnerungen. Auf iPhone und Mac öffnet sich die Datei direkt
                      im Kalender. Für Google Kalender am Computer: Einstellungen → Importieren
                      &amp; exportieren → <b>mitmacht-2026-mein-programm.ics</b> auswählen.
                    </p>
                  </div>

                  <div className="block">
                    <div
                      className="progress"
                      role="img"
                      aria-label={`${doneCount} von ${selected.length} Terminen in Google Kalender geöffnet`}
                    >
                      <i style={{ width: `${Math.round((doneCount / selected.length) * 100)}%` }} />
                    </div>
                    {next ? (
                      <>
                        <p className="status">
                          {doneCount ? (
                            <>
                              <b>
                                {doneCount} von {selected.length}
                              </b>{" "}
                              Terminen in Google geöffnet.
                            </>
                          ) : (
                            <>Google nimmt pro Link genau einen Termin an.</>
                          )}{" "}
                          Tippe auf den Button, tippe in Google Kalender auf <b>Speichern</b> und komm
                          hierher zurück – dann ist der nächste Termin dran.
                        </p>
                        <a
                          className="btn primary next"
                          href={gLink(next)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => markOpened(next.id)}
                        >
                          <span className="n1">
                            Termin {doneCount + 1} von {selected.length} in Google Kalender öffnen ↗
                          </span>
                          <span className="n2">
                            {dayOf(next.date).short} {dayOf(next.date).label}, {next.start} ·{" "}
                            {next.title}
                          </span>
                        </a>
                      </>
                    ) : (
                      <>
                        <p className="status" style={{ color: "var(--ok)", fontWeight: 600 }}>
                          Alle {selected.length} Termine wurden in Google Kalender geöffnet.
                        </p>
                        <p className="fine">
                          Nimmst du etwas Neues ins Programm, erscheint es hier wieder zum
                          Übernehmen.{" "}
                          <button
                            type="button"
                            className="linkbtn"
                            onClick={() => setGcal({})}
                          >
                            Alle Markierungen zurücksetzen
                          </button>
                        </p>
                      </>
                    )}
                    {pendingRemove.length > 0 && (
                      <div className="confirm">
                        <p>
                          Nicht mehr in deinem Programm, aber schon an Google übergeben:{" "}
                          {pendingRemove.map((s) => `„${s.title}“`).join(", ")}. Falls du{" "}
                          {pendingRemove.length === 1 ? "ihn" : "sie"} gespeichert hast, lösch{" "}
                          {pendingRemove.length === 1 ? "ihn" : "sie"} bitte direkt in Google
                          Kalender.
                        </p>
                        <div className="btnrow">
                          <button
                            type="button"
                            className="btn small"
                            onClick={() =>
                              setGcal((g) => {
                                const c = { ...g };
                                pendingRemove.forEach((s) => delete c[s.id]);
                                return c;
                              })
                            }
                          >
                            Erledigt
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="block">
                    <p className="status">Programm aufs Handy übertragen:</p>
                    <div className="btnrow">
                      <button type="button" className="btn" onClick={copyShareLink}>
                        Link zu meinem Programm kopieren
                      </button>
                    </div>
                    {copyMsg && <p className="msg ok">{copyMsg}</p>}
                  </div>
                </section>

                {DAYS.map((d) => {
                  const items = selected.filter((s) => s.date === d.date);
                  if (!items.length) return null;
                  return (
                    <div key={d.date}>
                      <h2 className="dayhead">
                        {d.long} {d.label}2026
                      </h2>
                      <div className="items">
                        {items.map((s) => (
                          <SessionCard
                            key={s.id}
                            s={s}
                            now={now}
                            selected
                            clashes={clashesOf(s)}
                            open={!!open[s.id]}
                            onToggleOpen={toggleOpen}
                            onPick={togglePick}
                            showTime
                            showLinks
                            extra={cardExtra(s.id, true)}
                            gcalOpened={!!gcal[s.id]}
                            onOpenGcal={markOpened}
                            onUnmarkGcal={(id) =>
                              setGcal((g) => {
                                const c = { ...g };
                                delete c[id];
                                return c;
                              })
                            }
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                <div className="foot" style={{ paddingTop: 26 }}>
                  {confirmClear ? (
                    <div className="confirm">
                      <p>
                        Dein ganzes Programm leeren? Termine in deinem Kalender bleiben dort stehen.
                      </p>
                      <div className="btnrow">
                        <button
                          type="button"
                          className="btn danger small"
                          onClick={() => {
                            markProgramChanged();
                            setSel([]);
                            setConfirmClear(false);
                            showToast("Programm geleert");
                          }}
                        >
                          Ja, leeren
                        </button>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => setConfirmClear(false)}
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <button type="button" className="linkbtn" onClick={() => setConfirmClear(true)}>
                        Programm leeren
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        <details className="info">
          <summary>Anreise, Orte &amp; Räume</summary>
          <div className="grid">
            <div>
              <h4>Adresse</h4>
              <p>
                {FESTIVAL.venue}
                <br />
                {FESTIVAL.entrance}
              </p>
              <p style={{ marginTop: 6 }}>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(FESTIVAL.venue)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  In Google Maps öffnen ↗
                </a>
              </p>
            </div>
            <div>
              <h4>Veranstaltungsbereiche</h4>
              <ul>
                {FESTIVAL.areas.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Räume finden</h4>
              <ul>
                {FESTIVAL.rooms.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Gut zu wissen</h4>
              <ul>
                {FESTIVAL.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>
        <div className="foot srcnote">
          <h2 className="foothead">Online-Planer:in für Mitmacht 2026</h2>
          <div>Deine Auswahl wird in diesem Browser gespeichert.</div>
          <div>
            {FESTIVAL.sources}.{" "}
            <a href={FESTIVAL.programUrl} target="_blank" rel="noopener noreferrer">
              Programm auf faktor-d.org ↗
            </a>
          </div>
          <div>
            Wir freuen uns aufs Festival mit euch! Team{" "}
            <a href="https://www.demokratie.ch" target="_blank" rel="noopener noreferrer">SDD</a>
          </div>
          <figure className="teamimg">
            <img src={teamImgSrc} alt="Sandro, Sophie, Lisa, Daniel und Niklaus" loading="lazy" />
            <figcaption aria-hidden="true">
              {["Sandro", "Sophie", "Lisa", "Daniel", "Niklaus"].map((n) => (
                <span key={n}>{n}</span>
              ))}
            </figcaption>
          </figure>
          <div>
            Online-Planer:in ist eine Toolbox der{" "}
            <a href="https://www.demokratie.ch" target="_blank" rel="noopener noreferrer">
              Stiftung für Direkte Demokratie
            </a>{" "}
            mit Inhalten von{" "}
            <a
              href="https://www.faktor-d.org/mitmachen/mitmacht-festival/2026/programm"
              target="_blank"
              rel="noopener noreferrer"
            >
              Mitmacht-Festival 2026
            </a>
            .
          </div>
          <div>
            <a href="https://www.demokratie.ch/datenschutz" target="_blank" rel="noopener noreferrer">
              Datenschutzerklärung
            </a>
            {" · "}
            <a
              href="https://github.com/Stiftung-fur-direkte-Demokratie/mitmacht-festival-planer"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, verticalAlign: "middle" }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              GitHub
            </a>
          </div>
          <div>
            made with love by <span role="img" aria-label="der Schweiz">🇨🇭</span> in{" "}
            <span role="img" aria-label="Berlin">🐻</span>
          </div>
        </div>
      </main>

      <ProfileSheet
        open={profileOpen && !!cm.userId}
        onClose={() => setProfileOpen(false)}
        profile={cm.profile}
        online={online}
        firstLogin={cm.firstLogin}
        selCount={sel.length}
        publicCount={sel.filter((id) => cm.publicIds[id]).length}
        onSave={cm.saveProfile}
        onShareAll={() => void cm.setPublic(sel, true)}
        onLogout={() => {
          setProfileOpen(false);
          void cm.logout();
        }}
        onDelete={cm.deleteAccount}
        onNotify={showToast}
        blocks={inbox.blocks}
        onUnblock={(uid) => void inbox.unblock(uid).then((ok) => showToast(ok ? "Blockierung aufgehoben" : "Nicht möglich"))}
        pushHere={(msgPush || rem.on) && perm === "granted"}
        onEnablePush={() => void enableMsgPush()}
      />

      {openConv && cm.userId && (() => {
        const it = openConv.conversationId ? inbox.items.find((i) => i.conversation_id === openConv.conversationId) : undefined;
        return (
          <ConversationSheet
            open
            onClose={() => setOpenConv(null)}
            partner={openConv.partner}
            conversationId={openConv.conversationId}
            messages={openConv.conversationId ? inbox.messages[openConv.conversationId] ?? [] : []}
            userId={cm.userId}
            online={online}
            canReply={it ? it.can_reply : true}
            partnerGone={it ? !it.partner_exists : false}
            blockedMe={it ? it.blocked_me : false}
            onSend={async (body) => {
              const r = await inbox.send({ conversationId: openConv.conversationId, to: openConv.partner.id }, body);
              if (r.ok && !openConv.conversationId) setOpenConv((c) => (c ? { ...c, conversationId: r.conversationId } : c));
              return r;
            }}
            onBlock={async () => {
              const ok = await inbox.block(openConv.partner.id);
              showToast(ok ? "Blockiert" : "Blockieren fehlgeschlagen");
              return ok;
            }}
            onReport={async (reason) => {
              const r = await inbox.report(null, openConv.partner.id, reason);
              if (r.ok) showToast("Danke, deine Meldung ist beim Team angekommen");
              return r;
            }}
          />
        );
      })()}

      <SettingsDialog
        open={settingsOpen}
        onClose={closeSettings}
        standalone={standalone}
        ios={ios}
        canInstall={!!installEvt}
        onInstall={() => void installApp()}
        offline={offline}
        online={online}
        onCheckUpdate={() => void doCheckUpdate()}
        updateMsg={updateMsg}
        updateBusy={updateBusy}
        installedBuild={APP_BUILD}
        serverBuild={serverBuild}
        showReloadApp={showReloadApp}
        onReloadApp={doReloadApp}
        onResetOffline={doResetOffline}
        remOn={rem.on}
        remLead={rem.lead}
        onRemOn={(v) => {
          setRem((r) => ({ ...r, on: v }));
          showToast(v ? "Erinnerungen eingeschaltet ✓" : "Erinnerungen ausgeschaltet ✓");
        }}
        onRemLead={(v) => {
          setRem((r) => ({ ...r, lead: v }));
          showToast(`Vorlauf ${v} Min gespeichert ✓`);
        }}
        perm={perm}
        onAskPermission={() => void askPermission()}
        onTestNotification={() => void testNotification()}
        remCount={remStats.count}
        remNext={remStats.next}
        diagnosticsOpen={diagnosticsOpen}
        diagnostics={diagnostics}
        onDiagnosticsToggle={setDiagnosticsOpen}
        onCheckNow={() => {
          checkReminders("manuell", true);
          void refreshSwDiagnostics();
        }}
        onScheduleTest={scheduleTestReminder}
        onResetNotified={resetNotified}
        onCopyLog={() => void copyReminderLog()}
        onClearLog={clearReminderLog}
        push={push}
        onTestPush={() => void testPush()}
        adminSlot={cm.isAdmin ? <AdminFeedback online={online} /> : undefined}
      />

      <FeedbackSheet
        session={rateId ? BY_ID[rateId] ?? null : null}
        initial={rateId ? fb.rated[rateId] : undefined}
        loggedIn={!!cm.userId}
        online={online}
        onClose={() => setRateId(null)}
        onSubmit={async (r) => {
          const id = rateId!;
          const res = await fb.submit(id, r);
          if (res.ok) {
            setRateId(null);
            showToast(res.queued ? "Gespeichert – wird gesendet, sobald du online bist" : "Danke für dein Feedback ✓");
          }
          return res;
        }}
      />

      {onboard && (
        <div className="sheet-backdrop onb-backdrop" onClick={closeOnboard}>
          <div className="onb" role="dialog" aria-modal="true" aria-labelledby="onb-t" onClick={(e) => e.stopPropagation()}>
            {onboard === "install" ? (
              <>
                <div className="onb-ico" aria-hidden="true">📲</div>
                <h2 id="onb-t">Zum Home-Bildschirm hinzufügen</h2>
                <p>
                  {ios
                    ? "Tippe in Safari unten auf „Teilen“ und dann auf „Zum Home-Bildschirm“. So startet der Planer wie eine App – auch offline."
                    : "Installiere den Planer als App: schneller Start, funktioniert auch offline."}
                </p>
                <div className="onb-actions">
                  {installEvt ? (
                    <button type="button" className="btn primary" onClick={() => { void installApp(); closeOnboard(); }}>Jetzt installieren</button>
                  ) : (
                    <button type="button" className="btn primary" onClick={() => { closeOnboard(); openSettings(); }}>So geht&#39;s</button>
                  )}
                  <button type="button" className="btn" onClick={closeOnboard}>Später</button>
                </div>
              </>
            ) : (
              <>
                <div className="onb-ico" aria-hidden="true">🔔</div>
                <h2 id="onb-t">Push-Meldungen aktivieren</h2>
                <p>Wir erinnern dich kurz vor deinen Sessions – auch wenn die App geschlossen ist.</p>
                <div className="onb-actions">
                  <button type="button" className="btn primary" onClick={() => { closeOnboard(); void askPermission(); }}>Aktivieren</button>
                  <button type="button" className="btn" onClick={closeOnboard}>Später</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className={`toast${toast ? " show" : ""}${/fehlgeschlagen|nicht erlaubt|nicht möglich|nicht unterstützt|fehler|ungültig/i.test(toast) ? " err" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
