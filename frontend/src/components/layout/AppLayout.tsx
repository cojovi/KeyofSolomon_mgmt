import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { QuickAdd } from "../QuickAdd";

export function AppLayout() {
  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <QuickAdd />
        <div className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
