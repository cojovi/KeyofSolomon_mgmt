import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import type { Note } from "../lib/types";
import { relativeTime } from "../lib/utils";

const PARENT_TYPES = ["", "project", "task", "idea"];
const CREATED_BY = ["", "user", "agent", "system"];
const NOTE_TYPES = ["", "note", "progress", "decision", "blocker", "agent_update"];

const TYPE_COLORS: Record<string, string> = {
  blocker: "border-nred/50 bg-nred/5",
  progress: "border-cyan/40 bg-cyan/5",
  decision: "border-purple/40 bg-purple/5",
  agent_update: "border-lime/30 bg-lime/5",
  note: "border-line",
};

const CREATED_COLORS: Record<string, string> = {
  agent: "text-lime border-lime/30",
  system: "text-faint border-faint/25",
  user: "text-nblue border-nblue/30",
};

export function Activity() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [filters, setFilters] = useState({ parentType: "", createdBy: "", type: "" });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: "100" });
      if (filters.parentType) p.set("parentType", filters.parentType);
      if (filters.createdBy) p.set("createdBy", filters.createdBy);
      if (filters.type) p.set("type", filters.type);
      setNotes(await api.get<Note[]>(`/notes?${p}`));
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="panel-header">
        <div>
          <h1 className="font-display font-bold text-2xl text-white tracking-wide">Activity</h1>
          <p className="text-dim text-sm">Notes, progress updates &amp; decisions</p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <select className="select w-36" value={filters.parentType} onChange={(e) => setFilters((f) => ({ ...f, parentType: e.target.value }))}>
          {PARENT_TYPES.map((t) => <option key={t} value={t}>{t || "all parents"}</option>)}
        </select>
        <select className="select w-32" value={filters.createdBy} onChange={(e) => setFilters((f) => ({ ...f, createdBy: e.target.value }))}>
          {CREATED_BY.map((b) => <option key={b} value={b}>{b || "all creators"}</option>)}
        </select>
        <select className="select w-36" value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}>
          {NOTE_TYPES.map((t) => <option key={t} value={t}>{t || "all types"}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-dim font-mono text-sm animate-pulse">Loading…</div>
      ) : (
        <div className="relative pl-4">
          {/* Timeline line */}
          <div className="absolute left-1.5 top-2 bottom-2 w-px bg-line" />

          <div className="space-y-4">
            {notes.map((n) => (
              <div key={n.id} className="relative">
                {/* Dot */}
                <div className={`absolute -left-[11px] top-2 w-2 h-2 rounded-full border
                  ${n.type === "blocker" ? "bg-nred border-nred" : n.type === "progress" ? "bg-cyan border-cyan" : n.createdBy === "agent" ? "bg-lime border-lime" : "bg-dim border-dim"}`} />
                <div className={`ml-4 card p-3 border-l-2 ${TYPE_COLORS[n.type] ?? "border-line"}`}>
                  <p className="text-sm text-[#dbe8fa] leading-relaxed">{n.body}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`badge text-[9px] ${CREATED_COLORS[n.createdBy] ?? ""}`}>{n.createdBy}</span>
                    <span className="badge border-dim/25 text-faint text-[9px]">{n.type}</span>
                    <span className="badge border-dim/25 text-faint text-[9px]">{n.parentType}</span>
                    <span className="font-mono text-[10px] text-faint ml-auto">{relativeTime(n.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
            {notes.length === 0 && (
              <div className="ml-4 text-center py-12 text-dim font-mono text-sm">No activity yet</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
