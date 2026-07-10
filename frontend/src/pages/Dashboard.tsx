import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Bot, Zap, Activity, AlertTriangle, CheckCircle2, CalendarClock, Hourglass,
  ListTodo, Lightbulb, FolderKanban, Sparkles, ArrowRight,
  Code2, Briefcase, Home, Box, FolderClock, Flame,
} from "lucide-react";
import { api, connectSSE } from "../lib/api";
import type {
  DashboardState, Task, Project, Idea, Note, AgentAction,
  AISummary, Settings, UpcomingDeadline, TickerItem,
} from "../lib/types";
import { relativeTime } from "../lib/utils";

// ─── tokens ─────────────────────────────────────────────────────────────────

const C = {
  cyan: "#00f0ff", blue: "#3b82f6", pink: "#ff2d95", purple: "#a78bfa",
  lime: "#b6ff2e", amber: "#ffb020", red: "#ff4757", dim: "#7e90ad", faint: "#45536d",
};

const STATUS_ACCENT: Record<string, string> = {
  active: C.cyan, blocked: C.red, paused: C.amber,
  planning: C.purple, completed: C.lime, archived: C.faint,
};
const PRIORITY_COLOR: Record<string, string> = {
  urgent: C.pink, high: C.red, medium: C.amber, low: C.dim,
};
const CAT_ICON: Record<string, React.ElementType> = {
  coding: Code2, business: Briefcase, home: Home, "3d-printing": Box,
};
const IDEA_STATUS_COLOR: Record<string, string> = {
  possible: C.lime, reviewing: C.cyan, captured: C.purple, converted: C.faint, archived: C.faint,
};
const TICKER_COLOR: Record<string, string> = {
  urgent: C.pink, overdue: C.red, blocked: C.red, due_soon: C.amber,
  stale: C.dim, idea: C.purple, agent: C.lime, updated: C.cyan,
};

type AgentState = "idle" | "working" | "attention" | "error";

// Reduced-motion flows down so AutoScroll can fall back to manual scrolling.
const ReducedMotionContext = createContext(false);

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * AutoScroll — a self-scrolling viewport for wall displays. When its content
 * overflows it gently ping-pongs top↔bottom with a pause at each end; it reads
 * scrollHeight live each frame so it adapts as data refreshes. Pauses on hover
 * (so you can read), and falls back to a normal scrollbar in reduced-motion.
 */
function AutoScroll({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const reduced = useContext(ReducedMotionContext);
  const ref = useRef<HTMLDivElement>(null);
  const hover = useRef(false);

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let dir = 1;
    let dwell = 1.4;            // initial pause so a fresh load is readable
    let last = performance.now();
    const SPEED = 18;          // px per second
    const DWELL = 1.6;         // seconds paused at each end

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 4) {
        el.scrollTop = 0;       // nothing to scroll
      } else if (!hover.current) {
        if (dwell > 0) {
          dwell -= dt;
        } else {
          el.scrollTop += dir * SPEED * dt;
          if (el.scrollTop >= max - 0.5) { el.scrollTop = max; dir = -1; dwell = DWELL; }
          else if (el.scrollTop <= 0.5) { el.scrollTop = 0; dir = 1; dwell = DWELL; }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <div
      ref={ref}
      onMouseEnter={() => { hover.current = true; }}
      onMouseLeave={() => { hover.current = false; }}
      className={`flex-1 min-h-0 ${reduced ? "overflow-y-auto" : "overflow-hidden"} ${className}`}
    >
      {children}
    </div>
  );
}

function dueLabel(due?: string): { text: string; cls: string; urgent: boolean } | null {
  if (!due) return null;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOfDay(new Date(due)) - startOfDay(new Date())) / 86_400_000);
  if (diff < 0) return { text: `${Math.abs(diff)}d late`, cls: "text-nred", urgent: true };
  if (diff === 0) return { text: "today", cls: "text-amber", urgent: true };
  if (diff === 1) return { text: "tomorrow", cls: "text-amber", urgent: false };
  if (diff <= 7) return { text: `${diff}d`, cls: "text-dim", urgent: false };
  return { text: relativeTime(due), cls: "text-faint", urgent: false };
}

function timeStr() {
  return new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ─── small building blocks ────────────────────────────────────────────────────

function Kpi({ label, value, color, icon: Icon, alert }: {
  label: string; value: number; color: string; icon: React.ElementType; alert?: boolean;
}) {
  return (
    <div className="relative px-4 py-2 rounded-xl bg-panel border border-line overflow-hidden min-w-[112px]">
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon size={14} style={{ color }} />
        <span className="font-mono text-[11px] tracking-[1.5px] text-dim uppercase">{label}</span>
      </div>
      <div
        className="font-display font-bold leading-none"
        style={{ color, fontSize: "2.3rem", textShadow: `0 0 18px ${color}55` }}
      >
        {value}
      </div>
      <div className="absolute left-0 right-0 bottom-0 h-[3px]" style={{ background: color, opacity: 0.7, boxShadow: `0 0 10px ${color}` }} />
      {alert && value > 0 && (
        <div className="absolute inset-0 pointer-events-none animate-pulse-slow" style={{ boxShadow: `inset 0 0 26px ${color}22` }} />
      )}
    </div>
  );
}

function Panel({ title, accent, action, children, className }: {
  title: string; accent: string; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`card flex flex-col min-h-0 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full animate-pulse-slow" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
          <span className="font-mono text-[13px] tracking-[2.5px] uppercase text-dim">{title}</span>
        </div>
        {action}
      </div>
      <AutoScroll className="px-4 pb-3">{children}</AutoScroll>
    </div>
  );
}

function AllLink({ to, color }: { to: string; color: string }) {
  return (
    <Link to={to} className="font-mono text-[11px] text-faint hover:opacity-100 opacity-80 flex items-center gap-1 transition-opacity"
      style={{ color }}>
      all <ArrowRight size={12} />
    </Link>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="text-faint font-mono text-[12px] tracking-wide text-center py-6">{label}</div>;
}

// ─── projects ─────────────────────────────────────────────────────────────────

function ProjectRow({ p }: { p: Project }) {
  const accent = STATUS_ACCENT[p.status] ?? C.dim;
  const Icon = CAT_ICON[p.category ?? ""] ?? FolderKanban;
  const pct = Math.min(100, Math.max(0, p.progressPercent ?? 0));
  const due = dueLabel(p.dueDate);
  return (
    <div className="rounded-xl bg-panel2 border border-line p-3 mb-2.5" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${accent}1f`, border: `1px solid ${accent}55` }}>
          <Icon size={18} style={{ color: accent }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display font-semibold text-[15px] text-white truncate">{p.title}</div>
          <div className="text-[12px] text-dim truncate">{p.shortDescription || p.category || "—"}</div>
        </div>
        <span className="badge text-[10px]" style={{ color: accent, borderColor: `${accent}66` }}>{p.status}</span>
      </div>
      <div className="progress-bar h-2 mt-2.5"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
      <div className="flex items-center justify-between mt-1.5 font-mono text-[12px]">
        <span className="text-dim">{pct}%</span>
        {due && <span className={due.cls}>⏱ {due.text}</span>}
      </div>
    </div>
  );
}

// ─── tasks ─────────────────────────────────────────────────────────────────────

function TaskItem({ t, done }: { t: Task; done?: boolean }) {
  const pc = PRIORITY_COLOR[t.priority ?? ""] ?? "transparent";
  const due = done ? null : dueLabel(t.dueDate);
  return (
    <div className="flex items-start gap-2 py-2 px-2 rounded-lg hover:bg-white/[0.04] transition-colors">
      <span className="w-2 h-2 rounded-full mt-[7px] flex-shrink-0"
        style={{ background: pc, boxShadow: pc !== "transparent" ? `0 0 6px ${pc}` : "none" }} />
      <div className="min-w-0 flex-1">
        <div className={`text-[14px] leading-snug ${done ? "text-faint line-through" : "text-[#dbe8fa]"}`}>{t.title}</div>
        <div className="flex items-center gap-2 mt-0.5 font-mono text-[11px] text-faint">
          {t.area && <span className="uppercase tracking-wide">{t.area}</span>}
          {t.priority && !done && <span style={{ color: pc }}>{t.priority}</span>}
          {due && <span className={due.cls}>{due.text}</span>}
          {t.agentCandidate && !done && <Bot size={12} className="text-purple" />}
        </div>
      </div>
    </div>
  );
}

function TaskColumn({ label, icon: Icon, accent, tasks, done, max = 12 }: {
  label: string; icon: React.ElementType; accent: string; tasks: Task[]; done?: boolean; max?: number;
}) {
  return (
    <div className="flex flex-col min-h-0 rounded-xl bg-panel2 border border-line overflow-hidden"
      style={{ borderTop: `2px solid ${accent}` }}>
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0 border-b border-line">
        <Icon size={15} style={{ color: accent }} />
        <span className="font-mono text-[12px] tracking-[1.5px] uppercase" style={{ color: accent }}>{label}</span>
        <span className="ml-auto font-display font-bold text-[16px]" style={{ color: accent }}>{tasks.length}</span>
      </div>
      <AutoScroll className="px-1.5 py-1">
        {tasks.length === 0 ? (
          <div className="text-faint font-mono text-[11px] text-center py-5">clear</div>
        ) : (
          <>
            {tasks.slice(0, max).map((t) => <TaskItem key={t.id} t={t} done={done} />)}
            {tasks.length > max && (
              <div className="text-faint font-mono text-[11px] text-center py-1">+{tasks.length - max} more</div>
            )}
          </>
        )}
      </AutoScroll>
    </div>
  );
}

function ActiveTaskRail({ tasks }: { tasks: Task[] }) {
  if (!tasks.length) {
    return (
      <div className="mx-3 mb-2 rounded-xl border border-line bg-panel2 px-3 py-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Zap size={13} className="text-cyan" />
          <span className="font-mono text-[12px] tracking-[2px] uppercase text-cyan">Active Tasks</span>
          <span className="ml-auto font-mono text-[11px] text-faint">clear</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-3 mb-2 rounded-xl border border-cyan/20 bg-panel2 px-3 py-2 flex-shrink-0">
      <div className="flex items-center gap-2 mb-1.5">
        <Zap size={13} className="text-cyan" />
        <span className="font-mono text-[12px] tracking-[2px] uppercase text-cyan">Active Tasks</span>
        <span className="font-display font-bold text-[15px] text-cyan">{tasks.length}</span>
        <span className="ml-auto font-mono text-[11px] text-faint">
          {tasks.length > 3 ? `top 3 / +${tasks.length - 3}` : "now / next"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {tasks.slice(0, 3).map((t) => {
          const due = dueLabel(t.dueDate);
          const pc = PRIORITY_COLOR[t.priority ?? ""] ?? C.dim;
          return (
            <div key={t.id} className="min-w-0 rounded-lg border border-line bg-[#070b14]/80 px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: pc, boxShadow: `0 0 6px ${pc}` }}
                />
                <span className="text-[13px] text-[#dbe8fa] truncate flex-1">{t.title}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 font-mono text-[10px] text-faint">
                <span className="uppercase tracking-wide">{t.status.replace("_", " ")}</span>
                {t.area && <span className="uppercase tracking-wide truncate">{t.area}</span>}
                {due && <span className={`${due.cls} ml-auto flex-shrink-0`}>{due.text}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ticker ─────────────────────────────────────────────────────────────────────

function Ticker({ items }: { items: TickerItem[] }) {
  if (!items.length) return null;
  const loop = [...items, ...items];
  return (
    <div className="relative overflow-hidden border-y border-line bg-[#05080f]/80 h-9 flex items-center flex-shrink-0">
      <div className="absolute left-0 inset-y-0 w-20 z-10" style={{ background: "linear-gradient(to right,#04060c,transparent)" }} />
      <div className="absolute right-0 inset-y-0 w-20 z-10" style={{ background: "linear-gradient(to left,#04060c,transparent)" }} />
      <div className="flex gap-10 whitespace-nowrap animate-ticker px-6">
        {loop.map((it, i) => {
          const c = TICKER_COLOR[it.type] ?? C.dim;
          return (
            <span key={i} className="flex items-center gap-2 text-[14px]">
              <span className="font-mono text-[10px] tracking-widest px-1.5 py-0.5 rounded"
                style={{ color: c, border: `1px solid ${c}66`, background: `${c}14` }}>{it.label}</span>
              <span className="text-dim">{it.text}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── agent ─────────────────────────────────────────────────────────────────────

function AgentPanel({ state, actions, pending }: { state: AgentState; actions: AgentAction[]; pending: number }) {
  const map: Record<AgentState, [string, string]> = {
    idle: [C.dim, "IDLE"], working: [C.cyan, "WORKING"],
    attention: [C.amber, "NEEDS ATTENTION"], error: [C.red, "ERROR"],
  };
  const [c, label] = map[state];
  const latest = actions[0];
  return (
    <div className="card flex flex-col flex-shrink-0">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full animate-pulse-slow" style={{ background: C.lime, boxShadow: `0 0 8px ${C.lime}` }} />
          <span className="font-mono text-[13px] tracking-[2.5px] uppercase text-dim">OpenClaw Agent</span>
        </div>
        <Link to="/app/agent" className="font-mono text-[11px] text-faint hover:text-lime flex items-center gap-1">
          center <ArrowRight size={12} />
        </Link>
      </div>
      <div className="px-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12 flex-shrink-0">
            <div className="absolute inset-0 rounded-full border-2 animate-spin"
              style={{ borderColor: `${c}25`, borderTopColor: c, animationDuration: "3s" }} />
            <div className="absolute inset-2 rounded-full flex items-center justify-center"
              style={{ background: `radial-gradient(circle, ${c}33, transparent)` }}>
              <Bot size={18} style={{ color: c }} />
            </div>
            {pending > 0 && (
              <div className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-amber flex items-center justify-center">
                <span className="text-[11px] font-bold text-black">{pending}</span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[12px] tracking-[2px]" style={{ color: c }}>{label}</div>
            <div className="text-[13px] text-dim truncate max-w-[220px]">{latest ? latest.summary : "No recent activity"}</div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {actions.slice(0, 3).map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-[12px]">
              <span className="font-mono text-[10px] text-purple uppercase tracking-wide flex-shrink-0">
                {a.actionType.replace(/_/g, " ")}
              </span>
              <span className="text-dim truncate flex-1">{a.summary}</span>
              <span className="font-mono text-[10px] text-faint flex-shrink-0">{relativeTime(a.createdAt)}</span>
            </div>
          ))}
          {actions.length === 0 && <div className="text-faint font-mono text-[11px]">No agent actions yet</div>}
        </div>
      </div>
    </div>
  );
}

// ─── deadlines / ideas / activity / AI ───────────────────────────────────────────

function DeadlineRow({ d }: { d: UpcomingDeadline }) {
  const Icon = d.kind === "project" ? FolderKanban : ListTodo;
  const due = dueLabel(d.dueDate);
  const pc = PRIORITY_COLOR[d.priority ?? ""] ?? C.dim;
  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-line last:border-0">
      <Icon size={14} style={{ color: pc }} className="flex-shrink-0" />
      <span className="text-[13px] text-dim truncate flex-1">{d.title}</span>
      {due && <span className={`font-mono text-[12px] flex-shrink-0 ${due.cls}`}>{due.text}</span>}
    </div>
  );
}

function IdeaRow({ i }: { i: Idea }) {
  const c = IDEA_STATUS_COLOR[i.status] ?? C.dim;
  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-line last:border-0">
      <Lightbulb size={14} className="text-purple flex-shrink-0" />
      <span className="text-[13px] text-dim truncate flex-1">{i.title}</span>
      <span className="font-mono text-[11px] flex-shrink-0" style={{ color: c }}>{i.status}</span>
    </div>
  );
}

function ActivityRow({ n }: { n: Note }) {
  const authorColor: Record<string, string> = { agent: C.lime, user: C.blue, system: C.faint };
  const typeAccent: Record<string, string> = {
    blocker: C.red, progress: C.cyan, decision: C.amber, agent_update: C.lime, note: C.faint,
  };
  return (
    <div className="py-2 border-b border-line last:border-0 pl-2" style={{ borderLeft: `2px solid ${typeAccent[n.type] ?? C.faint}` }}>
      <p className="text-[13px] text-[#dbe8fa] leading-snug line-clamp-2">{n.body}</p>
      <div className="flex gap-2 mt-0.5 font-mono text-[11px]">
        <span style={{ color: authorColor[n.createdBy] ?? C.faint }}>{n.createdBy}</span>
        <span className="text-faint">· {n.parentType} · {relativeTime(n.createdAt)}</span>
      </div>
    </div>
  );
}

function AIInsight({ summaries }: { summaries: AISummary[] }) {
  const [idx, setIdx] = useState(0);
  if (!summaries.length) {
    return (
      <div className="card flex-shrink-0 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-pink animate-pulse-slow" style={{ boxShadow: `0 0 8px ${C.pink}` }} />
          <span className="font-mono text-[13px] tracking-[2.5px] uppercase text-dim">AI Insight</span>
        </div>
        <p className="text-[13px] text-faint leading-relaxed">
          Configure an AI provider in Settings, then generate summaries from the Agent Center.
        </p>
        <Link to="/app/settings" className="font-mono text-[12px] text-purple hover:text-pink mt-2 inline-flex items-center gap-1">
          → Settings
        </Link>
      </div>
    );
  }
  const s = summaries[Math.min(idx, summaries.length - 1)];
  return (
    <div className="card flex-shrink-0 p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <Sparkles size={14} className="text-pink" />
        <span className="font-mono text-[13px] tracking-[2.5px] uppercase text-dim">AI Insight</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {summaries.map((sum, i) => (
          <button key={sum.id} onClick={() => setIdx(i)}
            className={`font-mono text-[10px] px-2 py-1 rounded border transition-colors ${
              i === idx ? "border-pink/60 text-pink bg-pink/10" : "border-line text-faint hover:text-dim"}`}>
            {sum.type.replace(/_/g, " ")}
          </button>
        ))}
      </div>
      <p className="text-[13px] text-dim leading-relaxed line-clamp-5">{s.content}</p>
      <div className="font-mono text-[11px] text-faint mt-2">{s.provider} · {relativeTime(s.generatedAt)}</div>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export function Dashboard() {
  const [data, setData] = useState<DashboardState | null>(null);
  const [summaries, setSummaries] = useState<AISummary[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [clock, setClock] = useState(timeStr());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      // Dashboard state is the critical payload; the rest are best-effort so a
      // single failing endpoint can never pin the whole board on "loading…".
      const [dash, sums, pendingList] = await Promise.all([
        api.get<DashboardState>("/dashboard/state"),
        api.get<AISummary[]>("/ai/summaries").catch(() => [] as AISummary[]),
        api.get<unknown[]>("/approvals/pending").catch(() => [] as unknown[]),
      ]);
      setData(dash);
      setSummaries(Array.isArray(sums) ? sums : []);
      setPendingApprovals(Array.isArray(pendingList) ? pendingList.length : 0);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("[dashboard] load failed:", err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // initial load + settings
  useEffect(() => {
    load();
    api.get<Settings>("/settings").then(setSettings).catch(() => null);
  }, [load]);

  // live clock
  useEffect(() => {
    const id = setInterval(() => setClock(timeStr()), 1000);
    return () => clearInterval(id);
  }, []);

  // auto-refresh poll
  useEffect(() => {
    const secs = Math.max(5, parseInt(settings?.dashboardRefreshSeconds ?? "30", 10) || 30);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(load, secs * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [settings?.dashboardRefreshSeconds, load]);

  // SSE live updates — server emits "data-changed" on every mutation.
  useEffect(() => {
    const cleanup = connectSSE((event) => {
      if (["data-changed", "project_updated", "task_updated", "idea_updated", "agent_action"].includes(event.type)) {
        load();
      }
      if (event.type === "approval_requested") setPendingApprovals((n) => n + 1);
    });
    return cleanup;
  }, [load]);

  const reduced = settings?.reducedMotion === "true";
  const s = data?.summary;
  const tasks = data?.tasks;
  const agentActions = data?.agentActions ?? [];
  const lastAction = agentActions[0];
  const activeTasks = (() => {
    if (!tasks) return [];
    const seen = new Set<string>();
    return [
      ...tasks.inProgress,
      ...tasks.dueToday,
      ...tasks.todo,
      ...tasks.waiting,
    ].filter((task) => {
      if (seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    });
  })();

  const agentState: AgentState = (() => {
    if (pendingApprovals > 0) return "attention";
    if (!lastAction) return "idle";
    if (lastAction.actionType === "error") return "error";
    return Date.now() - new Date(lastAction.createdAt).getTime() < 300_000 ? "working" : "idle";
  })();

  return (
    <ReducedMotionContext.Provider value={reduced}>
    <div className={`flex flex-col h-screen overflow-hidden bg-bg ${reduced ? "reduced" : ""}`}>
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-5 px-6 py-3 border-b border-line flex-shrink-0">
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span className="w-3 h-3 rounded-full bg-cyan animate-pulse-slow" style={{ boxShadow: `0 0 12px ${C.cyan}` }} />
          <span className="font-display font-bold text-2xl tracking-[3px] text-white">
            KEY OF <span className="text-cyan" style={{ textShadow: `0 0 16px ${C.cyan}` }}>SOLOMON</span>
          </span>
        </div>
        <div className="font-mono text-xl text-cyan flex-shrink-0" style={{ textShadow: "0 0 12px rgba(0,240,255,.4)" }}>{clock}</div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`w-2 h-2 rounded-full ${refreshing ? "bg-amber animate-pulse" : "bg-lime"}`} />
          <span className="font-mono text-[12px] text-faint">
            {refreshing ? "syncing…" : lastRefresh ? `synced ${relativeTime(lastRefresh.toISOString())}` : "connecting…"}
          </span>
        </div>
        <div className="flex items-center gap-2.5 ml-auto">
          <Kpi label="Projects" value={s?.activeProjects ?? 0} color={C.cyan} icon={FolderKanban} />
          <Kpi label="Open Tasks" value={s?.openTasks ?? 0} color={C.blue} icon={ListTodo} />
          <Kpi label="Due Today" value={s?.dueToday ?? 0} color={C.amber} icon={CalendarClock} alert />
          <Kpi label="Overdue" value={s?.overdue ?? 0} color={C.red} icon={Flame} alert />
          <Kpi label="Blocked" value={s?.blockedItems ?? 0} color={C.pink} icon={AlertTriangle} alert />
          <Kpi label="Ideas" value={s?.ideas ?? 0} color={C.purple} icon={Lightbulb} />
        </div>
      </header>

      {/* ── TICKER ─────────────────────────────────────────────────────────── */}
      {!reduced && <Ticker items={data?.ticker ?? []} />}

      {/* ── MAIN ───────────────────────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 grid gap-3 p-3" style={{ gridTemplateColumns: "340px 1fr 360px" }}>

        {/* LEFT: projects + activity */}
        <div className="flex flex-col gap-3 min-h-0">
          <Panel title="Active Projects" accent={C.cyan} className="flex-[1.4]" action={<AllLink to="/app/projects" color={C.cyan} />}>
            {(data?.projects ?? []).map((p) => <ProjectRow key={p.id} p={p} />)}
            {data && data.projects.length === 0 && <Empty label="NO ACTIVE PROJECTS" />}
          </Panel>
          <Panel title="Recent Activity" accent={C.purple} className="flex-1" action={<AllLink to="/app/activity" color={C.purple} />}>
            {(data?.recentNotes ?? []).slice(0, 10).map((n) => <ActivityRow key={n.id} n={n} />)}
            {data && data.recentNotes.length === 0 && <Empty label="NO ACTIVITY YET" />}
          </Panel>
        </div>

        {/* CENTER: task command board */}
        <div className="card flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full animate-pulse-slow" style={{ background: C.blue, boxShadow: `0 0 8px ${C.blue}` }} />
              <span className="font-mono text-[13px] tracking-[2.5px] uppercase text-dim">Task Command Board</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[12px] text-faint">{s?.openTasks ?? 0} open · {s?.completedToday ?? 0} done today</span>
              <AllLink to="/app/tasks" color={C.blue} />
            </div>
          </div>
          <ActiveTaskRail tasks={activeTasks} />
          <div className="flex-1 min-h-0 grid grid-cols-3 grid-rows-2 gap-2.5 px-3 pb-3">
            <TaskColumn label="In Progress" icon={Activity} accent={C.cyan} tasks={tasks?.inProgress ?? []} />
            <TaskColumn label="Due Today" icon={CalendarClock} accent={C.amber} tasks={tasks?.dueToday ?? []} />
            <TaskColumn label="Blocked" icon={AlertTriangle} accent={C.red} tasks={tasks?.blocked ?? []} />
            <TaskColumn label="To Do" icon={ListTodo} accent={C.blue} tasks={tasks?.todo ?? []} />
            <TaskColumn label="Waiting" icon={Hourglass} accent={C.purple} tasks={tasks?.waiting ?? []} />
            <TaskColumn label="Done Today" icon={CheckCircle2} accent={C.lime} tasks={tasks?.completedToday ?? []} done />
          </div>
        </div>

        {/* RIGHT: agent + deadlines + ideas + AI */}
        <div className="flex flex-col gap-3 min-h-0">
          <AgentPanel state={agentState} actions={agentActions} pending={pendingApprovals} />
          <Panel title="Upcoming Deadlines" accent={C.amber} className="flex-1">
            {(data?.upcomingDeadlines ?? []).map((d) => <DeadlineRow key={`${d.kind}-${d.id}`} d={d} />)}
            {data && (data.upcomingDeadlines?.length ?? 0) === 0 && <Empty label="NOTHING DUE THIS WEEK" />}
          </Panel>
          <Panel title="Ideas" accent={C.purple} className="flex-1" action={<AllLink to="/app/ideas" color={C.purple} />}>
            {(data?.ideas ?? []).slice(0, 8).map((i) => <IdeaRow key={i.id} i={i} />)}
            {data && data.ideas.length === 0 && <Empty label="IDEA VAULT EMPTY" />}
          </Panel>
          <AIInsight summaries={summaries} />
        </div>
      </main>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className="flex items-center justify-between px-6 py-2 border-t border-line flex-shrink-0 font-mono text-[12px] text-faint">
        <span>KEY OF SOLOMON v0.2.0-beta.2</span>
        <div className="flex gap-5">
          <Link to="/capture" className="hover:text-lime flex items-center gap-1"><Zap size={13} /> Fast Capture</Link>
          <Link to="/app/agent" className="hover:text-cyan flex items-center gap-1"><Bot size={13} /> Agent Center</Link>
          <Link to="/app" className="hover:text-cyan flex items-center gap-1"><FolderClock size={13} /> Control Panel</Link>
        </div>
        <span>auto-refresh: {settings?.dashboardRefreshSeconds ?? "30"}s</span>
      </footer>

      {/* ticker keyframes */}
      <style>{`
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-ticker { animation: ticker ${Math.max(28, (data?.ticker?.length ?? 5) * 7)}s linear infinite; }
        .reduced .animate-ticker { animation: none; }
      `}</style>
    </div>
    </ReducedMotionContext.Provider>
  );
}
