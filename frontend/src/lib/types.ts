export type ProjectStatus = "planning" | "active" | "paused" | "blocked" | "completed" | "archived";
export type TaskStatus = "todo" | "in_progress" | "waiting" | "blocked" | "done" | "archived";
export type TaskSource = "user" | "agent" | "fast_capture" | "embedded_ai" | "webhook" | "idea_conversion" | "seed";
export type IdeaStatus = "captured" | "reviewing" | "possible" | "converted" | "archived";
export type Priority = "low" | "medium" | "high" | "urgent";
export type NoteType = "note" | "progress" | "decision" | "blocker" | "agent_update";
export type CreatedBy = "user" | "agent" | "system";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type AIProvider = "anthropic" | "openai" | "openrouter" | "ollama" | "none";

export interface Project {
  id: string;
  title: string;
  shortDescription?: string;
  longDescription?: string;
  category?: string;
  status: ProjectStatus;
  priority?: Priority;
  progressPercent: number;
  tags: string[];
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  area?: string;
  parentTaskId?: string;
  parentTaskTitle?: string;
  source: TaskSource;
  status: TaskStatus;
  priority?: Priority;
  dueDate?: string;
  tags: string[];
  agentCandidate: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  archivedAt?: string;
  subtaskCount?: number;
  completedSubtaskCount?: number;
  subtaskPlanSource?: TaskSource | "mixed";
}

export interface TaskDetailData extends Task {
  parentTask?: Task | null;
  subtasks: Task[];
  notes: Note[];
  attachments: Attachment[];
}

export interface Idea {
  id: string;
  title: string;
  body?: string;
  category?: string;
  status: IdeaStatus;
  priority?: Priority;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  convertedToType?: "task" | "project";
  convertedToId?: string;
  archivedAt?: string;
}

export interface Note {
  id: string;
  parentType: "project" | "task" | "idea";
  parentId: string;
  body: string;
  type: NoteType;
  createdBy: CreatedBy;
  createdAt: string;
}

export interface Attachment {
  id: string;
  parentType: "project" | "task" | "idea" | "note";
  parentId: string;
  label?: string;
  url?: string;
  filePath?: string;
  type?: "link" | "file" | "image" | "document" | "other";
  createdAt: string;
}

export interface AgentAction {
  id: string;
  agentName: string;
  actionType: string;
  targetType?: string;
  targetId?: string;
  summary: string;
  details?: string;
  createdAt: string;
}

export interface OpenClawIntegrationStatus {
  enabled: boolean;
  configured: boolean;
  destination: string | null;
  queue: {
    queued: number;
    delivering: number;
    delivered: number;
    failed: number;
  };
  latest: null | {
    id: string;
    eventType: string;
    entityType?: string;
    entityId?: string;
    priority: string;
    status: "queued" | "delivering" | "delivered" | "failed";
    attempts: number;
    createdAt: string;
    deliveredAt?: string;
    lastError?: string;
  };
  chat: {
    enabled: boolean;
    configured: boolean;
    destination: string | null;
    busy: boolean;
    latest: null | {
      status: "complete" | "streaming" | "failed";
      updatedAt: string;
      error?: string;
    };
  };
}

export interface AgentApproval {
  id: string;
  agentName: string;
  actionType: string;
  targetType?: string;
  targetId?: string;
  payload: Record<string, unknown>;
  reason: string;
  status: ApprovalStatus;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  target?: null | {
    type: string;
    id: string;
    title: string;
    status?: string;
    exists: boolean;
  };
}

export interface GordonChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "streaming" | "failed";
  replyToId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface AppNotification {
  id: string;
  type: string;
  severity: "info" | "success" | "attention" | "error";
  title: string;
  body?: string;
  targetType?: string;
  targetId?: string;
  actor: string;
  dedupeKey: string;
  createdAt: string;
  readAt?: string;
}

export interface AISummary {
  id: string;
  type: string;
  content: string;
  generatedAt: string;
  provider: string;
}

export interface UpcomingDeadline {
  id: string;
  title: string;
  dueDate: string;
  priority?: Priority;
  status: string;
  kind: "task" | "project";
}

export interface DashboardState {
  generatedAt: string;
  summary: {
    activeProjects: number;
    openTasks: number;
    blockedItems: number;
    ideas: number;
    dueToday: number;
    overdue: number;
    completedToday: number;
  };
  ticker: TickerItem[];
  projects: Project[];
  tasks: {
    inProgress: Task[];
    todo: Task[];
    waiting: Task[];
    blocked: Task[];
    dueSoon: Task[];
    dueToday: Task[];
    completedToday: Task[];
  };
  ideas: Idea[];
  recentNotes: Note[];
  agentActions: AgentAction[];
  upcomingDeadlines: UpcomingDeadline[];
}

export interface TickerItem {
  type: string;
  label: string;
  text: string;
  targetType?: string;
  targetId?: string;
}

export interface Settings {
  dashboardRefreshSeconds: string;
  animationSpeed: string;
  reducedMotion: string;
  defaultDashboardMode: string;
  aiProvider: string;
  aiApiKey: string;
  aiModel: string;
  aiBaseUrl: string;
  captureAutoClassify: string;
  captureAutoBreakdown: string;
  browserNotificationsEnabled: string;
}

export interface APIResponse<T> {
  success: boolean;
  data: T;
  error: { code: string; message: string } | null;
}

export interface CaptureResult {
  classified: boolean;
  type: "task" | "idea" | "project" | "note";
  title?: string;
  confidence?: number;
  area?: string;
  aiError?: string;
  created: Task | Idea | Record<string, unknown>;
  subtasks?: Task[];
}
