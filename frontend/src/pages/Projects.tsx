import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Archive, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../lib/api";
import type { Project, Note, Attachment } from "../lib/types";
import { relativeTime, statusColor, priorityColor } from "../lib/utils";
import { StatusBadge, PriorityBadge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { ProgressBar } from "../components/ui/ProgressBar";
import { useToast } from "../components/ui/Toast";

const STATUSES = ["", "planning", "active", "paused", "blocked", "completed", "archived"];
const PRIORITIES = ["", "low", "medium", "high", "urgent"];

function ProjectForm({ project, onSave, onClose }: {
  project?: Project;
  onSave: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: project?.title ?? "",
    shortDescription: project?.shortDescription ?? "",
    longDescription: project?.longDescription ?? "",
    category: project?.category ?? "",
    status: project?.status ?? "planning",
    priority: project?.priority ?? "medium",
    progressPercent: project?.progressPercent ?? 0,
    dueDate: project?.dueDate ? project.dueDate.slice(0, 10) : "",
    tags: (project?.tags ?? []).join(", "),
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.title.trim()) { toast("Title is required", true); return; }
    setSaving(true);
    try {
      const body = {
        ...form,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        progressPercent: Number(form.progressPercent),
        dueDate: form.dueDate || undefined,
      };
      if (project) await api.patch(`/projects/${project.id}`, body);
      else await api.post("/projects", body);
      toast(project ? "Project updated" : "Project created");
      onSave();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-mono text-dim mb-1 block">TITLE *</label>
        <input className="input" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Project title" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-mono text-dim mb-1 block">STATUS</label>
          <select className="select" value={form.status} onChange={(e) => set("status", e.target.value)}>
            {["planning","active","paused","blocked","completed","archived"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-mono text-dim mb-1 block">PRIORITY</label>
          <select className="select" value={form.priority} onChange={(e) => set("priority", e.target.value)}>
            {PRIORITIES.filter(Boolean).map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-mono text-dim mb-1 block">SHORT DESCRIPTION</label>
        <input className="input" value={form.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} placeholder="One-liner" />
      </div>
      <div>
        <label className="text-xs font-mono text-dim mb-1 block">LONG DESCRIPTION</label>
        <textarea className="input min-h-[80px] resize-y" value={form.longDescription} onChange={(e) => set("longDescription", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-mono text-dim mb-1 block">CATEGORY</label>
          <input className="input" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="coding, business…" />
        </div>
        <div>
          <label className="text-xs font-mono text-dim mb-1 block">DUE DATE</label>
          <input type="date" className="input" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-xs font-mono text-dim mb-1 block">PROGRESS — {form.progressPercent}%</label>
        <input type="range" min={0} max={100} value={form.progressPercent}
          onChange={(e) => set("progressPercent", e.target.value)}
          className="w-full accent-cyan" />
      </div>
      <div>
        <label className="text-xs font-mono text-dim mb-1 block">TAGS (comma separated)</label>
        <input className="input" value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="tag1, tag2" />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={save} disabled={saving} className="btn-cyan">
          {saving ? "Saving…" : project ? "Save Changes" : "Create Project"}
        </button>
      </div>
    </div>
  );
}

function ProjectDetail({ id, onClose, onUpdate }: { id: string; onClose: () => void; onUpdate: () => void }) {
  const [project, setProject] = useState<Project & { notes: Note[]; attachments: Attachment[] } | null>(null);
  const [editing, setEditing] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("note");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const { toast } = useToast();

  const load = useCallback(async () => {
    setProject(await api.get(`/projects/${id}`));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!project) return <div className="text-dim font-mono text-sm animate-pulse">Loading…</div>;

  async function addNote() {
    if (!noteText.trim()) return;
    await api.post(`/projects/${id}/notes`, { body: noteText, type: noteType });
    setNoteText(""); load(); onUpdate();
    toast("Note added");
  }

  async function addLink() {
    if (!linkUrl.trim()) return;
    await api.post(`/projects/${id}/attachments`, { url: linkUrl, label: linkLabel, type: "link" });
    setLinkUrl(""); setLinkLabel(""); load();
    toast("Link added");
  }

  async function archive() {
    await api.post(`/projects/${id}/archive`);
    toast("Project archived"); onClose(); onUpdate();
  }

  return (
    <div className="space-y-6">
      {editing ? (
        <ProjectForm project={project} onSave={() => { setEditing(false); load(); onUpdate(); }} onClose={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display font-bold text-xl text-white">{project.title}</h3>
              {project.shortDescription && <p className="text-dim text-sm mt-1">{project.shortDescription}</p>}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => setEditing(true)} className="btn-ghost text-xs">Edit</button>
              <button onClick={archive} className="btn-danger text-xs"><Archive size={12} />Archive</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={project.status} />
            {project.priority && <PriorityBadge priority={project.priority} />}
            {project.category && <span className="badge text-dim border-dim/30">{project.category}</span>}
          </div>
          <div>
            <div className="flex justify-between text-xs font-mono text-dim mb-1">
              <span>PROGRESS</span><span>{project.progressPercent}%</span>
            </div>
            <ProgressBar value={project.progressPercent} />
          </div>
          {project.longDescription && (
            <p className="text-sm text-[#dbe8fa]/80 leading-relaxed">{project.longDescription}</p>
          )}
          {project.dueDate && (
            <p className="text-xs font-mono text-dim">DUE: {new Date(project.dueDate).toLocaleDateString()}</p>
          )}
        </>
      )}

      {/* Notes */}
      <div>
        <div className="zone-title mb-3"><span className="zone-dot bg-purple" />Notes / Progress</div>
        <div className="flex gap-2 mb-3">
          <input className="input flex-1" placeholder="Add a note…" value={noteText} onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addNote(); }} />
          <select className="select w-32" value={noteType} onChange={(e) => setNoteType(e.target.value)}>
            {["note","progress","decision","blocker"].map((t) => <option key={t}>{t}</option>)}
          </select>
          <button onClick={addNote} className="btn-cyan text-xs">Add</button>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {project.notes.map((n) => (
            <div key={n.id} className={`pl-3 py-2 border-l-2 ${n.type === "blocker" ? "border-nred/50" : n.type === "progress" ? "border-cyan/50" : "border-line2"}`}>
              <p className="text-sm text-[#dbe8fa]">{n.body}</p>
              <p className="font-mono text-[10px] text-faint mt-0.5">{n.type} · {n.createdBy} · {relativeTime(n.createdAt)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Attachments */}
      <div>
        <div className="zone-title mb-3"><span className="zone-dot bg-nblue" />Links & Attachments</div>
        <div className="flex gap-2 mb-3">
          <input className="input flex-1" placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          <input className="input w-32" placeholder="Label" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} />
          <button onClick={addLink} className="btn-cyan text-xs">Add</button>
        </div>
        <div className="space-y-1">
          {project.attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-sm">
              <ExternalLink size={12} className="text-nblue flex-shrink-0" />
              {a.url ? (
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-nblue hover:underline truncate">
                  {a.label || a.url}
                </a>
              ) : (
                <span className="text-dim">{a.label || a.filePath}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Projects() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [filters, setFilters] = useState({ q: "", status: "", priority: "" });
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.q) params.set("q", filters.q);
      if (filters.status) params.set("status", filters.status);
      if (filters.priority) params.set("priority", filters.priority);
      setProjects(await api.get<Project[]>(`/projects?${params}`));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="panel-header">
        <div>
          <h1 className="font-display font-bold text-2xl text-white tracking-wide">Projects</h1>
          <p className="text-dim text-sm">{projects.length} shown</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-cyan">
          <Plus size={14} />New Project
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input className="input flex-1 min-w-[180px]" placeholder="Search projects…"
          value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
        <select className="select w-36" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          {STATUSES.map((s) => <option key={s} value={s}>{s || "all statuses"}</option>)}
        </select>
        <select className="select w-32" value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p || "all priorities"}</option>)}
        </select>
      </div>

      {/* Project List */}
      {loading ? (
        <div className="text-dim font-mono text-sm animate-pulse">Loading…</div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <div
              key={p.id}
              className={`card p-4 cursor-pointer hover:border-line2 transition-colors
                ${p.status === "blocked" ? "border-nred/30 hover:border-nred/50" : ""}`}
              onClick={() => navigate(`/app/projects/${p.id}`)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display font-semibold text-white">{p.title}</h3>
                    <StatusBadge status={p.status} />
                    {p.priority && <PriorityBadge priority={p.priority} />}
                    {p.category && <span className="badge text-faint border-faint/25">{p.category}</span>}
                  </div>
                  {p.shortDescription && (
                    <p className="text-dim text-sm mt-1 truncate">{p.shortDescription}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-mono text-xs text-dim">{relativeTime(p.updatedAt)}</div>
                  {p.dueDate && (
                    <div className="font-mono text-[10px] text-faint mt-0.5">
                      due {new Date(p.dueDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <ProgressBar value={p.progressPercent} label />
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="text-center py-12 text-dim font-mono text-sm">No projects found</div>
          )}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={creating} onClose={() => setCreating(false)} title="New Project" wide>
        <ProjectForm onSave={() => { setCreating(false); load(); }} onClose={() => setCreating(false)} />
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!projectId} onClose={() => navigate("/app/projects")} title="Project Details" wide>
        {projectId && (
          <ProjectDetail id={projectId} onClose={() => navigate("/app/projects")} onUpdate={load} />
        )}
      </Modal>
    </div>
  );
}
