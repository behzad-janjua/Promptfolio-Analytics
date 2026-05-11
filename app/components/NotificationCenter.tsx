"use client";

import { useNotifications, type InAppAlert } from "@/app/hooks/useNotifications";
import type { NotificationEventType } from "@/lib/notifications";

// ── Per-type styling ──────────────────────────────────────────────────────────

const TYPE_STYLES: Record<NotificationEventType, { dot: string; border: string; bg: string; text: string }> = {
  "myo:connected":      { dot: "bg-emerald-400", border: "border-emerald-500/25", bg: "bg-emerald-950/90", text: "text-emerald-300" },
  "myo:disconnected":   { dot: "bg-rose-400",    border: "border-rose-500/25",    bg: "bg-rose-950/90",    text: "text-rose-300"    },
  "model:retrained":    { dot: "bg-violet-400",  border: "border-violet-500/25",  bg: "bg-violet-950/90",  text: "text-violet-300"  },
  "target:saved":       { dot: "bg-sky-400",     border: "border-sky-500/25",     bg: "bg-sky-950/90",     text: "text-sky-300"     },
  "permission:missing": { dot: "bg-amber-400",   border: "border-amber-500/25",   bg: "bg-amber-950/90",   text: "text-amber-300"   },
};

// ── Single alert ──────────────────────────────────────────────────────────────

function Alert({ alert, onDismiss }: { alert: InAppAlert; onDismiss: (id: number) => void }) {
  const s = TYPE_STYLES[alert.type];
  return (
    <div
      className={`flex items-start gap-2.5 px-4 py-3 rounded-xl text-sm font-medium border shadow-2xl animate-slide-in-top ${s.bg} ${s.border} ${s.text}`}
      style={{ backdropFilter: "blur(12px)", minWidth: 240, maxWidth: 340 }}
    >
      <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold leading-tight">{alert.title}</p>
        {alert.body && (
          <p className="text-[11px] mt-0.5 opacity-70 leading-tight">{alert.body}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(alert.id)}
        className="shrink-0 opacity-40 hover:opacity-80 transition-opacity text-xs leading-none mt-0.5"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

// ── Alert stack (in-app fallback) ─────────────────────────────────────────────

export function InAppAlertStack() {
  const { permission, alerts, dismiss } = useNotifications();

  // Only render in-app alerts when OS notifications are not available.
  if (permission === "granted" || alerts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end pointer-events-none">
      {alerts.map((a) => (
        <div key={a.id} className="pointer-events-auto">
          <Alert alert={a} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}

// ── Permission banner ─────────────────────────────────────────────────────────

export function NotificationPermissionBanner() {
  const { permission, request } = useNotifications();

  if (permission !== "default") return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-950/60 border-b border-amber-500/15 text-xs">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
      <span className="text-amber-300/80 flex-1">
        Enable notifications to get MYO status updates and model alerts.
      </span>
      <button
        onClick={request}
        className="btn-press shrink-0 px-3 py-1 rounded-md bg-amber-500/15 border border-amber-500/25 text-amber-300 font-semibold hover:bg-amber-500/22 transition-colors"
      >
        Enable
      </button>
    </div>
  );
}
