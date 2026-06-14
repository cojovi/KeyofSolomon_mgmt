import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Bot, Zap, Activity, AlertTriangle, CheckCircle, Clock, Layers } from "lucide-react";
import { api, connectSSE } from "../lib/api";
import type { DashboardState, Task, Project, Note, AgentAction, AISummary, Settings } from "../lib/types";
import { relativeTime, isOverdue, isDueSoon, statusColor } from "../lib/utils";

// ─── Animated Ticker ─────────────────────────────────────────────────────────

function Ticker({ items }: { items: { type: string; label: string; text: string }[] }) {
  const looped = [...items, ...items]; // double for seamless loop
  if (!items.length) return null;

  return (
    <div className="overflow-hidden border-b border-line h-8 flex items-center bg-panel/60 relative">
      <div className="absolute left-0 top-0 bottom-0 w-16 z-10"
        style={{ background: "linear-gradient(to right, #04060c, transparent)" }} />
      <div className="absolute right-0 top-0 bottom-0 w-16 z-10"
        style={{ background: "linear-gradient(to left, #04060c, transparent)" }} />
      <div className="flex gap-10 animate-ticker whitespace-nowrap px-4">
        {looped.map((item, i) => (
          <span key={i} className="font-mono text-[11px] flex items-center gap-2">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${
              item.type === "blocked" ? "bg-nred" :
              item.type === "due_soon" ? "bg-amber" :
              item.type === "agent" ? "bg-lime" : "bg-cyan"
            }`} />
            <span className="text-faint">[{item.label}]</span>
            <span className="text-dim">{item.text}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Agent Avatar ─────────────────────────────────────────────────────────────

function AgentAvatar({
  state, pendingApprovals, lastAction,
}: {
  state: "idle" | "working" | "attention" | "error";
  pendingApprovals: number;
  lastAction?: AgentAction;
}) {
  const colors = {
    idle: "#7e90ad", working: "#00f0ff", attention: "#ffb020", error: "#ff4757",
  };
  const labels = { idle: "IDLE", working: "WORKING", attention: "NEEDS ATTENTION", error: "ERROR" };
  const c = colors[state];

  return (
    <div className="flex items-center gap-3">
      <div className="relative w-10 h-10 flex-shrink-0">
        <div className="absolute inset-0 rounded-full border animate-spin"
          style={{ borderColor: `${c}30`, borderTopColor: c, animationDuration: "3s" }} />
        <div className="absolute inset-2 rounded-full flex items-center justify-center"
          style={{ background: `radial-gradient(circle, ${c}25, transparent)` }}>
          <Bot size={12} style={{ color: c }} />
        </div>
        {(state === "attention" || state === "error") && (
          <div className="absolute inset-0 rounded-full animate-ping"
            style={{ background: `${c}15`, animationDuration: "2s" }} />
        )}
        {pendingApprovals > 0 && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber rounded-full flex items-center justify-center">
            <span className="text-[8px] text-black font-bold">{pendingApprovals}</span>
          </div>
        )}
      </div>
      <div>
        <div className="font-mono text-[9px] tracking-widest" style={{ color: c }}>{labels[state]}</div>
        {lastAction && (
          <div className="font-mono text-[10px] text-faint truncate max-w-[160px]">{lastAction.summary}</div>
        )}
      </div>
    </div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project }: { project: Project }) {
  const statusColors: Record<string, string> = {
    active: "border-l-cyan", blocked: "border-l-nred", paused: "border-l-amber",
    completed: "border-l-lime", planning: "border-l-purple", archived: "border-l-line",
  };
  const pct = Math.min(100, Math.max(0, project.progressPercent ?? 0));

  return (
    <div className={`card p-3 border-l-2 ${statusColors[project.status] ?? "border-l-line"} flex flex-col gap-2 min-w-0`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold text-sm text-[#dbe8fa] truncate">{project.title}</div>
          {project.shortDescription && (
            <div className="text-[11px] text-dim truncate mt-0.5">{project.shortDescription}</div>
          )}
        </div>
        <span className={`badge text-[9px] flex-shrink-0 ${statusColor(project.status)}`}>
          {project.status}
        </span>
      </div>
      {/* Progress bar */}
      <div className="progress-bar h-1">
        <div className="progress-fill h-full" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-faint">{pct}%</span>
        {project.dueDate && (
          <span className={`font-mono text-[10px] ${isOverdue(project.dueDate) ? "text-nred" : isDueSoon(project.dueDate) ? "text-amber" : "text-faint"}`}>
            {isOverdue(project.dueDate) ? "OVERDUE" : "due"} {relativeTime(project.dueDate)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Task Block ───────────────────────────────────────────────────────────────

function TaskBlock({
  label, tasks, color, icon: Icon,
}: {
  label: string;
  tasks: Task[];
  color: string;
  icon: React.ElementType;
}) {
  if (!tasks.length) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={11} className={color} />
        <span className={`font-mono text-[10px] tracking-widest ${color}`}>{label}</span>
        <span className="font-mono text-[10px] text-faint">({tasks.length})</span>
      </div>
      {tasks.slice(0, 5).map((t) => (
        <div key={t.id} className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-white/3 transition-colors">
          {t.priority === "urgent" && <span className="w-1 h-1 rounded-full bg-nred flex-shrink-0" />}
          {t.priority === "high" && <span className="w-1 h-1 rounded-full bg-amber flex-shrink-0" />}
          <span className="text-[12px] text-[#dbe8fa] truncate flex-1">{t.title}</span>
          {t.agentCandidate && <Bot size={9} className="text-purple flex-shrink-0" />}
          {t.dueDate && isOverdue(t.dueDate) && <span className="font-mono text-[9px] text-nred flex-shrink-0">LATE</span>}
          {t.dueDate && !isOverdue(t.dueDate) && isDueSoon(t.dueDate) && (
            <span className="font-mono text-[9px] text-amber flex-shrink-0">SOON</span>
          )}
        </div>
      ))}
      {tasks.length > 5 && (
        <div className="text-faint font-mono text-[10px] pl-2">+{tasks.length - 5} more</div>
      )}
    </div>
  );
}

// ─── Note Feed Item ───────────────────────────────────────────────────────────

function NoteFeedItem({ note }: { note: Note }) {
  const leftColors: Record<string, string> = {
    blocker: "border-l-nred", progress: "border-l-cyan", decision: "border-l-purple",
    agent_update: "border-l-lime", note: "border-l-line",
  };
  const authorColors: Record<string, string> = {
    agent: "text-lime", user: "text-nblue", system: "text-faint",
  };
  return (
    <div className={`border-l-2 pl-3 py-1 ${leftColors[note.type] ?? "border-l-line"}`}>
      <p className="text-[12px] text-dim leading-snug line-clamp-2">{note.body}</p>
      <div className="flex gap-2 mt-0.5">
        <span className={`font-mono text-[10px] ${authorColors[note.createdBy] ?? "text-faint"}`}>{note.createdBy}</span>
        <span className="font-mono text-[10px] text-faint">{relativeTime(note.createdAt)}</span>
      </div>
    </div>
  );
}

// ─── Status Bar ───────────────────────────────────────────────────────────────

function StatusBar({
  summary, lastRefresh, refreshing, onRefresh, pendingApprovals,
}: {
  summary: DashboardState["summary"] | null;
  lastRefresh: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
  pendingApprovals: number;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-2 bg-panel/80 border-b border-line text-[11px] font-mono">
      <div className="flex items-center gap-5">
        <span className="text-cyan font-bold tracking-widest">NEONDECK</span>
        <div className="flex items-center gap-1">
          <div className={`w-1.5 h-1.5 rounded-full ${refreshing ? "animate-pulse bg-amber" : "bg-lime"}`} />
          <span className="text-faint">{refreshing ? "refreshing…" : lastRefresh ? `updated ${relativeTime(lastRefresh.toISOString())}` : "loading…"}</span>
        </div>
      </div>
      {summary && (
        <div className="flex items-center gap-5">
          <span><span className="text-cyan">{summary.activeProjects}</span> <span className="text-faint">projects</span></span>
          <span><span className="text-[#dbe8fa]">{summary.openTasks}</span> <span className="text-faint">open tasks</span></span>
          {summary.blockedItems > 0 && (
            <span><span className="text-nred">{summary.blockedItems}</span> <span className="text-faint">blocked</span></span>
          )}
          {pendingApprovals > 0 && (
            <span className="text-amber animate-pulse">{pendingApprovals} approval{pendingApprovals !== 1 ? "s" : ""} needed</span>
          )}
          <span><span className="text-purple">{summary.ideas}</span> <span className="text-faint">ideas</span></span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button onClick={onRefresh} disabled={refreshing}
          className="text-faint hover:text-dim transition-colors">
          <Activity size={11} />
        </button>
        <Link to="/capture" className="text-faint hover:text-lime transition-colors flex items-center gap-1">
          <Zap size={10} />CAPTURE
        </Link>
        <Link to="/app" className="text-faint hover:text-cyan transition-colors">CONTROL PANEL</Link>
      </div>
    </div>
  );
}

// ─── AI Summaries Panel ───────────────────────────────────────────────────────

function AISummariesPanel({ summaries }: { summaries: AISummary[] }) {
  const [idx, setIdx] = useState(0);
  if (!summaries.length) return null;
  const s = summaries[idx];

  return (
    <div className="card p-4 h-full">
      <div className="zone-title mb-3"><span className="zone-dot bg-pink" />AI Insight</div>
      <div className="flex gap-1 mb-3 flex-wrap">
        {summaries.map((sum, i) => (
          <button key={sum.id} onClick={() => setIdx(i)}
            className={`font-mono text-[9px] px-2 py-1 rounded border transition-colors ${i === idx
              ? "border-pink/50 text-pink bg-pink/10" : "border-line text-faint hover:text-dim"}`}>
            {sum.type.replace(/_/g, " ")}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-dim leading-relaxed">{s.content}</p>
      <div className="font-mono text-[10px] text-faint mt-2">{s.provider} · {relativeTime(s.generatedAt)}</div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function Dashboard() {
  const [data, setData] = useState<DashboardState | null>(null);
  const [summaries, setSummaries] = useState<AISummary[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseCleanupRef = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      // The dashboard state is the critical payload; summaries and approvals are
      // best-effort so a single failing endpoint can never pin the whole board
      // on "loading…".
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
      // Keep the last good render and let the next poll retry instead of crashing.
      console.error("[dashboard] load failed:", err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Initial load + settings
  useEffect(() => {
    load();
    api.get<Settings>("/settings").then(setSettings).catch(() => null);
  }, [load]);

  // Auto-refresh interval
  useEffect(() => {
    const secs = parseInt(settings?.dashboardRefreshSeconds ?? "30", 10);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(load, secs * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [settings?.dashboardRefreshSeconds, load]);

  // SSE live updates
  useEffect(() => {
    const cleanup = connectSSE((event) => {
      // The server emits "data-changed" on every mutation; the granular names are
      // kept for forward-compatibility. Reload on any of them, but ignore the
      // "ping"/"connected" keepalives.
      if (["data-changed", "project_updated", "task_updated", "idea_updated", "agent_action"].includes(event.type)) {
        load();
      }
      if (event.type === "approval_requested") {
        setPendingApprovals((n) => n + 1);
      }
    });
    sseCleanupRef.current = cleanup;
    return cleanup;
  }, [load]);

  const agentActions = data?.agentActions ?? [];
  const lastAction = agentActions[0];

  // Infer agent state
  const agentState: "idle" | "working" | "attention" | "error" = (() => {
    if (pendingApprovals > 0) return "attention";
    if (!lastAction) return "idle";
    if (lastAction.actionType === "error") return "error";
    const ageMs = Date.now() - new Date(lastAction.createdAt).getTime();
    if (ageMs < 300_000) return "working";
    return "idle";
  })();

  const tasks = data?.tasks;
  const reduced = settings?.reducedMotion === "true";

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "#04060c" }}>
      {/* Status bar */}
      <StatusBar
        summary={data?.summary ?? null}
        lastRefresh={lastRefresh}
        refreshing={refreshing}
        onRefresh={load}
        pendingApprovals={pendingApprovals}
      />

      {/* Ticker */}
      {!reduced && data?.ticker?.length ? <Ticker items={data.ticker} /> : null}

      {/* Main grid */}
      <div className="flex-1 overflow-hidden grid" style={{ gridTemplateColumns: "280px 1fr 280px" }}>

        {/* ── LEFT: Projects ─────────────────────────────────────────────── */}
        <div className="flex flex-col border-r border-line overflow-hidden">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <div className="zone-title"><span className="zone-dot bg-cyan" />Projects</div>
            <Link to="/app/projects" className="font-mono text-[10px] text-faint hover:text-cyan">all →</Link>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
            {(data?.projects ?? []).map((p) => <ProjectCard key={p.id} project={p} />)}
            {data && data.projects.length === 0 && (
              <div className="text-faint font-mono text-[11px] text-center pt-8">No active projects</div>
            )}
          </div>
        </div>

        {/* ── CENTER: Tasks + Notes ───────────────────────────────────────── */}
        <div className="flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-5">

            {/* Tasks grid */}
            <div>
              <div className="zone-title mb-3">
                <span className="zone-dot bg-amber" />Tasks
                <Link to="/app/tasks" className="ml-auto font-mono text-[10px] text-faint hover:text-amber">all →</Link>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  {tasks && (
                    <TaskBlock label="IN PROGRESS" tasks={tasks.inProgress} color="text-cyan" icon={Activity} />
                  )}
                  {tasks && (
                    <TaskBlock label="BLOCKED" tasks={tasks.blocked} color="text-nred" icon={AlertTriangle} />
                  )}
                </div>
                <div className="space-y-4">
                  {tasks && (
                    <TaskBlock label="TODO" tasks={tasks.todo} color="text-dim" icon={CheckCircle} />
                  )}
                  {tasks && (
                    <TaskBlock label="DUE SOON" tasks={tasks.dueSoon} color="text-amber" icon={Clock} />
                  )}
                  {tasks && (
                    <TaskBlock label="WAITING" tasks={tasks.waiting} color="text-purple" icon={Layers} />
                  )}
                </div>
              </div>
            </div>

            {/* Notes / Activity feed */}
            <div>
              <div className="zone-title mb-3">
                <span className="zone-dot bg-purple" />Recent Activity
                <Link to="/app/activity" className="ml-auto font-mono text-[10px] text-faint hover:text-purple">all →</Link>
              </div>
              <div className="space-y-2">
                {(data?.recentNotes ?? []).slice(0, 8).map((n) => (
                  <NoteFeedItem key={n.id} note={n} />
                ))}
                {data && data.recentNotes.length === 0 && (
                  <div className="text-faint font-mono text-[11px] text-center py-4">No activity yet</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Agent + Ideas + AI ──────────────────────────────────── */}
        <div className="flex flex-col border-l border-line overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-5">

            {/* Agent block */}
            <div className="card p-3">
              <div className="zone-title mb-3">
                <span className="zone-dot bg-lime" />OpenClaw Agent
                <Link to="/app/agent" className="ml-auto font-mono text-[10px] text-faint hover:text-lime">center →</Link>
              </div>
              <AgentAvatar
                state={agentState}
                pendingApprovals={pendingApprovals}
                lastAction={lastAction}
              />
              {agentActions.slice(0, 3).map((a) => (
                <div key={a.id} className="mt-2 py-1.5 border-t border-line first:border-t-0">
                  <p className="text-[11px] text-dim line-clamp-1">{a.summary}</p>
                  <p className="font-mono text-[9px] text-faint">{relativeTime(a.createdAt)}</p>
                </div>
              ))}
            </div>

            {/* Ideas carousel */}
            <div className="card p-3">
              <div className="zone-title mb-2">
                <span className="zone-dot bg-purple" />Ideas
                <Link to="/app/ideas" className="ml-auto font-mono text-[10px] text-faint hover:text-purple">all →</Link>
              </div>
              <div className="space-y-1.5">
                {(data?.ideas ?? []).slice(0, 5).map((idea) => (
                  <div key={idea.id} className="flex items-center gap-2 py-1">
                    <span className="w-1 h-1 rounded-full bg-purple flex-shrink-0" />
                    <span className="text-[11px] text-dim truncate flex-1">{idea.title}</span>
                    <span className={`font-mono text-[9px] ${
                      idea.status === "possible" ? "text-lime" :
                      idea.status === "reviewing" ? "text-cyan" : "text-faint"
                    }`}>{idea.status}</span>
                  </div>
                ))}
                {data && data.ideas.length === 0 && (
                  <div className="text-faint font-mono text-[11px] text-center py-2">No ideas yet</div>
                )}
                {(data?.ideas?.length ?? 0) > 5 && (
                  <div className="text-faint font-mono text-[10px] text-right">
                    +{data!.ideas.length - 5} more
                  </div>
                )}
              </div>
            </div>

            {/* AI Summaries */}
            {summaries.length > 0 && <AISummariesPanel summaries={summaries} />}

            {summaries.length === 0 && (
              <div className="card p-3 text-center">
                <div className="zone-title mb-2"><span className="zone-dot bg-pink" />AI Insight</div>
                <p className="text-faint font-mono text-[10px] leading-relaxed">
                  Configure an AI provider in Settings and generate summaries from the Agent Center.
                </p>
                <Link to="/app/settings" className="font-mono text-[10px] text-purple hover:text-pink mt-2 block">
                  → Settings
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-5 py-1.5 border-t border-line bg-panel/60 text-[10px] font-mono text-faint">
        <span>NEONDECK v0.2.0-beta.2</span>
        <div className="flex gap-4">
          <Link to="/capture" className="hover:text-lime">⚡ Fast Capture</Link>
          <Link to="/app/agent" className="hover:text-cyan">🤖 Agent Center</Link>
        </div>
        <span>auto-refresh: {settings?.dashboardRefreshSeconds ?? "30"}s</span>
      </div>

      {/* Ticker keyframe override */}
      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          animation: ticker ${Math.max(20, (data?.ticker?.length ?? 5) * 8)}s linear infinite;
          ${reduced ? "animation: none;" : ""}
        }
        @keyframes spin-slow {
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow { animation: spin-slow 4s linear infinite; }
      `}</style>
    </div>
  );
}
