import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Plus, Check, Archive, Bot, ChevronDown, ChevronRight,
  CornerDownRight, ListTree, ArrowUpLeft,
} from "lucide-react";
import { api } from "../lib/api";
import type { Task, TaskDetailData } from "../lib/types";
import { relativeTime, isOverdue, isDueSoon } from "../lib/utils";
import { StatusBadge, PriorityBadge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { useToast } from "../components/ui/Toast";

const STATUSES = ["", "todo", "in_progress", "waiting", "blocked", "done", "archived"];
const PRIORITIES = ["", "low", "medium", "high", "urgent"];
const AREAS = ["", "work", "personal", "home", "coding", "business", "errands", "health", "finance"];
const SOURCE_LABELS: Record<string, string> = {
  agent: "Gordon",
  fast_capture: "Fast Capture",
  embedded_ai: "Embedded AI",
  webhook: "Webhook",
  idea_conversion: "Idea",
};

function TaskForm({ task, defaultParentTaskId, onSave, onClose }: {
  task?: Task;
  defaultParentTaskId?: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: task?.title ?? "",
    description: task?.description ?? "",
    area: task?.area ?? "",
    parentTaskId: task?.parentTaskId ?? defaultParentTaskId ?? "",
    status: task?.status ?? "todo",
    priority: task?.priority ?? "medium",
    dueDate: task?.dueDate ? task.dueDate.slice(0, 10) : "",
    tags: (task?.tags ?? []).join(", "),
    agentCandidate: task?.agentCandidate ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [parentOptions, setParentOptions] = useState<Task[]>([]);
  const { toast } = useToast();
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.get<Task[]>("/tasks?topLevel=true")
      .then((items) => setParentOptions(items.filter((item) => item.id !== task?.id)))
      .catch(() => setParentOptions([]));
  }, [task?.id]);

  async function save() {
    if (!form.title.trim()) { toast("Title is required", true); return; }
    setSaving(true);
    try {
      const body = {
        ...form,
        parentTaskId: form.parentTaskId || null,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        dueDate: form.dueDate || undefined,
      };
      if (task) await api.patch(`/tasks/${task.id}`, body);
      else await api.post("/tasks", body);
      toast(task ? "Task updated" : "Task created");
      onSave();
    } catch (e: any) { toast(e.message, true); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-mono text-dim mb-1 block">TITLE *</label>
        <input className="input" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Task title" />
      </div>
      <div className="grid grid-cols-2 gap-3">
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
          <label className="text-xs font-mono text-dim mb-1 block">AREA</label>
          <select className="select" value={form.area} onChange={(e) => set("area", e.target.value)}>
            {AREAS.map((a) => <option key={a} value={a}>{a || "—"}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-mono text-dim mb-1 block">DUE DATE</label>
          <input type="date" className="input" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-xs font-mono text-dim mb-1 block">PARENT TASK</label>
        <select
          className="select"
          value={form.parentTaskId}
          disabled={!!task?.subtaskCount && !task.parentTaskId}
          onChange={(e) => set("parentTaskId", e.target.value)}
        >
          <option value="">None — main task</option>
          {parentOptions.map((parent) => (
            <option key={parent.id} value={parent.id}>{parent.title}</option>
          ))}
        </select>
        {!!task?.subtaskCount && !task.parentTaskId && (
          <p className="text-[10px] font-mono text-faint mt-1">Main tasks with subtasks cannot become subtasks.</p>
        )}
      </div>
      <div>
        <label className="text-xs font-mono text-dim mb-1 block">DESCRIPTION</label>
        <textarea className="input min-h-[70px] resize-y" value={form.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div>
        <label className="text-xs font-mono text-dim mb-1 block">TAGS (comma separated)</label>
        <input className="input" value={form.tags} onChange={(e) => set("tags", e.target.value)} />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" className="accent-cyan" checked={form.agentCandidate} onChange={(e) => set("agentCandidate", e.target.checked)} />
        <span className="text-sm text-dim font-mono"><Bot size={12} className="inline mr-1" />Agent candidate</span>
      </label>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={save} disabled={saving} className="btn-cyan">
          {saving ? "Saving…" : task ? "Save Changes" : "Create Task"}
        </button>
      </div>
    </div>
  );
}

function TaskDetail({ id, onClose, onUpdate, onNavigate }: {
  id: string;
  onClose: () => void;
  onUpdate: () => void;
  onNavigate: (id: string) => void;
}) {
  const [task, setTask] = useState<TaskDetailData | null>(null);
  const [editing, setEditing] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const { toast } = useToast();
  const load = useCallback(async () => { setTask(await api.get(`/tasks/${id}`)); }, [id]);
  useEffect(() => { setTask(null); load(); }, [load]);

  if (!task) return <div className="text-dim font-mono text-sm animate-pulse">Loading…</div>;

  async function complete() {
    try {
      await api.post(`/tasks/${id}/complete`);
      toast("Task completed ✓"); onClose(); onUpdate();
    } catch (e: any) { toast(e.message, true); }
  }
  async function archive() {
    await api.post(`/tasks/${id}/archive`);
    toast("Task archived"); onClose(); onUpdate();
  }
  async function changeStatus(s: string) {
    try {
      await api.patch(`/tasks/${id}`, { status: s });
      load(); onUpdate();
    } catch (e: any) { toast(e.message, true); }
  }
  async function addNote() {
    if (!noteText.trim()) return;
    await api.post(`/tasks/${id}/notes`, { body: noteText, type: "note" });
    setNoteText(""); load(); toast("Note added");
  }
  async function addLink() {
    if (!linkUrl.trim()) return;
    await api.post(`/tasks/${id}/attachments`, { url: linkUrl, type: "link" });
    setLinkUrl(""); load();
  }
  async function addSubtask() {
    if (!task || !subtaskTitle.trim()) return;
    setAddingSubtask(true);
    try {
      await api.post("/tasks", {
        title: subtaskTitle.trim(),
        parentTaskId: task.id,
        area: task.area,
        priority: "medium",
      });
      setSubtaskTitle("");
      await load();
      onUpdate();
      toast("Subtask added");
    } catch (e: any) { toast(e.message, true); }
    finally { setAddingSubtask(false); }
  }
  async function completeSubtask(subtaskId: string) {
    try {
      await api.post(`/tasks/${subtaskId}/complete`);
      await load();
      onUpdate();
    } catch (e: any) { toast(e.message, true); }
  }

  const incompleteSubtasks = task.subtasks.filter((subtask) => subtask.status !== "done").length;

  return (
    <div className="space-y-5">
      {editing ? (
        <TaskForm task={task} onSave={() => { setEditing(false); load(); onUpdate(); }} onClose={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display font-bold text-xl text-white">{task.title}</h3>
              {task.description && <p className="text-dim text-sm mt-1">{task.description}</p>}
            </div>
            <div className="flex gap-2 flex-shrink-0 flex-wrap">
              {task.status !== "done" && (
                <button
                  onClick={complete}
                  disabled={incompleteSubtasks > 0}
                  title={incompleteSubtasks > 0 ? `Complete ${incompleteSubtasks} remaining subtasks first` : "Complete task"}
                  className="btn-lime text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                ><Check size={12} />Complete</button>
              )}
              <button onClick={() => setEditing(true)} className="btn-ghost text-xs">Edit</button>
              <button onClick={archive} className="btn-danger text-xs"><Archive size={12} />Archive</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={task.status} />
            {task.priority && <PriorityBadge priority={task.priority} />}
            {task.area && <span className="badge text-faint border-faint/25">{task.area}</span>}
            {SOURCE_LABELS[task.source] && <span className="badge text-cyan border-cyan/30">{SOURCE_LABELS[task.source]}</span>}
            {task.agentCandidate && <span className="badge text-purple border-purple/40"><Bot size={9} className="mr-1" />agent</span>}
          </div>
          {task.parentTask && (
            <button
              onClick={() => onNavigate(task.parentTask!.id)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-cyan/20 bg-cyan/5 text-left hover:border-cyan/40 transition-colors"
            >
              <ArrowUpLeft size={13} className="text-cyan" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-faint">Subtask of</span>
              <span className="text-sm text-[#dbe8fa] truncate">{task.parentTask.title}</span>
            </button>
          )}
          <div className="flex gap-2 flex-wrap">
            {STATUSES.filter(Boolean).map((s) => (
              <button key={s} onClick={() => changeStatus(s)}
                className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors
                  ${task.status === s ? "border-cyan/50 text-cyan bg-cyan/10" : "border-line text-faint hover:text-dim"}`}>
                → {s}
              </button>
            ))}
          </div>
          {task.dueDate && (
            <p className={`text-xs font-mono ${isOverdue(task.dueDate) ? "text-nred" : isDueSoon(task.dueDate) ? "text-amber" : "text-dim"}`}>
              DUE: {new Date(task.dueDate).toLocaleDateString()}
              {isOverdue(task.dueDate) && " ⚠ OVERDUE"}
            </p>
          )}
        </>
      )}
      {!task.parentTaskId && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="zone-title"><span className="zone-dot bg-cyan" />Subtasks</div>
            {!!task.subtaskCount && (
              <span className="ml-auto font-mono text-[10px] text-cyan">
                {task.completedSubtaskCount ?? 0}/{task.subtaskCount} complete
              </span>
            )}
          </div>
          <div className="flex gap-2 mb-3">
            <input
              className="input flex-1"
              placeholder="Add a subtask…"
              value={subtaskTitle}
              disabled={task.status === "done" || task.status === "archived" || addingSubtask}
              onChange={(e) => setSubtaskTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addSubtask(); }}
            />
            <button onClick={addSubtask} disabled={!subtaskTitle.trim() || addingSubtask} className="btn-cyan text-xs disabled:opacity-40">
              <Plus size={12} />Add
            </button>
          </div>
          <div className="space-y-1.5">
            {task.subtasks.map((subtask) => (
              <div key={subtask.id} className="flex items-center gap-2 px-2 py-2 rounded-lg border border-line bg-panel2">
                <button
                  onClick={() => completeSubtask(subtask.id)}
                  disabled={subtask.status === "done"}
                  title={subtask.status === "done" ? "Subtask complete" : "Complete subtask"}
                  className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center ${subtask.status === "done" ? "bg-lime/20 border-lime/50" : "border-dim hover:border-cyan"}`}
                >
                  {subtask.status === "done" && <Check size={11} className="text-lime" />}
                </button>
                <button onClick={() => onNavigate(subtask.id)} className="min-w-0 flex-1 text-left">
                  <span className={`text-sm ${subtask.status === "done" ? "line-through text-dim" : "text-[#dbe8fa]"}`}>{subtask.title}</span>
                </button>
                <StatusBadge status={subtask.status} />
              </div>
            ))}
            {task.subtasks.length === 0 && <p className="font-mono text-xs text-faint py-1">No subtasks yet</p>}
          </div>
        </div>
      )}
      <div>
        <div className="zone-title mb-3"><span className="zone-dot bg-purple" />Notes</div>
        <div className="flex gap-2 mb-3">
          <input className="input flex-1" placeholder="Add note…" value={noteText}
            onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addNote(); }} />
          <button onClick={addNote} className="btn-cyan text-xs">Add</button>
        </div>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {task.notes.map((n) => (
            <div key={n.id} className="pl-3 border-l-2 border-line2 py-1">
              <p className="text-sm text-[#dbe8fa]">{n.body}</p>
              <p className="font-mono text-[10px] text-faint">{n.createdBy} · {relativeTime(n.createdAt)}</p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="zone-title mb-3"><span className="zone-dot bg-nblue" />Links</div>
        <div className="flex gap-2 mb-2">
          <input className="input flex-1" placeholder="https://…" value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addLink(); }} />
          <button onClick={addLink} className="btn-cyan text-xs">Add</button>
        </div>
        {task.attachments.map((a) => (
          <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noopener noreferrer"
            className="text-nblue text-sm hover:underline block truncate">{a.label || a.url}</a>
        ))}
      </div>
    </div>
  );
}

function arrangeTaskRows(tasks: Task[], collapsed: Set<string>) {
  const ids = new Set(tasks.map((task) => task.id));
  const children = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.parentTaskId || !ids.has(task.parentTaskId)) continue;
    const siblings = children.get(task.parentTaskId) ?? [];
    siblings.push(task);
    children.set(task.parentTaskId, siblings);
  }

  const rows: { task: Task; depth: 0 | 1 }[] = [];
  for (const task of tasks) {
    if (task.parentTaskId && ids.has(task.parentTaskId)) continue;
    rows.push({ task, depth: task.parentTaskId ? 1 : 0 });
    if (!collapsed.has(task.id)) {
      for (const child of children.get(task.id) ?? []) rows.push({ task: child, depth: 1 });
    }
  }
  return rows;
}

export function Tasks() {
  const navigate = useNavigate();
  const { taskId } = useParams();
  const [searchParams] = useSearchParams();
  const view = searchParams.get("view") || "";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filters, setFilters] = useState({
    q: searchParams.get("q") || "",
    status: searchParams.get("status") || "",
    area: searchParams.get("area") || "",
    priority: searchParams.get("priority") || "",
  });
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filters.q) p.set("q", filters.q);
      if (filters.status) p.set("status", filters.status);
      if (filters.area) p.set("area", filters.area);
      if (filters.priority) p.set("priority", filters.priority);
      setTasks(await api.get<Task[]>(`/tasks?${p}`));
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const visibleTasks = useMemo(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const end = start + 86_400_000;
    if (view === "open") return tasks.filter((task) => !["done", "archived"].includes(task.status));
    if (view === "due-today") return tasks.filter((task) => task.dueDate && !["done", "archived"].includes(task.status) && new Date(task.dueDate).getTime() >= start && new Date(task.dueDate).getTime() < end);
    if (view === "overdue") return tasks.filter((task) => task.dueDate && !["done", "archived"].includes(task.status) && new Date(task.dueDate).getTime() < start);
    return tasks;
  }, [tasks, view]);
  const rows = useMemo(() => arrangeTaskRows(visibleTasks, collapsed), [visibleTasks, collapsed]);
  const mainTaskCount = visibleTasks.filter((task) => !task.parentTaskId).length;
  const subtaskCount = visibleTasks.length - mainTaskCount;

  function toggleCollapsed(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function quickComplete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await api.post(`/tasks/${id}/complete`);
      toast("Done ✓"); load();
    } catch (error: any) { toast(error.message, true); }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="panel-header">
        <div>
          <h1 className="font-display font-bold text-2xl text-white tracking-wide">Tasks</h1>
          <p className="text-dim text-sm">{mainTaskCount} main tasks{subtaskCount ? ` · ${subtaskCount} subtasks` : ""}</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-cyan"><Plus size={14} />New Task</button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input className="input flex-1 min-w-[150px]" placeholder="Search tasks…" value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
        <select className="select w-36" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          {STATUSES.map((s) => <option key={s} value={s}>{s || "all statuses"}</option>)}
        </select>
        <select className="select w-28" value={filters.area} onChange={(e) => setFilters((f) => ({ ...f, area: e.target.value }))}>
          {AREAS.map((a) => <option key={a} value={a}>{a || "all areas"}</option>)}
        </select>
        <select className="select w-28" value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p || "all priorities"}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-dim font-mono text-sm animate-pulse">Loading…</div>
      ) : (
        <div className="space-y-2">
          {rows.map(({ task: t, depth }) => (
            <div key={t.id} className={depth ? "relative ml-7 before:content-[''] before:absolute before:-left-4 before:top-0 before:bottom-1/2 before:w-3 before:border-l before:border-b before:border-cyan/25 before:rounded-bl-lg" : ""}>
            <div
              className={`card px-4 py-3 cursor-pointer hover:border-line2 transition-colors flex items-center gap-3
                ${t.status === "blocked" ? "border-nred/25" : t.status === "done" ? "opacity-60" : ""}
                ${isOverdue(t.dueDate) && t.status !== "done" ? "border-amber/30" : ""}`}
              onClick={() => navigate(`/app/tasks/${t.id}`)}
            >
              {depth === 0 && (t.subtaskCount ?? 0) > 0 ? (
                <button
                  onClick={(e) => toggleCollapsed(t.id, e)}
                  title={collapsed.has(t.id) ? "Show subtasks" : "Hide subtasks"}
                  className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-cyan hover:text-white"
                >
                  {collapsed.has(t.id) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                </button>
              ) : depth === 1 ? (
                <CornerDownRight size={15} className="text-cyan/60 flex-shrink-0" />
              ) : (
                <span className="w-5 flex-shrink-0" />
              )}
              <button
                onClick={(e) => quickComplete(t.id, e)}
                className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors
                  ${t.status === "done" ? "bg-lime/20 border-lime/50" : "border-dim hover:border-cyan"}`}
              >
                {t.status === "done" && <Check size={11} className="text-lime" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-body font-semibold text-sm ${t.status === "done" ? "line-through text-dim" : "text-[#dbe8fa]"}`}>
                    {t.title}
                  </span>
                  <StatusBadge status={t.status} />
                  {t.priority && <PriorityBadge priority={t.priority} />}
                  {t.agentCandidate && <span className="badge text-purple border-purple/30 text-[9px]"><Bot size={8} className="mr-0.5" />agent</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {t.area && <span className="text-faint text-xs font-mono">{t.area}</span>}
                  {depth === 1 && t.parentTaskTitle && (
                    <span className="text-cyan/60 text-[10px] font-mono truncate">subtask of {t.parentTaskTitle}</span>
                  )}
                  {depth === 0 && !!t.subtaskCount && (
                    <span className="text-cyan text-[10px] font-mono inline-flex items-center gap-1">
                      <ListTree size={10} />{t.completedSubtaskCount ?? 0}/{t.subtaskCount}
                    </span>
                  )}
                </div>
              </div>
              {t.dueDate && (
                <span className={`text-xs font-mono flex-shrink-0
                  ${isOverdue(t.dueDate) && t.status !== "done" ? "text-amber" : "text-faint"}`}>
                  {isOverdue(t.dueDate) && t.status !== "done" ? "⚠ " : ""}
                  {new Date(t.dueDate).toLocaleDateString()}
                </span>
              )}
              <span className="text-faint text-xs font-mono flex-shrink-0">{relativeTime(t.updatedAt)}</span>
            </div>
            </div>
          ))}
          {visibleTasks.length === 0 && (
            <div className="text-center py-12 text-dim font-mono text-sm">No tasks found</div>
          )}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="New Task" wide>
        <TaskForm onSave={() => { setCreating(false); load(); }} onClose={() => setCreating(false)} />
      </Modal>
      <Modal open={!!taskId} onClose={() => navigate("/app/tasks")} title="Task Details" wide>
        {taskId && (
          <TaskDetail
            id={taskId}
            onClose={() => navigate("/app/tasks")}
            onUpdate={load}
            onNavigate={(id) => navigate(`/app/tasks/${id}`)}
          />
        )}
      </Modal>
    </div>
  );
}
