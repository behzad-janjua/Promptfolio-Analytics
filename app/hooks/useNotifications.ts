"use client";

import { useState, useEffect, useCallback } from "react";
import {
  requestNotificationPermission,
  getNotificationPermission,
  onInAppNotification,
  type InAppNotificationEvent,
  type NotificationPayload,
} from "@/lib/notifications";

export interface InAppAlert extends NotificationPayload {
  title: string;
  id: number;
}

let _seq = 0;

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [alerts, setAlerts] = useState<InAppAlert[]>([]);

  // Sync permission on mount (SSR-safe).
  useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);

  // Subscribe to in-app fallback events.
  useEffect(() => {
    return onInAppNotification((e: InAppNotificationEvent) => {
      const alert: InAppAlert = { ...e.detail, id: ++_seq };
      setAlerts((prev) => [...prev, alert]);
      // Auto-dismiss after 4 s.
      setTimeout(() => {
        setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
      }, 4000);
    });
  }, []);

  const request = useCallback(async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    return result;
  }, []);

  const dismiss = useCallback((id: number) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return { permission, alerts, request, dismiss };
}
