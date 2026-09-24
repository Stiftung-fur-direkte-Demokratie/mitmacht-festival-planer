declare const __APP_BUILD__: string;
export const APP_BUILD = typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : "dev";
/* Service-Worker-Registrierung mit Preview-Schutz + PWA-Helfer */

export function isPreviewHost(): boolean {
  if (typeof window === "undefined") return true;
  const h = window.location.hostname;
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.startsWith("id-preview--") ||
    h.startsWith("preview--") ||
    h === "lovableproject.com" ||
    h.endsWith(".lovableproject.com") ||
    h === "lovableproject-dev.com" ||
    h.endsWith(".lovableproject-dev.com") ||
    h === "beta.lovable.dev" ||
    h.endsWith(".beta.lovable.dev")
  );
}

export function inIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function swDisabled(): boolean {
  if (typeof window === "undefined") return true;
  const params = new URLSearchParams(window.location.search);
  if (params.has("nosw")) return true;
  if (inIframe()) return true;
  // Test-Schalter: erlaubt den Service Worker auch lokal (?sw=on)
  if (params.get("sw") === "on") return false;
  return isPreviewHost();
}

export function swDisabledReason(): string | null {
  if (typeof window === "undefined") return "Server-Ansicht";
  const params = new URLSearchParams(window.location.search);
  if (params.has("nosw")) return "mit ?nosw deaktiviert";
  if (inIframe()) return "in der Vorschau/iframe deaktiviert";
  if (params.get("sw") === "on") return null;
  if (isPreviewHost()) return "auf dieser Vorschau-Domain deaktiviert";
  return null;
}

export type NotificationResult = {
  ok: boolean;
  via: "sw" | "constructor" | "none";
  error?: string;
};

export function deviceKind(): "iOS" | "Android" | "Desktop" {
  if (typeof navigator === "undefined") return "Desktop";
  if (isIos()) return "iOS";
  return /Android/i.test(navigator.userAgent) ? "Android" : "Desktop";
}

export function browserInfo(): string {
  if (typeof navigator === "undefined") return "unbekannt";
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/CriOS\//.test(ua)) return "Chrome iOS";
  if (/FxiOS\//.test(ua)) return "Firefox iOS";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return ua.slice(0, 80);
}

/** Liefert eine aktive Registrierung, ohne unbegrenzt auf ready zu warten. */
export async function getSwRegistration(timeoutMs = 2000): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing?.active) return existing;
    const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs));
    const ready = navigator.serviceWorker.ready
      .then((registration) => (registration.active ? registration : null))
      .catch(() => null);
    return await Promise.race([ready, timeout]);
  } catch {
    return null;
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Zeigt eine lokale Benachrichtigung über SW, auf Desktop ersatzweise direkt. */
export async function showLocalNotification(
  title: string,
  options: NotificationOptions,
): Promise<NotificationResult> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { ok: false, via: "none", error: "Benachrichtigungen werden nicht unterstützt" };
  }
  if (Notification.permission !== "granted") {
    return { ok: false, via: "none", error: "Benachrichtigungen sind nicht erlaubt" };
  }
  const registration = await getSwRegistration();
  if (registration) {
    try {
      await registration.showNotification(title, options);
      return { ok: true, via: "sw" };
    } catch (error) {
      const message = `Service Worker: ${errorText(error)}`;
      if (deviceKind() !== "Desktop") return { ok: false, via: "none", error: message };
    }
  }
  if (deviceKind() !== "Desktop") {
    return {
      ok: false,
      via: "none",
      error: `${swDisabledReason() ?? "kein aktiver Service Worker"}; mobile Direktanzeige nicht möglich`,
    };
  }
  try {
    new Notification(title, options);
    return { ok: true, via: "constructor" };
  } catch (error) {
    return { ok: false, via: "none", error: errorText(error) };
  }
}

async function unregisterAll() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(regs.map((r) => r.unregister()));
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.allSettled(keys.filter((k) => k.startsWith("mitmacht-")).map((k) => caches.delete(k)));
  }
}

export function registerServiceWorker(onUpdate: (apply: () => void) => void) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (swDisabled()) {
    void unregisterAll();
    return;
  }
  const start = () => {
    navigator.serviceWorker
      .register("/sw.js?v=" + APP_BUILD, { scope: "/" })
      .then((reg) => {
        const notify = (worker: ServiceWorker | null) => {
          if (!worker || !navigator.serviceWorker.controller) return;
          onUpdate(() => {
            worker.postMessage("SKIP_WAITING");
          });
        };
        if (reg.waiting) notify(reg.waiting);
        const check = () => {
          if (navigator.onLine) void reg.update().catch(() => undefined);
        };
        setInterval(check, 30 * 60 * 1000);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
        });
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener("statechange", () => {
            if (w.state === "installed") notify(w);
          });
        });
      })
      .catch(() => undefined);

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading || applyingUpdate) return;
      reloading = true;
      window.location.reload();
    });
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

/** Status des Offline-Speichers */
export type OfflineStatus = "active" | "preparing" | "disabled";

export function offlineStatus(): OfflineStatus {
  if (typeof window === "undefined") return "disabled";
  if (swDisabled() || !("serviceWorker" in navigator)) return "disabled";
  return navigator.serviceWorker.controller ? "active" : "preparing";
}

let applyingUpdate = false;

export type UpdateCheck =
  | { status: "available"; build: string }
  | { status: "current"; build: string }
  | { status: "offline" }
  | { status: "error"; error: string };

/** Fragt die Build-Kennung der veröffentlichten Version ab. */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (typeof window === "undefined") return { status: "error", error: "Server-Ansicht" };
  if (!navigator.onLine) return { status: "offline" };
  try {
    const res = await fetch("/api/public/version?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return { status: "error", error: "HTTP " + res.status };
    const j = (await res.json()) as { build?: unknown };
    const build = typeof j.build === "string" ? j.build : "";
    if (!build) return { status: "error", error: "keine Build-Angabe" };
    return build !== APP_BUILD ? { status: "available", build } : { status: "current", build };
  } catch (e) {
    return navigator.onLine ? { status: "error", error: errorText(e) } : { status: "offline" };
  }
}

async function clearShellCaches(keepBuild?: string) {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.allSettled(
    keys
      .filter((k) => k.startsWith("mitmacht-") && !(keepBuild && k.startsWith("mitmacht-2026-" + keepBuild + "-")))
      .map((k) => caches.delete(k)),
  );
}

/** Lädt die neue Version zuverlässig: alten Offline-Speicher abmelden, Caches leeren,
 *  dann mit neuer Adresse frisch vom Server laden. Der Offline-Speicher wird danach neu aufgebaut. */
export async function applyUpdate(newBuild: string): Promise<void> {
  applyingUpdate = true;
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }
  try {
    await clearShellCaches();
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("u", newBuild);
  url.hash = "";
  window.location.replace(url.toString());
}

/** Leert den App-Shell-Cache und lädt neu (für „sieht noch alt aus"). */
export async function reloadApp(): Promise<void> {
  try {
    await clearShellCaches();
  } catch {
    /* ignore */
  }
  window.location.reload();
}

/** Meldet den Service Worker ab, löscht die Caches und lädt neu. */
export async function resetOffline(): Promise<void> {
  await unregisterAll();
  window.location.reload();
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
}
