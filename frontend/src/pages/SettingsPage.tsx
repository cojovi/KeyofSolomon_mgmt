import { useEffect, useState } from "react";
import { Bell, Save, Eye, EyeOff } from "lucide-react";
import { api } from "../lib/api";
import type { Settings } from "../lib/types";
import { useToast } from "../components/ui/Toast";

const AI_PROVIDERS = [
  { value: "none", label: "None (disabled)" },
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI (GPT)" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "ollama", label: "Ollama (local)" },
];

const PROVIDER_MODELS: Record<string, string[]> = {
  anthropic: ["claude-3-5-haiku-20241022", "claude-3-5-sonnet-20241022", "claude-3-opus-20240229"],
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"],
  openrouter: ["anthropic/claude-3-haiku", "openai/gpt-4o-mini", "mistralai/mistral-7b-instruct"],
  ollama: ["llama3.2", "llama3.1", "mistral", "codellama", "gemma2"],
  none: [],
};

export function SettingsPage() {
  const [settings, setSettings] = useState<Partial<Settings>>({});
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    api.get<Settings>("/settings").then(setSettings);
  }, []);

  const set = (k: string, v: string) => setSettings((s) => ({ ...s, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const saved = await api.patch<Settings>("/settings", settings);
      setSettings(saved);
      window.dispatchEvent(new CustomEvent("browser-notification-setting-changed", { detail: saved.browserNotificationsEnabled === "true" }));
      toast("Settings saved");
    } catch (e: any) { toast(e.message, true); }
    finally { setSaving(false); }
  }

  const provider = settings.aiProvider ?? "none";
  const modelOptions = PROVIDER_MODELS[provider] ?? [];

  async function enableBrowserNotifications() {
    if (!("Notification" in window)) { toast("This browser does not support desktop notifications", true); return; }
    const permission = await Notification.requestPermission();
    const enabled = permission === "granted";
    set("browserNotificationsEnabled", enabled ? "true" : "false");
    window.dispatchEvent(new CustomEvent("browser-notification-setting-changed", { detail: enabled }));
    toast(enabled ? "Browser notifications enabled" : "Notification permission was not granted", !enabled);
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="font-display font-bold text-2xl text-white tracking-wide">Settings</h1>
        <p className="text-dim text-sm mt-0.5">Local configuration — stored in database</p>
      </div>

      {/* Dashboard */}
      <section className="card p-6 space-y-4">
        <div className="zone-title mb-1"><span className="zone-dot bg-cyan" />Dashboard</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono text-dim mb-1 block">REFRESH INTERVAL (seconds)</label>
            <input type="number" className="input" value={settings.dashboardRefreshSeconds ?? "30"}
              onChange={(e) => set("dashboardRefreshSeconds", e.target.value)} min={5} max={300} />
          </div>
          <div>
            <label className="text-xs font-mono text-dim mb-1 block">ANIMATION SPEED (0.5 – 2)</label>
            <input type="number" className="input" value={settings.animationSpeed ?? "1"}
              onChange={(e) => set("animationSpeed", e.target.value)} min={0.1} max={3} step={0.1} />
          </div>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" className="accent-cyan" checked={settings.reducedMotion === "true"}
            onChange={(e) => set("reducedMotion", e.target.checked ? "true" : "false")} />
          <span className="text-sm text-dim">Reduced motion</span>
        </label>
      </section>

      <section className="card p-6 space-y-4">
        <div className="zone-title mb-1"><span className="zone-dot bg-amber" />Notifications</div>
        <div className="flex items-start justify-between gap-4 rounded-xl border border-line p-4">
          <div className="flex items-start gap-3">
            <Bell size={18} className="text-amber mt-0.5 flex-shrink-0" />
            <div><p className="text-sm font-semibold text-[#e6f2ff]">Browser notifications</p><p className="text-xs text-dim mt-1">Show task completions, approval requests, integration failures, and Gordon replies when this tab is open but hidden.</p></div>
          </div>
          {settings.browserNotificationsEnabled === "true" ? (
            <button onClick={() => { set("browserNotificationsEnabled", "false"); window.dispatchEvent(new CustomEvent("browser-notification-setting-changed", { detail: false })); }} className="btn-ghost text-xs">Disable</button>
          ) : (
            <button onClick={enableBrowserNotifications} className="btn-ghost text-xs">Enable</button>
          )}
        </div>
        <p className="font-mono text-[10px] text-faint">Permission is requested only when you click Enable. Notifications cannot appear after every Key of Solomon tab has been closed.</p>
      </section>

      {/* AI Provider */}
      <section className="card p-6 space-y-4">
        <div className="zone-title mb-1"><span className="zone-dot bg-purple" />Embedded AI</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-line px-3 py-2">
            <input type="checkbox" className="accent-cyan" checked={settings.captureAutoClassify !== "false"}
              onChange={(e) => set("captureAutoClassify", e.target.checked ? "true" : "false")} />
            <span className="text-sm text-dim">Classify Fast Capture</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-line px-3 py-2">
            <input
              type="checkbox"
              className="accent-cyan"
              checked={settings.captureAutoBreakdown !== "false"}
              disabled={settings.captureAutoClassify === "false"}
              onChange={(e) => set("captureAutoBreakdown", e.target.checked ? "true" : "false")}
            />
            <span className="text-sm text-dim">Create initial subtask plan</span>
          </label>
        </div>
        <div>
          <label className="text-xs font-mono text-dim mb-1 block">PROVIDER</label>
          <select className="select" value={provider} onChange={(e) => {
            const nextProvider = e.target.value;
            set("aiProvider", nextProvider);
            set("aiModel", PROVIDER_MODELS[nextProvider]?.[0] ?? "");
            if (nextProvider === "ollama" && !settings.aiBaseUrl) {
              set("aiBaseUrl", "http://localhost:11434");
            }
          }}>
            {AI_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        {provider !== "none" && (
          <>
            <div>
              <label className="text-xs font-mono text-dim mb-1 block">MODEL</label>
              {modelOptions.length > 0 ? (
                <select className="select" value={settings.aiModel ?? ""} onChange={(e) => set("aiModel", e.target.value)}>
                  {modelOptions.map((m) => <option key={m}>{m}</option>)}
                  <option value="">Custom…</option>
                </select>
              ) : (
                <input className="input" value={settings.aiModel ?? ""}
                  onChange={(e) => set("aiModel", e.target.value)} placeholder="model name" />
              )}
              {(!settings.aiModel || !modelOptions.includes(settings.aiModel)) && (
                <input className="input mt-2" value={settings.aiModel ?? ""}
                  onChange={(e) => set("aiModel", e.target.value)} placeholder="custom model name" />
              )}
            </div>

            {provider === "ollama" && (
              <div>
                <label className="text-xs font-mono text-dim mb-1 block">BASE URL</label>
                <input className="input" value={settings.aiBaseUrl || "http://localhost:11434"}
                  onChange={(e) => set("aiBaseUrl", e.target.value)} />
              </div>
            )}

            {provider !== "ollama" && (
              <div>
                <label className="text-xs font-mono text-dim mb-1 block">API KEY</label>
                <div className="relative">
                  <input className="input pr-10" type={showKey ? "text" : "password"}
                    value={settings.aiApiKey ?? ""}
                    onChange={(e) => set("aiApiKey", e.target.value)}
                    placeholder={`${provider === "anthropic" ? "sk-ant-" : "sk-"}…`} />
                  <button onClick={() => setShowKey((s) => !s)}
                    title={showKey ? "Hide API key" : "Show API key"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dim hover:text-[#dbe8fa]">
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-faint text-xs font-mono mt-1">Stored locally in SQLite only. Never transmitted except to the provider.</p>
              </div>
            )}
          </>
        )}
      </section>

      {/* API Info */}
      <section className="card p-6 space-y-3">
        <div className="zone-title mb-1"><span className="zone-dot bg-nblue" />API Info</div>
        <div className="font-mono text-sm space-y-2 text-dim">
          <div><span className="text-faint">Base URL:</span> <span className="text-cyan">http://localhost:8787/api/v1</span></div>
          <div><span className="text-faint">Auth:</span> <span className="text-[#dbe8fa]">Authorization: Bearer &lt;LOCAL_API_TOKEN&gt;</span></div>
          <div><span className="text-faint">Gordon:</span> <span className="text-lime">separate GORDON_API_TOKEN · /agent only</span></div>
          <div><span className="text-faint">Token:</span> <span className="text-amber">set in .env file</span></div>
          <div><span className="text-faint">Docs:</span> <span className="text-purple">./docs/API.md · ./docs/AGENT_API.md</span></div>
        </div>
      </section>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="btn-cyan">
          <Save size={14} />{saving ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
