import { useEffect, useState, useCallback } from "react";
import { Plus, ArrowRight, Archive, Sparkles, Star } from "lucide-react";
import { api } from "../lib/api";
import type { Idea } from "../lib/types";
import { relativeTime } from "../lib/utils";
import { StatusBadge, PriorityBadge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { useToast } from "../components/ui/Toast";

const STATUSES = ["", "captured", "reviewing", "possible", "converted", "archived"];
const PRIORITIES = ["", "low", "medium", "high"];

function IdeaForm({ idea, onSave, onClose }: { idea?: Idea; onSave: () => void; onClose: () => void }) {
  const [form, setForm] = useState({
    title: idea?.title ?? "",
    body: idea?.body ?? "",
    category: idea?.category ?? "",
    status: idea?.status ?? "captured",
    priority: idea?.priority ?? "medium",
    tags: (idea?.tags ?? []).join(", "),
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.title.trim()) { toast("Title is required", true); return; }
    setSaving(true);
    try {
      const body = { ...form, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean) };
      if (idea) await api.patch(`/ideas/${idea.id}`, body);
      else await api.post("/ideas", body);
      toast(idea ? "Idea updated" : "Idea captured");
      onSave();
    } catch (e: any) { toast(e.message, true); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-mono text-dim mb-1 block">TITLE *</label>
        <input className="input" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Idea title" />
      </div>
      <div>
        <label className="text-xs font-mono text-dim mb-1 block">BODY / NOTES</label>
        <textarea className="input min-h-[100px] resize-y" value={form.body} onChange={(e) => set("body", e.target.value)} placeholder="Expand the idea…" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-mono text-dim mb-1 block">STATUS</label>
          <select className="select" value={form.status} onChange={(e) => set("status", e.target.value)}>
            {STATUSES.filter(Boolean).map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-mono text-dim mb-1 block">PRIORITY</label>
          <select className="select" value={form.priority} onChange={(e) => set("priority", e.target.value)}>
            {PRIORITIES.filter(Boolean).map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-mono text-dim mb-1 block">CATEGORY</label>
          <input className="input" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="tech, business…" />
        </div>
      </div>
      <div>
        <label className="text-xs font-mono text-dim mb-1 block">TAGS</label>
        <input className="input" value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="tag1, tag2" />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={save} disabled={saving} className="btn-cyan">
          {saving ? "Saving…" : idea ? "Save Changes" : "Capture Idea"}
        </button>
      </div>
    </div>
  );
}

export function Ideas() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [filters, setFilters] = useState({ q: "", status: "", category: "" });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filters.q) p.set("q", filters.q);
      if (filters.status) p.set("status", filters.status);
      if (filters.category) p.set("category", filters.category);
      setIdeas(await api.get<Idea[]>(`/ideas?${p}`));
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  async function convertTo(id: string, target: "task" | "project") {
    try {
      await api.post(`/ideas/${id}/convert-to-${target}`, {});
      toast(`Converted to ${target} ⚡`); load();
    } catch (e: any) { toast(e.message, true); }
  }

  async function archive(id: string) {
    await api.post(`/ideas/${id}/archive`);
    toast("Archived"); load();
  }

  async function aiExpand(id: string) {
    setAiLoading(id);
    try {
      await api.post("/ai/summaries/ideas_revisit");
      toast("AI expansion queued ✦");
    } catch (e: any) { toast(e.message, true); }
    finally { setAiLoading(null); }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="panel-header">
        <div>
          <h1 className="font-display font-bold text-2xl text-white tracking-wide">Ideas</h1>
          <p className="text-dim text-sm">{ideas.length} captured</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-cyan"><Plus size={14} />Capture Idea</button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input className="input flex-1 min-w-[150px]" placeholder="Search ideas…" value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
        <select className="select w-36" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          {STATUSES.map((s) => <option key={s} value={s}>{s || "all statuses"}</option>)}
        </select>
        <input className="select w-28" placeholder="category…" value={filters.category}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} />
      </div>

      {loading ? (
        <div className="text-dim font-mono text-sm animate-pulse">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {ideas.map((i) => (
            <div key={i.id} className="card p-4 cursor-pointer hover:border-line2 transition-colors"
              onClick={() => setSelected(i.id)}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-semibold text-[#dbe8fa]">{i.title}</span>
                    <StatusBadge status={i.status} />
                    {i.priority && <PriorityBadge priority={i.priority} />}
                    {i.category && <span className="badge text-faint border-faint/25">{i.category}</span>}
                  </div>
                  {i.body && <p className="text-dim text-sm mt-1 line-clamp-2">{i.body}</p>}
                </div>
                <span className="font-mono text-[10px] text-faint flex-shrink-0">{relativeTime(i.createdAt)}</span>
              </div>
              {i.status !== "converted" && i.status !== "archived" && (
                <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => convertTo(i.id, "task")} className="btn-ghost text-xs">
                    <ArrowRight size={11} />→ Task
                  </button>
                  <button onClick={() => convertTo(i.id, "project")} className="btn-ghost text-xs">
                    <ArrowRight size={11} />→ Project
                  </button>
                  <button onClick={() => aiExpand(i.id)} disabled={aiLoading === i.id} className="btn-ghost text-xs">
                    <Sparkles size={11} />{aiLoading === i.id ? "…" : "AI Expand"}
                  </button>
                  <button onClick={() => archive(i.id)} className="btn-danger text-xs ml-auto">
                    <Archive size={11} />Archive
                  </button>
                </div>
              )}
            </div>
          ))}
          {ideas.length === 0 && (
            <div className="text-center py-12 text-dim font-mono text-sm">No ideas — capture something! ✦</div>
          )}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Capture Idea" wide>
        <IdeaForm onSave={() => { setCreating(false); load(); }} onClose={() => setCreating(false)} />
      </Modal>
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Idea Details" wide>
        {selected && (() => {
          const idea = ideas.find((i) => i.id === selected);
          return idea ? (
            <IdeaForm idea={idea} onSave={() => { setSelected(null); load(); }} onClose={() => setSelected(null)} />
          ) : null;
        })()}
      </Modal>
    </div>
  );
}
