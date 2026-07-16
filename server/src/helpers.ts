import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "node:crypto";

/* ---------- response envelope ---------- */

export function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json({ success: true, data, error: null });
}

export function fail(
  res: Response,
  status: number,
  code: string,
  message: string
) {
  res.status(status).json({ success: false, data: null, error: { code, message } });
}

/* ---------- ids & time ---------- */

export function makeId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function now(): string {
  return new Date().toISOString();
}

/* ---------- auth ---------- */

const TOKEN = process.env.LOCAL_API_TOKEN || "neondeck-local-token-change-me";
const GORDON_TOKEN = process.env.GORDON_API_TOKEN || "";

export function getToken() {
  return TOKEN;
}

export function getGordonToken() {
  return GORDON_TOKEN;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // /health is public
  if (req.path === "/health") return next();
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
  const queryToken = typeof req.query.token === "string" ? req.query.token : null;
  if (bearer === TOKEN || queryToken === TOKEN) {
    (req as any).authScope = "full";
    return next();
  }
  if (GORDON_TOKEN && bearer === GORDON_TOKEN) {
    const agentPath = req.path === "/agent" || req.path.startsWith("/agent/");
    if (!agentPath) {
      return fail(res, 403, "FORBIDDEN", "The Gordon token is limited to /api/v1/agent endpoints.");
    }
    (req as any).authScope = "gordon";
    return next();
  }
  return fail(res, 401, "UNAUTHORIZED", "Missing or invalid API token. Send 'Authorization: Bearer <LOCAL_API_TOKEN>'.");
}

/* ---------- validation ---------- */

export const PROJECT_STATUSES = ["planning", "active", "paused", "blocked", "completed", "archived"] as const;
export const TASK_STATUSES = ["todo", "in_progress", "waiting", "blocked", "done", "archived"] as const;
export const TASK_SOURCES = ["user", "agent", "fast_capture", "embedded_ai", "webhook", "idea_conversion", "seed"] as const;
export const IDEA_STATUSES = ["captured", "reviewing", "possible", "converted", "archived"] as const;
export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const NOTE_TYPES = ["note", "progress", "decision", "blocker", "agent_update"] as const;
export const PARENT_TYPES = ["project", "task", "idea"] as const;
export const ATTACH_PARENTS = ["project", "task", "idea", "note"] as const;
export const ATTACH_TYPES = ["link", "file", "image", "document", "other"] as const;
export const CREATED_BY = ["user", "agent", "system"] as const;
export const ACTION_TYPES = ["create", "update", "status_change", "add_note", "convert_idea", "dashboard_request", "reminder", "error"] as const;

export function requireString(
  body: Record<string, unknown>,
  field: string
): string | null {
  const v = body?.[field];
  if (typeof v !== "string" || v.trim().length === 0) return null;
  return v.trim();
}

export function oneOf(
  value: unknown,
  allowed: readonly string[]
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string" && allowed.includes(value)) return value;
  throw new ValidationError(`Value '${String(value)}' must be one of: ${allowed.join(", ")}`);
}

export function tagsOf(value: unknown): string {
  if (value === undefined || value === null) return "[]";
  if (Array.isArray(value) && value.every((t) => typeof t === "string")) {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(
      value.split(",").map((t) => t.trim()).filter(Boolean)
    );
  }
  throw new ValidationError("tags must be an array of strings or a comma-separated string");
}

export function clampProgress(value: unknown): number {
  const n = Number(value);
  if (Number.isNaN(n)) throw new ValidationError("progressPercent must be a number 0-100");
  return Math.max(0, Math.min(100, Math.round(n)));
}

export class ValidationError extends Error {}

/* ---------- row serialization ---------- */

export function parseRow<T extends Record<string, any>>(row: T | undefined): any {
  if (!row) return undefined;
  const out: Record<string, any> = { ...row };
  if ("tags" in out && typeof out.tags === "string") {
    try { out.tags = JSON.parse(out.tags); } catch { out.tags = []; }
  }
  if ("agentCandidate" in out) out.agentCandidate = !!out.agentCandidate;
  return out;
}

export function parseRows(rows: any[]): any[] {
  return rows.map(parseRow);
}
