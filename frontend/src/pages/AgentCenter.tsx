import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Bot, Check, ChevronDown, ChevronUp, Clock3, RefreshCw,
  Radio, RotateCcw, Send, ShieldCheck, Sparkles, X,
} from "lucide-react";
import { api, apiStream, connectSSE } from "../lib/api";
import type {
  AgentAction, AgentApproval, Task, AISummary, OpenClawIntegrationStatus,
  GordonChatMessage,
} from "../lib/types";
import { relativeTime } from "../lib/utils";
import { entityPath } from "../lib/entityLinks";
import { useToast } from "../components/ui/Toast";
import { PriorityBadge, StatusBadge } from "../components/ui/Badge";

const ACTION_COLORS: Record<string, string> = {
  create: "text-cyan border-cyan/30", update: "text-nblue border-nblue/30",
  status_change: "text-amber border-amber/30", add_note: "text-purple border-purple/30",
  convert_idea: "text-lime border-lime/30", dashboard_request: "text-faint border-faint/25",
  reminder: "text-pink border-pink/30", error: "text-nred border-nred/40",
};

const APPROVAL_LABELS: Record<string, string> = {
  mark_complete: "Mark work complete", archive: "Archive this item", set_urgent: "Escalate to urgent",
  convert_idea_to_project: "Convert idea into a project", modify_description: "Modify user-written content",
  delete_note: "Remove a note", bulk_update: "Apply a bulk update",
};

type AgentState = "quiet" | "active" | "attention" | "error";

function AgentAvatarDisplay({ state }: { state: AgentState }) {
  const colors = { quiet: "#7e90ad", active: "#00f0ff", attention: "#ffb020", error: "#ff4757" };
  const labels = { quiet: "QUIET", active: "ACTIVE", attention: "NEEDS ATTENTION", error: "ERROR" };
  const color = colors[state];
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full border-2 animate-spin-slow" style={{ borderColor: `${color}40`, borderTopColor: color }} />
        <div className="absolute inset-3 rounded-full border border-dashed animate-spin-slow" style={{ borderColor: `${color}60`, animationDirection: "reverse", animationDuration: "6s" }} />
        <div className="absolute inset-6 rounded-full flex items-center justify-center" style={{ background: `radial-gradient(circle, ${color}30, transparent)`, boxShadow: `0 0 20px ${color}50` }}>
          <Bot size={16} style={{ color }} />
        </div>
        {(state === "attention" || state === "error") && <div className="absolute inset-0 rounded-full animate-ping" style={{ background: `${color}15`, animationDuration: "1.5s" }} />}
      </div>
      <div className="font-mono text-[11px] tracking-[2px]" style={{ color }}>{labels[state]}</div>
    </div>
  );
}

function ApprovalCard({ approval, resolving, onResolve }: {
  approval: AgentApproval;
  resolving: boolean;
  onResolve: (approval: AgentApproval, action: "approve" | "reject", note?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const path = approval.target ? entityPath(approval.target.type, approval.target.id) : null;
  return (
    <article className="border border-amber/25 rounded-xl p-4 bg-amber/[0.045]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge text-amber border-amber/40">{APPROVAL_LABELS[approval.actionType] || approval.actionType.replace(/_/g, " ")}</span>
            <span className="font-mono text-[10px] text-faint">waiting {relativeTime(approval.requestedAt).replace(" ago", "")}</span>
          </div>
          {approval.target && (
            path ? <Link to={path} className="inline-flex mt-2 font-display text-base font-semibold text-[#e6f2ff] hover:text-cyan">{approval.target.title} →</Link>
              : <p className="mt-2 font-display text-base font-semibold text-[#e6f2ff]">{approval.target.title}</p>
          )}
          <p className="text-sm text-dim mt-1 leading-relaxed">{approval.reason}</p>
          <button onClick={() => setExpanded((value) => !value)} className="mt-2 inline-flex items-center gap-1 text-xs font-mono text-amber hover:text-white">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Proposed changes
          </button>
          {expanded && (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-line bg-bg/40 p-3 text-xs">
              {Object.entries(approval.payload || {}).map(([key, value]) => (
                <div key={key} className="contents"><dt className="font-mono text-faint">{key}</dt><dd className="text-dim break-words">{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>
              ))}
            </dl>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button disabled={resolving} onClick={() => onResolve(approval, "approve", note)} className="btn-lime text-xs px-2 py-1"><Check size={11} />Approve</button>
          <button disabled={resolving} onClick={() => onResolve(approval, "reject", note)} className="btn-danger text-xs px-2 py-1"><X size={11} />Reject</button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={note} onChange={(event) => setNote(event.target.value)} className="input py-1.5 text-xs flex-1 min-w-[220px]" maxLength={1000} placeholder="Optional decision note for Gordon…" />
        {["Not now", "Wrong action", "Needs changes"].map((reason) => (
          <button key={reason} onClick={() => onResolve(approval, "reject", reason)} disabled={resolving} className="btn-ghost text-[11px] py-1">{reason}</button>
        ))}
      </div>
    </article>
  );
}

function ChatWithGordon({ integration, messages, setMessages, reload }: {
  integration: OpenClawIntegrationStatus | null;
  messages: GordonChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<GordonChatMessage[]>>;
  reload: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const configured = !!integration?.chat?.enabled && !!integration.chat.configured;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const upsert = (message: GordonChatMessage) => setMessages((current) => {
    const exists = current.some((item) => item.id === message.id);
    return exists ? current.map((item) => item.id === message.id ? message : item) : [...current, message];
  });

  async function send(retryMessageId?: string) {
    const message = text.trim();
    if (!retryMessageId && !message) return;
    setBusy(true);
    if (!retryMessageId) setText("");
    try {
      await apiStream("/integrations/openclaw/chat/stream", retryMessageId ? { retryMessageId } : { message }, ({ type, data }) => {
        if (type === "message") {
          if (data.user) upsert(data.user);
          if (data.assistant) upsert(data.assistant);
        } else if (type === "delta") {
          setMessages((current) => current.map((item) => item.id === data.id ? { ...item, content: item.content + data.delta, updatedAt: new Date().toISOString() } : item));
        } else if (type === "done" && data.message) {
          upsert(data.message);
        } else if (type === "error") {
          setMessages((current) => current.map((item) => item.id === data.id ? { ...item, status: "failed", error: data.message } : item));
        }
      });
    } catch (error: any) {
      toast(error.message, true);
      if (!retryMessageId) setText(message);
    } finally {
      setBusy(false);
      await reload();
    }
  }

  return (
    <section id="chat" className="card p-5 scroll-mt-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="zone-title"><span className="zone-dot bg-lime" />Chat with Gordon</div>
          <p className="text-xs text-dim mt-1">A direct owner conversation with OpenClaw agent <span className="text-lime">main</span>. Gordon retains his configured tools and Solomon approval gates.</p>
        </div>
        <span className={`badge ${configured ? "text-lime border-lime/30" : "text-amber border-amber/30"}`}>{configured ? busy ? "RESPONDING" : "READY" : "OFFLINE"}</span>
      </div>
      {!configured ? (
        <div className="rounded-xl border border-amber/20 bg-amber/5 p-4 text-sm text-dim">
          Chat is disabled until the server-only OpenClaw Gateway URL and token are configured. Webhook delivery can remain active independently.
        </div>
      ) : (
        <>
          <div className="h-80 overflow-y-auto rounded-xl border border-line bg-[#060a12]/80 p-4 space-y-3" aria-live="polite">
            {messages.length === 0 && <div className="h-full flex items-center justify-center text-center"><p className="text-sm text-faint max-w-sm">Ask Gordon about current work, give him a task, or request an update. The conversation is retained in Key of Solomon.</p></div>}
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[82%] rounded-2xl px-4 py-3 border ${message.role === "user" ? "bg-cyan/10 border-cyan/25" : "bg-lime/[0.055] border-lime/20"}`}>
                  <div className={`font-mono text-[10px] uppercase tracking-[1.5px] mb-1 ${message.role === "user" ? "text-cyan" : "text-lime"}`}>{message.role === "user" ? "Cody" : "Gordon"}</div>
                  <p className="text-sm text-[#e6f2ff] whitespace-pre-wrap leading-relaxed">{message.content || (message.status === "streaming" ? "Thinking…" : "No text response")}</p>
                  <div className="flex items-center gap-2 mt-1.5 font-mono text-[10px] text-faint">
                    <span>{relativeTime(message.createdAt)}</span>
                    {message.status === "streaming" && <span className="text-cyan animate-pulse">streaming</span>}
                    {message.status === "failed" && <span className="text-nred">{message.error || "failed"}</span>}
                    {message.role === "assistant" && message.status === "failed" && message.replyToId && (
                      <button onClick={() => send(message.replyToId)} disabled={busy} className="inline-flex items-center gap-1 text-cyan hover:text-white"><RotateCcw size={10} />Retry</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="mt-3 flex items-end gap-3">
            <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={8000} rows={2}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }}
              className="input resize-none min-h-[58px]" placeholder="Message Gordon… (Enter to send, Shift+Enter for a new line)" disabled={busy} />
            <button onClick={() => send()} disabled={busy || !text.trim()} className="btn-lime h-[58px] px-4"><Send size={14} />{busy ? "Working…" : "Send"}</button>
          </div>
          <div className="mt-1 text-right font-mono text-[10px] text-faint">{text.length}/8000</div>
        </>
      )}
    </section>
  );
}

export function AgentCenter() {
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [resolvedApprovals, setResolvedApprovals] = useState<AgentApproval[]>([]);
  const [candidates, setCandidates] = useState<Task[]>([]);
  const [summaries, setSummaries] = useState<AISummary[]>([]);
  const [integration, setIntegration] = useState<OpenClawIntegrationStatus | null>(null);
  const [messages, setMessages] = useState<GordonChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [genLoading, setGenLoading] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const [acts, pending, history, cands, sums, hook, chat] = await Promise.all([
        api.get<AgentAction[]>("/agent/actions?limit=20"), api.get<AgentApproval[]>("/approvals/pending"),
        api.get<AgentApproval[]>("/approvals"), api.get<Task[]>("/agent/tasks/available"),
        api.get<AISummary[]>("/ai/summaries"), api.get<OpenClawIntegrationStatus>("/integrations/openclaw/status"),
        api.get<GordonChatMessage[]>("/integrations/openclaw/chat/messages?limit=100"),
      ]);
      setActions(acts); setApprovals(pending); setResolvedApprovals(history.filter((item) => item.status !== "pending").slice(0, 10));
      setCandidates(cands.filter((task) => task.agentCandidate).slice(0, 8)); setSummaries(sums); setIntegration(hook); setMessages(chat);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => connectSSE((event) => {
    if (["approval_requested", "approval_resolved", "data-changed"].includes(event.type)) void load();
  }), [load]);

  async function resolve(approval: AgentApproval, action: "approve" | "reject", note?: string) {
    setResolving(approval.id);
    try {
      await api.post(`/approvals/${approval.id}/${action}`, { note });
      toast(action === "approve" ? "Approved — Gordon has been notified" : "Rejected — Gordon has been notified");
      await load();
    } catch (error: any) { toast(error.message, true); }
    finally { setResolving(null); }
  }

  async function generateSummary(type: string) {
    setGenLoading(type);
    try { await api.post(`/ai/summaries/${type}`); toast("Summary generated ✦"); await load(); }
    catch (error: any) { toast(error.message, true); }
    finally { setGenLoading(null); }
  }

  async function sendTestEvent() {
    try { await api.post("/integrations/openclaw/test"); toast("Test event queued for Gordon"); await load(); }
    catch (error: any) { toast(error.message, true); }
  }

  const recentAction = actions[0];
  const agentState: AgentState = approvals.length ? "attention" : recentAction?.actionType === "error" ? "error"
    : recentAction && Date.now() - new Date(recentAction.createdAt).getTime() < 300_000 ? "active" : "quiet";
  const webhookHealthy = integration?.enabled && integration?.configured && integration.latest?.status !== "failed";
  const chatHealthy = integration?.chat?.enabled && integration.chat.configured && integration.chat.latest?.status !== "failed";
  const summaryTypes = [
    ["today_focus", "Today's Focus"], ["whats_blocked", "What's Blocked"], ["week_progress", "Week Progress"],
    ["ideas_revisit", "Ideas to Revisit"], ["agent_suggest", "Agent Suggestions"],
  ];

  if (loading) return <div className="text-dim font-mono text-sm animate-pulse">Loading agent center…</div>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="panel-header">
        <div><h1 className="font-display font-bold text-2xl text-white tracking-wide">Gordon / OpenClaw</h1><p className="text-dim text-sm">Connection health, approvals, direct chat, and Gordon's audit trail</p></div>
        <button onClick={load} className="btn-ghost"><RefreshCw size={14} />Refresh</button>
      </div>

      <section className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="zone-title mb-3"><span className="zone-dot bg-lime" />OpenClaw Connection</div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
              <span className={`badge ${webhookHealthy ? "text-lime border-lime/30" : "text-amber border-amber/30"}`}><Radio size={10} />Webhook {webhookHealthy ? "healthy" : "not ready"}</span>
              <span className={`badge ${chatHealthy ? "text-lime border-lime/30" : "text-amber border-amber/30"}`}><Bot size={10} />Chat {chatHealthy ? "ready" : "not ready"}</span>
              {integration?.destination && <span className="text-dim">{integration.destination}</span>}
              <span className="text-faint">queued {integration?.queue.queued ?? 0}</span><span className="text-faint">delivered {integration?.queue.delivered ?? 0}</span>
              <span className={(integration?.queue.failed ?? 0) > 0 ? "text-nred" : "text-faint"}>failed {integration?.queue.failed ?? 0}</span>
            </div>
            {integration?.latest && <p className={`mt-2 text-xs ${integration.latest.status === "failed" ? "text-nred" : "text-dim"}`}>Latest webhook: {integration.latest.eventType} · {integration.latest.status} · {relativeTime(integration.latest.createdAt)}</p>}
          </div>
          <button onClick={sendTestEvent} disabled={!integration?.enabled || !integration?.configured} className="btn-ghost text-xs"><Send size={12} />Send test event</button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="card p-4">
          <div className="zone-title mb-2"><span className="zone-dot bg-cyan" />Recorded Gordon Activity</div>
          <AgentAvatarDisplay state={agentState} />
          <div className="text-center space-y-1 mt-2"><p className="font-mono text-xs text-dim">{approvals.length} pending approval{approvals.length !== 1 ? "s" : ""}</p><p className="font-mono text-[10px] text-faint">Last recorded action: {recentAction ? relativeTime(recentAction.createdAt) : "none"}</p></div>
        </section>
        <section id="approvals" className="card p-4 lg:col-span-2 scroll-mt-6">
          <div className="zone-title mb-3"><span className="zone-dot bg-amber" />Pending Approvals <span className="badge text-amber border-amber/30 ml-1">{approvals.length}</span></div>
          {approvals.length === 0 ? (
            <div className="rounded-xl border border-lime/15 bg-lime/[0.035] p-5 flex items-start gap-3"><ShieldCheck className="text-lime flex-shrink-0" size={22} /><div><p className="text-[#e6f2ff] font-semibold">Guardrails active</p><p className="text-sm text-dim mt-1">Gordon can continue safe work automatically. Archive, escalation, conversion, and user-authored content changes pause here for review.</p></div></div>
          ) : <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">{approvals.map((approval) => <ApprovalCard key={approval.id} approval={approval} resolving={resolving === approval.id} onResolve={resolve} />)}</div>}
        </section>
      </div>

      <ChatWithGordon integration={integration} messages={messages} setMessages={setMessages} reload={load} />

      {candidates.length > 0 && <section className="card p-5"><div className="zone-title mb-3"><span className="zone-dot bg-purple" />Agent-Candidate Tasks <span className="ml-2 badge text-purple border-purple/30">{candidates.length}</span></div><div className="grid grid-cols-1 md:grid-cols-2 gap-2">{candidates.map((task) => <Link key={task.id} to={`/app/tasks/${task.id}`} className="flex min-h-11 items-center gap-2 p-3 border border-line rounded-lg hover:border-purple/45 focus:outline-none focus:ring-2 focus:ring-purple/35"><Bot size={13} className="text-purple flex-shrink-0" /><span className="text-[15px] text-[#dbe8fa] truncate flex-1">{task.title}</span>{task.priority && <PriorityBadge priority={task.priority} />}<StatusBadge status={task.status} /></Link>)}</div></section>}

      <section className="card p-5"><div className="zone-title mb-4"><span className="zone-dot bg-pink" />AI Summaries</div><div className="flex flex-wrap gap-2 mb-4">{summaryTypes.map(([key, label]) => <button key={key} onClick={() => generateSummary(key)} disabled={genLoading === key} className="btn-ghost text-xs"><Sparkles size={11} />{genLoading === key ? "Generating…" : label}</button>)}</div><div className="space-y-3">{summaries.length === 0 && <p className="text-dim text-sm text-center py-4">No summaries yet — configure an AI provider in Settings.</p>}{summaries.map((summary) => <div key={summary.id} className="border border-line rounded-xl p-4"><div className="flex items-center gap-2 mb-2"><span className="badge text-pink border-pink/30">{summary.type.replace(/_/g, " ")}</span><span className="font-mono text-[10px] text-faint">{relativeTime(summary.generatedAt)} · {summary.provider}</span></div><p className="text-sm text-[#dbe8fa]/90 leading-relaxed">{summary.content}</p></div>)}</div></section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="card p-5"><div className="zone-title mb-3"><span className="zone-dot bg-cyan" />Recent Gordon Actions</div><div className="space-y-2">{actions.map((action) => <div key={action.id} className="flex items-start gap-3 py-2 border-b border-line last:border-0"><span className={`badge text-[9px] flex-shrink-0 mt-0.5 ${ACTION_COLORS[action.actionType] || "text-dim border-dim/30"}`}>{action.actionType}</span><div className="flex-1 min-w-0">{entityPath(action.targetType, action.targetId) ? <Link to={entityPath(action.targetType, action.targetId)!} className="text-sm text-[#dbe8fa] hover:text-cyan leading-snug">{action.summary}</Link> : <p className="text-sm text-[#dbe8fa] leading-snug">{action.summary}</p>}{action.details && <p className="text-xs text-dim mt-0.5">{action.details}</p>}<p className="font-mono text-[10px] text-faint mt-0.5">{action.agentName} · {relativeTime(action.createdAt)}</p></div></div>)}</div></section>
        <section className="card p-5"><div className="zone-title mb-3"><span className="zone-dot bg-lime" />Recent Approval Decisions</div><div className="space-y-2">{resolvedApprovals.map((approval) => <div key={approval.id} className="flex items-start gap-3 py-2 border-b border-line last:border-0">{approval.status === "approved" ? <Check size={14} className="text-lime mt-1" /> : <X size={14} className="text-nred mt-1" />}<div className="min-w-0"><p className="text-sm text-[#dbe8fa]">{APPROVAL_LABELS[approval.actionType] || approval.actionType.replace(/_/g, " ")} · <span className={approval.status === "approved" ? "text-lime" : "text-nred"}>{approval.status}</span></p>{approval.resolutionNote && <p className="text-xs text-dim mt-0.5">{approval.resolutionNote}</p>}<p className="font-mono text-[10px] text-faint mt-0.5">{approval.resolvedAt ? relativeTime(approval.resolvedAt) : "recently"}</p></div></div>)}{resolvedApprovals.length === 0 && <p className="text-sm text-dim text-center py-6">No approval decisions yet</p>}</div></section>
      </div>
    </div>
  );
}
