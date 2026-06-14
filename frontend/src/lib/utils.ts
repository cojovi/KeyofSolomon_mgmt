export function cls(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

export function isDueSoon(dueDate?: string, days = 3): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate).getTime();
  const now = Date.now();
  return d > now && d < now + days * 86400_000;
}

export const STATUS_COLORS: Record<string, string> = {
  active: "text-cyan border-cyan/40",
  planning: "text-purple border-purple/40",
  paused: "text-amber border-amber/40",
  blocked: "text-nred border-nred/40 bg-nred/10",
  completed: "text-lime border-lime/40",
  archived: "text-faint border-faint/30",
  todo: "text-dim border-dim/30",
  in_progress: "text-cyan border-cyan/40",
  waiting: "text-amber border-amber/40",
  done: "text-lime border-lime/40",
  captured: "text-purple border-purple/40",
  reviewing: "text-amber border-amber/40",
  possible: "text-nblue border-nblue/40",
  converted: "text-lime border-lime/40",
};

export const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-white border-pink bg-pink/25",
  high: "text-pink border-pink/40",
  medium: "text-amber border-amber/35",
  low: "text-dim border-faint/30",
};

export function statusColor(s: string): string {
  return STATUS_COLORS[s] ?? "text-dim border-dim/30";
}

export function priorityColor(p?: string): string {
  if (!p) return "";
  return PRIORITY_COLORS[p] ?? "";
}
