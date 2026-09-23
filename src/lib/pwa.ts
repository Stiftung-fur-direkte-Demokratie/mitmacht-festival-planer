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
      if (reloading) return;
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

/** Sucht nach einer neuen Version. */
export async function checkForUpdate(): Promise<"updated" | "current" | "none"> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return "none";
  if (swDisabled()) return "none";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) return "none";
    await reg.update();
    const waiting = reg.waiting;
    if (waiting) {
      waiting.postMessage("SKIP_WAITING");
      return "updated";
    }
    return "current";
  } catch {
    return "none";
  }
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
