import type { Response } from "express";

const clients = new Set<Response>();

export function addClient(res: Response) {
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

/**
 * Broadcast an SSE event to all connected dashboard/control-panel clients.
 * Event types: "data-changed" (entity mutated), "ping" (keepalive).
 */
export function broadcast(type: string, payload: Record<string, unknown> = {}) {
  const msg = `event: ${type}\ndata: ${JSON.stringify({ ...payload, at: new Date().toISOString() })}\n\n`;
  for (const c of clients) {
    try { c.write(msg); } catch { clients.delete(c); }
  }
}

// keepalive every 25s so proxies/browsers don't kill the stream
setInterval(() => broadcast("ping"), 25000).unref();
