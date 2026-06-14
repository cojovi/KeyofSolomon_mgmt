import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FolderOpen, CheckSquare, AlertTriangle, Lightbulb, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import type { DashboardState, Note, AgentAction } from "../lib/types";
import { relativeTime } from "../lib/utils";
import { StatusBadge } from "../components/ui/Badge";

export function Overview() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setState(await api.get<DashboardState>("/dashboard/state"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading || !state) {
    return <div className="text-dim font-mono text-sm animate-pulse">Loading overview…</div>;
  }

  const { summary, tasks, recentNotes, agentActions } = state;
  const todayItems = [...tasks.blocked, ...tasks.dueSoon, ...tasks.inProgress].slice(0, 6);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-white tracking-wide">Overview</h1>
          <p className="text-dim text-sm mt-0.5">Updated {relativeTime(state.generatedAt)}</p>
        </div>
        <button onClick={load} className="btn-ghost">
          <RefreshCw size={14} />Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Active Projects", value: summary.activeProjects, icon: FolderOpen, color: "text-cyan", to: "/app/projects" },
          { label: "Open Tasks", value: summary.openTasks, icon: CheckSquare, color: "text-nblue", to: "/app/tasks" },
          { label: "Blocked", value: summary.blockedItems, icon: AlertTriangle, color: "text-nred", to: "/app/tasks?status=blocked" },
          { label: "Ideas", value: summary.ideas, icon: Lightbulb, color: "text-purple", to: "/app/ideas" },
        ].map(({ label, value, icon: Icon, color, to }) => (
          <Link
            key={label}
            to={to}
            className="card p-5 hover:border-line2 transition-colors group"
          >
            <div className={`text-3xl font-display font-bold ${color} group-hover:drop-shadow-[0_0_8px_currentColor] transition-all`}>
              {value}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-dim text-xs font-mono tracking-wide">
              <Icon size={12} />{label}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Today's Focus */}
        <div className="card p-5">
          <div className="zone-title mb-4">
            <span className="zone-dot bg-pink" />
            Today / Priority
          </div>
          {todayItems.length === 0 ? (
            <p className="text-dim text-sm">All clear 🎉</p>
          ) : (
            <div className="space-y-2">
              {todayItems.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 py-2 border-b border-line last:border-0">
                  <span className="text-sm text-[#dbe8fa] truncate">{t.title}</span>
                  <StatusBadge status={t.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Notes */}
        <div className="card p-5">
          <div className="zone-title mb-4">
            <span className="zone-dot bg-purple" />
            Recent Activity
          </div>
          <div className="space-y-3">
            {recentNotes.slice(0, 5).map((n: Note) => (
              <div key={n.id} className="text-sm">
                <div className="text-[#dbe8fa] leading-snug line-clamp-2">{n.body}</div>
                <div className="font-mono text-[10px] text-faint mt-0.5">
                  {n.parentType} · {n.createdBy} · {relativeTime(n.createdAt)}
                </div>
              </div>
            ))}
            {recentNotes.length === 0 && <p className="text-dim text-sm">No recent notes</p>}
          </div>
        </div>
      </div>

      {/* Agent Activity */}
      {agentActions.length > 0 && (
        <div className="card p-5">
          <div className="zone-title mb-4">
            <span className="zone-dot bg-cyan" />
            Recent Agent Activity
          </div>
          <div className="space-y-2">
            {agentActions.slice(0, 4).map((a: AgentAction) => (
              <div key={a.id} className="flex items-center gap-3 py-2 border-b border-line last:border-0">
                <span className="badge text-cyan border-cyan/30 bg-cyan/5">{a.actionType}</span>
                <span className="text-sm text-[#dbe8fa] truncate flex-1">{a.summary}</span>
                <span className="font-mono text-[10px] text-faint">{relativeTime(a.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
