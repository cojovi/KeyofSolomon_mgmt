interface ProgressBarProps {
  value: number; // 0-100
  label?: boolean;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-2">
      <div className="progress-bar flex-1">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {label && (
        <span className="font-mono text-[10px] text-dim w-7 text-right">{pct}%</span>
      )}
    </div>
  );
}
