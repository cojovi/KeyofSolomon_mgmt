import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, FolderOpen, CheckSquare, Lightbulb,
  Activity, Bot, Settings, Zap,
} from "lucide-react";

const NAV = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/app/projects", label: "Projects", icon: FolderOpen },
  { to: "/app/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/app/ideas", label: "Ideas", icon: Lightbulb },
  { to: "/app/activity", label: "Activity", icon: Activity },
  { to: "/app/agent", label: "Agent", icon: Bot },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="w-56 flex-shrink-0 flex flex-col bg-panel border-r border-line h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-line">
        <div className="font-display font-bold text-xl tracking-widest text-white">
          KEY OF <span className="text-cyan" style={{ textShadow: "0 0 16px #00f0ff" }}>SOLOMON</span>
        </div>
        <div className="font-mono text-[9px] tracking-[3px] text-faint mt-0.5">COMMAND CENTER</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 flex flex-col gap-0.5 px-2">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg font-body font-semibold text-sm transition-all duration-150
               ${isActive
                 ? "bg-cyan/10 text-cyan border border-cyan/25"
                 : "text-dim hover:text-[#dbe8fa] hover:bg-white/5 border border-transparent"
               }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Quick links */}
      <div className="px-3 py-3 border-t border-line flex flex-col gap-1">
        <a
          href="/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono text-dim hover:text-cyan transition-colors border border-transparent hover:border-cyan/20"
        >
          <LayoutDashboard size={13} />
          Live Dashboard ↗
        </a>
        <NavLink
          to="/capture"
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono transition-colors border
             ${isActive ? "text-lime border-lime/25 bg-lime/5" : "text-dim hover:text-lime border-transparent hover:border-lime/20"}`
          }
        >
          <Zap size={13} />
          Fast Capture
        </NavLink>
      </div>
    </aside>
  );
}
