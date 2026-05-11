// Web Notifications API wrapper.
// Gracefully degrades: if permission is denied, events are emitted on the
// document so in-app listeners can still react.

export type NotificationEventType =
  | "myo:connected"
  | "myo:disconnected"
  | "model:retrained"
  | "target:saved"
  | "permission:missing";

export interface NotificationPayload {
  type: NotificationEventType;
  body?: string;
}

// ── Per-event copy ────────────────────────────────────────────────────────────

const EVENT_DEFAULTS: Record<NotificationEventType, { title: string; body: string; icon?: string }> = {
  "myo:connected":    { title: "MYO Connected",       body: "Armband ready" },
  "myo:disconnected": { title: "MYO Disconnected",    body: "Armband lost connection" },
  "model:retrained":  { title: "Model Updated",        body: "Gesture model retrained successfully" },
  "target:saved":     { title: "Target Saved",         body: "New target has been recorded" },
  "permission:missing": { title: "Permission Required", body: "A required permission is unavailable" },
};

// ── In-app fallback event ─────────────────────────────────────────────────────

const IN_APP_EVENT = "pulse:notification";

export interface InAppNotificationEvent extends CustomEvent {
  detail: NotificationPayload & { title: string };
}

function dispatchInApp(payload: NotificationPayload & { title: string }): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent(IN_APP_EVENT, { detail: payload }));
}

// ── Permission ────────────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied")  return "denied";
  return Notification.requestPermission();
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof Notification === "undefined") return "denied";
  return Notification.permission;
}

// ── Send ──────────────────────────────────────────────────────────────────────

export function sendNotification(payload: NotificationPayload): void {
  const defaults = EVENT_DEFAULTS[payload.type];
  const title    = defaults.title;
  const body     = payload.body ?? defaults.body;

  // Always emit the in-app event so UI components can react regardless of OS permission.
  dispatchInApp({ ...payload, title, body });

  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  const n = new Notification(title, {
    body,
    icon:   defaults.icon,
    tag:    payload.type,          // collapses duplicate events of the same type
    silent: payload.type === "myo:connected" || payload.type === "target:saved",
  });

  // Auto-close after 5 s so the notification center doesn't pile up.
  setTimeout(() => n.close(), 5000);
}

// ── Typed convenience senders ─────────────────────────────────────────────────

export const notify = {
  myoConnected():                             void { sendNotification({ type: "myo:connected" }); },
  myoDisconnected():                          void { sendNotification({ type: "myo:disconnected" }); },
  modelRetrained(detail?: string):            void { sendNotification({ type: "model:retrained", body: detail }); },
  targetSaved(name?: string):                 void { sendNotification({ type: "target:saved",    body: name ? `"${name}" saved` : undefined }); },
  permissionMissing(what: string):            void { sendNotification({ type: "permission:missing", body: `${what} permission is required` }); },
};

// ── In-app subscriber helper ──────────────────────────────────────────────────

export function onInAppNotification(
  handler: (e: InAppNotificationEvent) => void
): () => void {
  if (typeof document === "undefined") return () => {};
  const listener = handler as EventListener;
  document.addEventListener(IN_APP_EVENT, listener);
  return () => document.removeEventListener(IN_APP_EVENT, listener);
}
