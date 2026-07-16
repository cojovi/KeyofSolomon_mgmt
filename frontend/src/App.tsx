import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { Overview } from "./pages/Overview";
import { Projects } from "./pages/Projects";
import { Tasks } from "./pages/Tasks";
import { Ideas } from "./pages/Ideas";
import { Activity } from "./pages/Activity";
import { AgentCenter } from "./pages/AgentCenter";
import { SettingsPage } from "./pages/SettingsPage";
import { Dashboard } from "./pages/Dashboard";
import { Capture } from "./pages/Capture";

export default function App() {
  return (
    <Routes>
      {/* Live dashboard — full screen, no sidebar */}
      <Route path="/dashboard" element={<Dashboard />} />
      {/* Fast capture — minimal UI */}
      <Route path="/capture" element={<Capture />} />
      {/* Control panel */}
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<Overview />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:projectId" element={<Projects />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="tasks/:taskId" element={<Tasks />} />
        <Route path="ideas" element={<Ideas />} />
        <Route path="ideas/:ideaId" element={<Ideas />} />
        <Route path="activity" element={<Activity />} />
        <Route path="agent" element={<AgentCenter />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
