import { useState, useRef } from "react";
import { Plus, Zap } from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "./ui/Toast";

type AddType = "task" | "idea";

export function QuickAdd() {
  const [text, setText] = useState("");
  const [type, setType] = useState<AddType>("task");
  const [priority, setPriority] = useState("medium");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  async function submit() {
    const t = text.trim();
    if (!t) return;
    setLoading(true);
    try {
      if (type === "task") {
        await api.post("/tasks", { title: t, priority });
        toast("Task added ⚡");
      } else {
        await api.post("/ideas", { title: t, priority: priority === "urgent" ? "high" : priority });
        toast("Idea captured ✦");
      }
      setText("");
      inputRef.current?.focus();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-shrink-0 px-6 py-3 border-b border-line bg-panel/50 flex items-center gap-3">
      <div className="flex rounded-lg border border-line overflow-hidden">
        {(["task", "idea"] as AddType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`px-3 py-1.5 text-xs font-mono tracking-wide transition-colors
              ${type === t ? "bg-cyan/15 text-cyan" : "text-dim hover:text-[#dbe8fa]"}`}
          >
            {t === "task" ? "☰ TASK" : "✦ IDEA"}
          </button>
        ))}
      </div>

      <input
        ref={inputRef}
        className="flex-1 bg-transparent border-none outline-none text-sm font-body placeholder:text-faint text-[#dbe8fa]"
        placeholder={type === "task" ? "Quick task... (Enter to add)" : "Capture idea..."}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        disabled={loading}
      />

      <select
        className="bg-transparent border border-line rounded px-2 py-1 text-xs font-mono text-dim focus:outline-none"
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
      >
        {["low", "medium", "high", "urgent"].map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      <button
        onClick={submit}
        disabled={loading || !text.trim()}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan/15 border border-cyan/30 text-cyan text-xs font-mono
                   hover:bg-cyan/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Plus size={14} />
        Add
      </button>
    </div>
  );
}
