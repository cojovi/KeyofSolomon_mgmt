import { useEffect, useState, useCallback } from "react";
import { Bot, Check, X, RefreshCw, Sparkles, AlertTriangle } from "lucide-react";
import { api } from "../lib/api";
import type { AgentAction, AgentApproval, Task, AISummary } from "../lib/types";
import { relativeTime } from "../lib/utils";
import { useToast } from "../components/ui/Toast";
import { StatusBadge } from "../components/ui/Badge";

const ACTION_COLORS: Record<string, string> = {
  create: "text-cyan border-cyan/30",
  update: "text-nblue border-nblue/30",
  status_change: "text-amber border-amber/30",
  add_note: "text-purple border-purple/30",
  convert_idea: "text-lime border-lime/30",
  dashboard_request: "text-faint border-faint/25",
  error: "text-nred border-nred/40",
};

function AgentAvatarDisplay({ state }: { state: "idle" | "thinking" | "working" | "attention" | "error" | "done" }) {
  const colors = {
    idle: "#7e90ad",
    thinking: "#a78bfa",
    working: "#00f0ff",
    attention: "#ffb020",
    error: "#ff4757",
    done: "#b6ff2e",
  };
  const labels = { idle: "IDLE", thinking: "THINKING", working: "WORKING", attention: "NEEDS ATTENTION", error: "ERROR", done: "TASK COMPLETE" };
  const color = colors[state];

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="relative w-20 h-20">
        {/* Outer ring */}
        <div className="absolute inset-0 rounded-full border-2 animate-spin-slow"
          style={{ borderColor: `${color}40`, borderTopColor: color }} />
        {/* Middle ring */}
        <div className="absolute inset-3 rounded-full border border-dashed animate-spin-slow"
          style={{ borderColor: `${color}60`, animationDirection: "reverse", animationDuration: "6s" }} />
        {/* Core */}
        <div className="absolute inset-6 rounded-full flex items-center justify-center"
          style={{ background: `radial-gradient(circle, ${color}30, transparent)`, boxShadow: `0 0 20px ${color}50` }}>
          <Bot size={16} style={{ color }} />
        </div>
        {/* Pulse for attention/error */}
        {(state === "attention" || state === "error") && (
          <div className="absolute inset-0 rounded-full animate-ping"
            style={{ background: `${color}15`, animationDuration: "1.5s" }} />
        )}
      </div>
      <div className="font-mono text-[11px] tracking-[2px]" style={{ color }}>{labels[state]}</div>
    </div>
  );
}

export function AgentCenter() {
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [candidates, setCandidates] = useState<Task[]>([]);
  const [summaries, setSummaries] = useState<AISummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [genLoading, setGenLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [acts, apprs, cands, sums] = await Promise.all([
        api.get<AgentAction[]>("/agent/actions?limit=20"),
        api.get<AgentApproval[]>("/approvals/pending"),
        api.get<Task[]>("/agent/tasks/available"),
        api.get<AISummary[]>("/ai/summaries"),
      ]);
      setActions(acts);
      setApprovals(apprs);
      setCandidates(cands.filter((t) => t.agentCandidate).slice(0, 8));
      setSummaries(sums);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function resolve(id: string, action: "approve" | "reject") {
    try {
      await api.post(`/approvals/${id}/${action}`);
      toast(action === "approve" ? "Approved ✓" : "Rejected");
      load();
    } catch (e: any) { toast(e.message, true); }
  }

  async function generateSummary(type: string) {
    setGenLoading(type);
    try {
      const s = await api.post<AISummary>(`/ai/summaries/${type}`);
      setSummaries((prev) => {
        const filtered = prev.filter((x) => x.type !== type);
        return [s, ...filtered];
      });
      toast("Summary generated ✦");
    } catch (e: any) { toast(e.message, true); }
    finally { setGenLoading(null); }
  }

  // Infer agent state from recent actions
  const recentAction = actions[0];
  const agentState: "idle" | "thinking" | "working" | "attention" | "error" | "done" = (() => {
    if (approvals.length > 0) return "attention";
    if (!recentAction) return "idle";
    if (recentAction.actionType === "error") return "error";
    const ageMs = Date.now() - new Date(recentAction.createdAt).getTime();
    if (ageMs < 300_000) return "working";
    return "idle";
  })();

  const SUMMARY_TYPES = [
    { key: "today_focus", label: "Today's Focus" },
    { key: "whats_blocked", label: "What's Blocked" },
    { key: "week_progress", label: "Week Progress" },
    { key: "ideas_revisit", label: "Ideas to Revisit" },
    { key: "agent_suggest", label: "Agent Suggestions" },
  ];

  if (loading) return <div className="text-dim font-mono text-sm animate-pulse">Loading agent center…</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="panel-header">
        <div>
          <h1 className="font-display font-bold text-2xl text-white tracking-wide">Agent Center</h1>
          <p className="text-dim text-sm">OpenClaw / automation command center</p>
        </div>
        <button onClick={load} className="btn-ghost"><RefreshCw size={14} />Refresh</button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Avatar + Status */}
        <div className="card p-4">
          <div className="zone-title mb-2"><span className="zone-dot bg-cyan" />Agent Status</div>
          <AgentAvatarDisplay state={agentState} />
          <div className="text-center space-y-1 mt-2">
            <p className="font-mono text-xs text-dim">{approvals.length} pending approval{approvals.length !== 1 ? "s" : ""}</p>
            {recentAction && (
              <p className="font-mono text-[10px] text-faint">Last: {relativeTime(recentAction.createdAt)}</p>
            )}
          </div>
        </div>

        {/* Pending Approvals */}
        <div className="card p-4 col-span-2">
          <div className="zone-title mb-3"><span className="zone-dot bg-amber" />Pending Approvals</div>
          {approvals.length === 0 ? (
            <p className="text-dim text-sm text-center py-6">No pending approvals</p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {approvals.map((a) => (
                <div key={a.id} className="border border-amber/20 rounded-xl p-3 bg-amber/5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="badge text-amber border-amber/40 text-[9px]">{a.actionType}</span>
                        <span className="font-display text-sm font-semibold text-[#dbe8fa]">{a.agentName}</span>
                      </div>
                      <p className="text-dim text-sm mt-1">{a.reason}</p>
                      <p className="font-mono text-[10px] text-faint mt-0.5">{relativeTime(a.requestedAt)}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => resolve(a.id, "approve")}
                        className="btn-lime text-xs px-2 py-1"><Check size={11} />Approve</button>
                      <button onClick={() => resolve(a.id, "reject")}
                        className="btn-danger text-xs px-2 py-1"><X size={11} />Reject</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Agent Candidates */}
      {candidates.length > 0 && (
        <div className="card p-5">
          <div className="zone-title mb-3">
            <span className="zone-dot bg-purple" />Agent-Candidate Tasks
            <span className="ml-2 badge text-purple border-purple/30">{candidates.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {candidates.map((t) => (
              <div key={t.id} className="flex items-center gap-2 p-2 border border-line rounded-lg">
                <Bot size={12} className="text-purple flex-shrink-0" />
                <span className="text-sm text-[#dbe8fa] truncate flex-1">{t.title}</span>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Summaries */}
      <div className="card p-5">
        <div className="zone-title mb-4"><span className="zone-dot bg-pink" />AI Summaries</div>
        <div className="flex flex-wrap gap-2 mb-4">
          {SUMMARY_TYPES.map(({ key, label }) => (
            <button key={key} onClick={() => generateSummary(key)}
              disabled={genLoading === key}
              className="btn-ghost text-xs">
              <Sparkles size={11} />{genLoading === key ? "Generating…" : label}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {summaries.length === 0 && (
            <p className="text-dim text-sm text-center py-4">
              No summaries yet — configure an AI provider in Settings, then generate one above.
            </p>
          )}
          {summaries.map((s) => (
            <div key={s.id} className="border border-line rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="badge text-pink border-pink/30">{s.type.replace(/_/g, " ")}</span>
                <span className="font-mono text-[10px] text-faint">{relativeTime(s.generatedAt)} · {s.provider}</span>
              </div>
              <p className="text-sm text-[#dbe8fa]/90 leading-relaxed">{s.content}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Agent Actions */}
      <div className="card p-5">
        <div className="zone-title mb-3"><span className="zone-dot bg-cyan" />Recent Agent Actions</div>
        <div className="space-y-2">
          {actions.map((a) => (
            <div key={a.id} className="flex items-start gap-3 py-2 border-b border-line last:border-0">
              <span className={`badge text-[9px] flex-shrink-0 mt-0.5 ${ACTION_COLORS[a.actionType] ?? "text-dim border-dim/30"}`}>
                {a.actionType}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#dbe8fa] leading-snug">{a.summary}</p>
                {a.details && <p className="text-xs text-dim mt-0.5">{a.details}</p>}
                <p className="font-mono text-[10px] text-faint mt-0.5">{a.agentName} · {relativeTime(a.createdAt)}</p>
              </div>
            </div>
          ))}
          {actions.length === 0 && (
            <p className="text-dim text-sm text-center py-6">No agent activity yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
