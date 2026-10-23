import { resolveBrowserServerRoot } from "@/lib/server-url";

// One connectivity heartbeat for the whole app.
//
// Previously every `useOnline()` instance ran its own `/health` probe on its own
// 15s timer. The banner and the study provider both mount, so a weak connection
// paid for two probes and could disagree with itself. This module owns a single
// probe loop, browser online/offline events, and a small failure threshold so a
// single dropped request doesn't paint the room red.
//
// A probe that answers means Kiftet's platform is reachable — grading, sessions
// and the outbox can work. A probe that fails twice in a row means "no
// connection" is honest. Any successful API request also reports back here, so
// the state self-heals the moment a real request gets through.

const API = (import.meta.env.VITE_SERVER_URL as string) || "";

const PROBE_TIMEOUT_MS = 6_000;
const ONLINE_INTERVAL_MS = 20_000;
const OFFLINE_INTERVAL_MS = 8_000;
const FAILURES_BEFORE_OFFLINE = 2;
// Focus/visibility can fire together. Don't hammer the server when they do.
const MIN_PROBE_GAP_MS = 3_000;

type Listener = () => void;

let online =
  typeof navigator === "undefined" ? true : navigator.onLine !== false;
let failures = 0;
let lastProbeAt = 0;
let probeTimer: ReturnType<typeof setTimeout> | undefined;
let inFlightProbe: Promise<boolean> | null = null;
const listeners = new Set<Listener>();
let started = false;

function probeUrl(): string {
  if (typeof window === "undefined") return `${API || "/api"}/health`;
  const root = resolveBrowserServerRoot(
    window.location.hostname,
    window.location.origin,
    API,
  );
  return `${root}/health`;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function setOnline(next: boolean): void {
  if (online === next) return;
  online = next;
  emit();
}

function scheduleNext(delay: number): void {
  if (!started) return;
  if (probeTimer) clearTimeout(probeTimer);
  probeTimer = setTimeout(() => {
    // A hidden tab has no reader and no need to spend radio on a heartbeat.
    // `visibilitychange` probes the moment it comes back, and the browser's
    // `online` event covers a reconnect that happens while it is hidden.
    if (document.visibilityState === "hidden") {
      probeTimer = undefined;
      return;
    }
    void probe();
  }, delay);
}

function noteFailure(): void {
  failures += 1;
  // The browser already knows the device has no network interface — believe it
  // immediately. Otherwise wait for a second failure: one probe can be lost to a
  // radio hiccup, a sleeping laptop, or a captive portal login page.
  if (failures >= FAILURES_BEFORE_OFFLINE || navigator.onLine === false) {
    setOnline(false);
  }
}

export function reportReachable(): void {
  failures = 0;
  lastProbeAt = Date.now();
  setOnline(true);
  if (started) scheduleNext(ONLINE_INTERVAL_MS);
}

export function isPlatformOnline(): boolean {
  return online;
}

export function probeNow(force = false): Promise<boolean> {
  return probe(force);
}

function probe(force = false): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(true);
  if (inFlightProbe) return inFlightProbe;
  if (!force && Date.now() - lastProbeAt < MIN_PROBE_GAP_MS) {
    return Promise.resolve(online);
  }

  if (probeTimer) {
    clearTimeout(probeTimer);
    probeTimer = undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  inFlightProbe = fetch(probeUrl(), {
    headers: { accept: "text/plain" },
    cache: "no-store",
    credentials: "omit",
    signal: controller.signal,
  })
    .then((res) => {
      if (res.ok) {
        failures = 0;
        setOnline(true);
        return true;
      }
      noteFailure();
      return online;
    })
    .catch(() => {
      noteFailure();
      return online;
    })
    .finally(() => {
      clearTimeout(timeout);
      lastProbeAt = Date.now();
      inFlightProbe = null;
      scheduleNext(online ? ONLINE_INTERVAL_MS : OFFLINE_INTERVAL_MS);
    });

  return inFlightProbe;
}

function onBrowserOffline(): void {
  failures = FAILURES_BEFORE_OFFLINE;
  setOnline(false);
  scheduleNext(OFFLINE_INTERVAL_MS);
}

function onBrowserOnline(): void {
  failures = 0;
  void probe(true);
}

function onVisible(): void {
  if (document.visibilityState === "visible") void probe();
}

function start(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  setOnline(navigator.onLine !== false);
  window.addEventListener("online", onBrowserOnline);
  window.addEventListener("offline", onBrowserOffline);
  window.addEventListener("focus", onVisible);
  document.addEventListener("visibilitychange", onVisible);
  void probe(true);
}

function stop(): void {
  if (!started) return;
  started = false;
  if (probeTimer) clearTimeout(probeTimer);
  probeTimer = undefined;
  window.removeEventListener("online", onBrowserOnline);
  window.removeEventListener("offline", onBrowserOffline);
  window.removeEventListener("focus", onVisible);
  document.removeEventListener("visibilitychange", onVisible);
}

export function subscribeToConnectivity(listener: Listener): () => void {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

export function getConnectivitySnapshot(): boolean {
  return online;
}

export function getConnectivityServerSnapshot(): boolean {
  return true;
}
