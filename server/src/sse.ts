import type { Response } from "express";

const clients = new Set<Response>();

export function addClient(res: Response) {
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

export function emitSSE(type: string, payload: Record<string, unknown> = {}) {
  const msg = `event: ${type}\ndata: ${JSON.stringify({ ...payload, at: new Date().toISOString() })}\n\n`;
  for (const client of clients) {
    try {
      client.write(msg);
    } catch {
      clients.delete(client);
    }
  }
}
