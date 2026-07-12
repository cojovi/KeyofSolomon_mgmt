import { useState, useRef, useEffect } from "react";
import { Zap, CheckCircle, Lightbulb, FolderOpen, StickyNote, ArrowLeft, ListTree } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { CaptureResult } from "../lib/types";

const TYPE_ICONS = { task: CheckCircle, idea: Lightbulb, project: FolderOpen, note: StickyNote };
const TYPE_COLORS = { task: "text-cyan", idea: "text-purple", project: "text-lime", note: "text-amber" };
const TYPE_LABELS = { task: "TASK", idea: "IDEA", project: "PROJECT", note: "NOTE" };

interface CapturedItem extends CaptureResult {
  inputText: string;
  timestamp: Date;
}

export function Capture() {
  const [text, setText] = useState("");
  const [forceType, setForceType] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<CapturedItem[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // check url param
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) setText(q);
  }, []);

  async function submit() {
    const t = text.trim();
    if (!t) return;
    setLoading(true);
    try {
      const result = await api.post<CaptureResult>("/capture", {
        text: t,
        type: forceType || undefined,
      });
      setHistory((h) => [{ ...result, inputText: t, timestamp: new Date() }, ...h.slice(0, 19)]);
      setText("");
      inputRef.current?.focus();
    } catch (e: any) {
      setHistory((h) => [{
        classified: false, type: "task", aiError: e.message,
        inputText: t, timestamp: new Date(),
        created: {} as any,
      }, ...h.slice(0, 19)]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start pt-16 px-6"
      style={{
        background: "#04060c",
        backgroundImage: `
          radial-gradient(800px 400px at 50% 0%, rgba(0,240,255,0.06), transparent 60%),
          radial-gradient(600px 300px at 80% 100%, rgba(167,139,250,0.05), transparent 60%)
        `,
      }}
    >
      {/* Back link */}
      <Link to="/app" className="absolute top-6 left-6 flex items-center gap-1.5 text-dim hover:text-cyan font-mono text-xs transition-colors">
        <ArrowLeft size={12} />Back to Control Panel
      </Link>

      {/* Header */}
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Zap size={28} className="text-lime" style={{ filter: "drop-shadow(0 0 10px #b6ff2e)" }} />
          <h1 className="font-display font-bold text-4xl tracking-widest text-white">
            FAST <span className="text-lime" style={{ textShadow: "0 0 20px #b6ff2e" }}>CAPTURE</span>
          </h1>
        </div>
        <p className="font-mono text-dim text-sm tracking-wide">Type it. Hit Enter. AI classifies it.</p>
      </div>

      {/* Input area */}
      <div className="w-full max-w-2xl space-y-4">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder={`"Buy dog food"\n"Build the pricing widget for CMAC"\n"Idea: subscription tier for mini-homes"`}
            rows={3}
            disabled={loading}
            className="w-full bg-panel border-2 border-line focus:border-lime/50 rounded-2xl px-5 py-4 text-lg text-[#dbe8fa] font-body
                       placeholder:text-faint focus:outline-none transition-colors resize-none"
            style={{ boxShadow: text ? "0 0 30px rgba(182,255,46,0.06)" : undefined }}
          />
          {loading && (
            <div className="absolute right-4 bottom-4 flex items-center gap-2 text-lime font-mono text-xs">
              <span className="animate-pulse">CLASSIFYING…</span>
            </div>
          )}
        </div>

        {/* Type override */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-faint">FORCE TYPE:</span>
          <div className="flex gap-2">
            {(["", "task", "idea", "project", "note"] as const).map((t) => (
              <button key={t} onClick={() => setForceType(t)}
                className={`font-mono text-xs px-3 py-1.5 rounded-lg border transition-colors
                  ${forceType === t ? "border-lime/50 text-lime bg-lime/10" : "border-line text-dim hover:text-[#dbe8fa]"}`}>
                {t || "AUTO"}
              </button>
            ))}
          </div>
          <button onClick={submit} disabled={loading || !text.trim()}
            className="ml-auto flex items-center gap-2 px-6 py-2 rounded-xl bg-lime/15 border border-lime/40 text-lime font-display font-bold
                       hover:bg-lime/25 disabled:opacity-40 transition-colors">
            <Zap size={16} />CAPTURE
          </button>
        </div>

        <p className="font-mono text-[10px] text-faint text-center">
          Enter to capture · Shift+Enter for new line · AI auto-classifies (configure in Settings)
        </p>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="w-full max-w-2xl mt-10 space-y-2">
          <div className="font-mono text-xs text-faint tracking-widest mb-3">— CAPTURED THIS SESSION —</div>
          {history.map((item, idx) => {
            const Icon = TYPE_ICONS[item.type] ?? CheckCircle;
            const color = TYPE_COLORS[item.type] ?? "text-dim";
            return (
              <div key={idx}
                className="flex items-center gap-4 px-4 py-3 rounded-xl border border-line bg-panel/50"
                style={{ animation: idx === 0 ? "rise 0.3s backwards" : undefined }}>
                <Icon size={16} className={`${color} flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#dbe8fa] truncate">{item.inputText}</p>
                  {item.aiError && <p className="text-xs text-amber font-mono mt-0.5">⚠ {item.aiError}</p>}
                  {!!item.subtasks?.length && (
                    <p className="text-xs text-cyan font-mono mt-0.5 flex items-center gap-1">
                      <ListTree size={11} />1 main task + {item.subtasks.length} subtasks
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  {item.classified && (
                    <span className="badge text-purple border-purple/30 text-[9px]">AI</span>
                  )}
                  <span className={`badge ${color} border-current/30 text-[9px]`}>
                    {TYPE_LABELS[item.type]}
                  </span>
                  <span className="font-mono text-[10px] text-faint">
                    {item.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
