import {
  createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef,
} from "react";
import { AlertTriangle, Bell, CheckCircle2, Info, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, connectSSE, initConfig } from "../../lib/api";
import type { AppNotification, Settings } from "../../lib/types";
import { notificationPath } from "../../lib/entityLinks";
import { relativeTime } from "../../lib/utils";

interface ToastItem {
  id: number;
  message: string;
  error?: boolean;
  notification?: AppNotification;
}

interface ToastCtx {
  toast: (msg: string, error?: boolean) => void;
  notifications: AppNotification[];
  unreadCount: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  reloadNotifications: () => Promise<void>;
}

const ToastContext = createContext<ToastCtx>({
  toast: () => {}, notifications: [], unreadCount: 0,
  markRead: async () => {}, markAllRead: async () => {}, reloadNotifications: async () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

const iconFor = (severity?: string) => severity === "success" ? CheckCircle2 : severity === "error" ? AlertTriangle : Info;
const toastTone: Record<string, string> = {
  success: "border-lime/50 text-lime",
  error: "border-nred/50 text-nred",
  attention: "border-amber/50 text-amber",
  info: "border-cyan/50 text-cyan",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [browserEnabled, setBrowserEnabled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef(location);
  locationRef.current = location;

  const toast = useCallback((message: string, error = false) => {
    const id = nextId++;
    setToasts((current) => [...current.slice(-2), { id, message, error }]);
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 3_500);
  }, []);

  const reloadNotifications = useCallback(async () => {
    try { setNotifications(await api.get<AppNotification[]>("/notifications?limit=50")); } catch {}
  }, []);

  const showNotification = useCallback((notification: AppNotification) => {
    setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 50));
    const path = notificationPath(notification);
    const isVisibleChat = notification.type === "gordon_chat_reply" && locationRef.current.pathname === "/app/agent";
    if (!isVisibleChat) {
      const id = nextId++;
      setToasts((current) => [...current.slice(-2), { id, message: notification.title, notification }]);
      setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 8_000);
    }
    if (browserEnabled && document.hidden && "Notification" in window && Notification.permission === "granted") {
      const desktop = new Notification(notification.title, { body: notification.body || "Open Key of Solomon for details." });
      desktop.onclick = () => { window.focus(); navigate(path); desktop.close(); };
    }
  }, [browserEnabled, navigate]);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    void initConfig().then(async () => {
      if (cancelled) return;
      await reloadNotifications();
      try {
        const settings = await api.get<Settings>("/settings");
        setBrowserEnabled(settings.browserNotificationsEnabled === "true");
      } catch {}
      const connectionCleanup = connectSSE((event) => {
        if (event.type === "notification_created" && event.notification) {
          showNotification(event.notification as AppNotification);
        }
      });
      if (cancelled) connectionCleanup();
      else cleanup = connectionCleanup;
    });
    const onSetting = (event: Event) => setBrowserEnabled((event as CustomEvent<boolean>).detail);
    window.addEventListener("browser-notification-setting-changed", onSetting);
    return () => { cancelled = true; cleanup(); window.removeEventListener("browser-notification-setting-changed", onSetting); };
  }, [reloadNotifications, showNotification]);

  const markRead = useCallback(async (id: string) => {
    await api.post(`/notifications/${id}/read`);
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
  }, []);

  const markAllRead = useCallback(async () => {
    await api.post("/notifications/read-all");
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || readAt })));
  }, []);

  const dismiss = (id: number) => setToasts((current) => current.filter((item) => item.id !== id));
  const openNotification = async (item: ToastItem) => {
    if (!item.notification) return;
    await markRead(item.notification.id);
    dismiss(item.id);
    navigate(notificationPath(item.notification));
  };

  return (
    <ToastContext.Provider value={{
      toast, notifications, unreadCount: notifications.filter((item) => !item.readAt).length,
      markRead, markAllRead, reloadNotifications,
    }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[90] flex max-w-[390px] flex-col gap-2 pointer-events-none" aria-live="polite">
        {toasts.map((item) => {
          const severity = item.notification?.severity || (item.error ? "error" : "info");
          const Icon = iconFor(severity);
          return (
            <div key={item.id}
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border font-mono text-sm shadow-2xl bg-panel/95 ${toastTone[severity]}`}
              style={{ animation: "rise 0.3s backwards", boxShadow: "0 18px 50px rgba(0,0,0,.45)" }}>
              <Icon size={17} className="mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#e6f2ff]">{item.message}</p>
                {item.notification?.body && <p className="mt-1 text-xs text-dim line-clamp-2">{item.notification.body}</p>}
                {item.notification && (
                  <button onClick={() => openNotification(item)} className="mt-2 text-xs text-cyan hover:text-white focus:outline-none focus:underline">
                    {item.notification.type === "approval_requested"
                      ? "Review approval →"
                      : item.notification.targetType === "task"
                        ? "View task →"
                        : "View details →"}
                  </button>
                )}
              </div>
              <button onClick={() => dismiss(item.id)} aria-label="Dismiss notification" className="opacity-60 hover:opacity-100"><X size={14} /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function NotificationCenter({ compact = false }: { compact?: boolean }) {
  const { notifications, unreadCount, markRead, markAllRead } = useToast();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="relative">
      <button onClick={() => setOpen((value) => !value)} aria-label={`Notifications, ${unreadCount} unread`}
        className={`relative inline-flex items-center justify-center rounded-lg border border-line text-dim hover:text-cyan hover:border-cyan/40 transition-colors ${compact ? "w-8 h-8" : "w-9 h-9"}`}>
        <Bell size={compact ? 14 : 16} />
        {unreadCount > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-pink text-black text-[10px] font-bold flex items-center justify-center">{Math.min(unreadCount, 99)}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-w-[80vw] rounded-2xl border border-line bg-panel shadow-2xl z-[100] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <span className="font-mono text-xs uppercase tracking-[2px] text-dim">Notifications</span>
            {unreadCount > 0 && <button onClick={markAllRead} className="text-[11px] font-mono text-cyan hover:text-white">Mark all read</button>}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {notifications.slice(0, 20).map((notification) => (
              <button key={notification.id} onClick={async () => {
                await markRead(notification.id); setOpen(false); navigate(notificationPath(notification));
              }} className={`w-full text-left px-4 py-3 border-b border-line/80 hover:bg-white/[0.04] ${notification.readAt ? "opacity-60" : "bg-cyan/[0.025]"}`}>
                <div className="flex items-start gap-2">
                  {!notification.readAt && <span className="w-1.5 h-1.5 rounded-full bg-cyan mt-1.5 flex-shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[#e6f2ff] truncate">{notification.title}</p>
                    {notification.body && <p className="text-xs text-dim line-clamp-2 mt-0.5">{notification.body}</p>}
                    <p className="font-mono text-[10px] text-faint mt-1">{relativeTime(notification.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))}
            {notifications.length === 0 && <p className="text-sm text-dim text-center py-8">No notifications yet</p>}
          </div>
        </div>
      )}
    </div>
  );
}
