import { cls, statusColor, priorityColor } from "../../lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "status" | "priority" | "custom";
  value?: string;
  className?: string;
}

export function Badge({ children, variant, value, className }: BadgeProps) {
  let color = "";
  if (variant === "status" && value) color = statusColor(value);
  if (variant === "priority" && value) color = priorityColor(value);
  return (
    <span className={cls("badge", color, className)}>{children}</span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant="status" value={status}>{status.replace("_", " ")}</Badge>;
}

export function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority) return null;
  return <Badge variant="priority" value={priority}>{priority}</Badge>;
}
