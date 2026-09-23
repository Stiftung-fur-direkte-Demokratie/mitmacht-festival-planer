import { currentSubscription, ensureSubscription, pushHost, pushSupported, removeSubscription, requestTestPush, syncSubscription } from "@/lib/push-client";
import { createFileRoute } from "@tanstack/react-router";
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
  const [view, setView] = useState<"all" | "mine">("all");
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

  const selected = useMemo(
    () => (sel.map((id) => BY_ID[id]).filter(Boolean) as Item[]).sort(bySchedule),
    [sel],
  );
  const clashesOf = useCallback((s: Item) => clashesFor(s, selected), [selected]);

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

  const installApp = async () => {
    if (!installEvt) return;
    await installEvt.prompt();
    await installEvt.userChoice;
    setInstallEvt(null);
  };

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

  const doCheckUpdate = async () => {
    setUpdateMsg("Suche nach Updates …");
    const res = await checkForUpdate();
    setUpdateMsg(
      res === "updated"
        ? "Neue Version gefunden – die App lädt gleich neu."
        : res === "current"
          ? "Du hast bereits die neueste Version."
          : "Offline-Speicher ist hier nicht aktiv.",
    );
  };

  const doResetOffline = () => {
    void resetOffline();
  };

  /* ---- Server-Push ---- */
  const pushSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncPush = useCallback(async () => {
    const supported = pushSupported();
    const stamp = () => new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    if (!rem.on) {
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
      await syncSubscription(sub, selectedRef.current.filter((x) => !isLong(x)).map((x) => x.id), rem.lead, deviceKind() as "ios" | "android" | "desktop");
      addReminderLog(`Push synchronisiert (${pushHost(sub)})`);
      setPush({ supported, state: "active", error: null, subscribed: true, host: pushHost(sub), lastResponse: "ok", lastSync: stamp() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addReminderLog(`Push-Fehler: ${msg}`);
      const sub = await currentSubscription().catch(() => null);
      setPush((p) => ({ ...p, supported, state: "error", error: msg, subscribed: !!sub, host: pushHost(sub), lastResponse: msg }));
    }
  }, [addReminderLog, ios, perm, rem.lead, rem.on, standalone]);

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
      setSel(sel.filter((x) => x !== id));
      showToast("Aus deinem Programm entfernt");
    } else {
      const cl = clashesFor(s, selected);
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

  const scrollToBar = () => {
    const top = barRef.current?.offsetTop ?? 0;
    if (window.scrollY > top) window.scrollTo({ top, behavior: "auto" });
  };

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
      <IconSprite />

      <header className="hero">
        <div className="hero-circle" aria-hidden="true" />
        <div className="hero-dots" aria-hidden="true" />
        <div className="wrap">
          <p className="eyebrow">Online-Planer:in [Beta 2.1]</p>
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
        </div>
      </header>

      <nav className="bar" aria-label="Ansicht und Tag" ref={barRef}>
        <div className="wrap">
          <div className="bartop">
            <span className="bartitle">Mitmacht 2026 Planer</span>
            <button type="button" className="settingsbtn" onClick={openSettings} aria-label="Einstellungen" title="Einstellungen">
              <Icon name="gear" />
            </button>
          </div>
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
              Mein Programm <span className="count">{sel.length}</span>
            </button>
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

        {shareIds && (
          <div className="share" role="status">
            <p>{shareIds.length} Sessions übernehmen?</p>
            <div className="btnrow">
              <button
                type="button"
                className="btn primary small"
                onClick={() => {
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
        </div>
      </main>

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
        onResetOffline={doResetOffline}
        remOn={rem.on}
        remLead={rem.lead}
        onRemOn={(v) => setRem((r) => ({ ...r, on: v }))}
        onRemLead={(v) => setRem((r) => ({ ...r, lead: v }))}
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
      />

      <div className={`toast${toast ? " show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
