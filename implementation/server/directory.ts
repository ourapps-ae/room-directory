// One summary of every room for the home screens. Rooms write their entry only when their
// players change or a game starts or ends; home screens hold a live connection and get the whole
// list again after each change. Between changes the object sleeps with them connected.
// The runtime base class is injected, so this file imports nothing from a hosting platform.
import { announcement, listRooms, removeRoom, upsertRoom, type ListOptions, type RoomEntry, type Rooms } from "./directory-core.ts";

const KEY = "rooms";

export type DirectoryStorage = { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void> };
export type DirectoryContext = {
  storage: DirectoryStorage;
  getWebSockets(): { send(message: string): void }[];
  blockConcurrencyWhile(work: () => Promise<void>): void;
  setWebSocketAutoResponse?(pair: unknown): void;
  abort?(reason: string): void;
  acceptWebSocket?(socket: unknown): void;
};
export type DirectoryEnvironment = { CODE_VERSION?: string; ROOM?: { getByName(name: string): { fetch(input: string, init?: RequestInit): Promise<Response> } } };
export type DirectoryOptions = {
  // Rooms that always exist, in display order; each is asked directly the first time it is missing.
  roomIds?: readonly string[];
  openStatuses?: readonly string[];
  maxConnections: number;
  // Ask one room for its entry; the default calls env.ROOM at /room like realtime-rooms.
  askRoom?: (env: DirectoryEnvironment, id: string) => Promise<RoomEntry>;
  // Open a watcher connection and send it the current list; the default uses the Workers WebSocketPair.
  accept?: (ctx: DirectoryContext, first: string) => Response;
};

async function askRoomByName(env: DirectoryEnvironment, id: string): Promise<RoomEntry> {
  const response = await env.ROOM!.getByName(id).fetch("https://room/room", { headers: { "x-room-id": id, "x-code-version": env.CODE_VERSION ?? "" } });
  return (await response.json()) as RoomEntry;
}

function acceptWithWorkers(ctx: DirectoryContext, first: string): Response {
  const Pair = (globalThis as unknown as { WebSocketPair: new () => { 0: unknown; 1: { send(m: string): void } } }).WebSocketPair;
  const pair = new Pair();
  ctx.acceptWebSocket!(pair[1]);
  pair[1].send(first);
  return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
}

export function createDirectoryClass<Base extends new (ctx: any, env: any) => { ctx: DirectoryContext; env: DirectoryEnvironment }>(
  DurableObjectBase: Base,
  options: DirectoryOptions,
) {
  const ask = options.askRoom ?? askRoomByName;
  const accept = options.accept ?? acceptWithWorkers;
  const order = options.roomIds ?? [];
  const listOptions: ListOptions = { order, openStatuses: options.openStatuses };
  return class Directory extends DurableObjectBase {
    rooms: Rooms = {};

    constructor(ctx: DirectoryContext, env: DirectoryEnvironment) {
      super(ctx, env);
      const WorkersPair = (globalThis as unknown as { WebSocketRequestResponsePair?: new (a: string, b: string) => unknown }).WebSocketRequestResponsePair;
      // Keep-alive pings are answered without waking the object.
      if (WorkersPair) ctx.setWebSocketAutoResponse?.(new WorkersPair("ping", "pong"));
      ctx.blockConcurrencyWhile(async () => {
        this.rooms = (await ctx.storage.get<Rooms>(KEY)) ?? {};
      });
    }

    async fetch(request: Request): Promise<Response> {
      // An object can outlive a deploy; restart onto the new code when a newer caller arrives.
      if ((request.headers.get("x-code-version") ?? "") !== (this.env.CODE_VERSION ?? "")) this.ctx.abort?.("new deploy");
      const url = new URL(request.url);
      if (url.pathname === "/ws") {
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return Response.json({ error: "badRequest", message: "Expected a WebSocket." }, { status: 426 });
        if (this.ctx.getWebSockets().length >= options.maxConnections) return Response.json({ error: "badRequest", message: "Too many connections." }, { status: 503 });
        return accept(this.ctx, announcement(await this.list()));
      }
      if (request.method === "POST") {
        const entry = (await request.json()) as RoomEntry;
        this.rooms = upsertRoom(this.rooms, entry);
        return this.changed();
      }
      if (request.method === "DELETE") {
        const id = url.searchParams.get("id");
        if (id) this.rooms = removeRoom(this.rooms, id);
        return this.changed();
      }
      return Response.json(await this.list());
    }

    async webSocketClose(ws: { close(code: number, reason: string): void }, code: number): Promise<void> {
      try { ws.close(code === 1005 ? 1000 : code, "closing"); } catch { /* already closed */ }
    }

    private async changed(): Promise<Response> {
      await this.ctx.storage.put(KEY, this.rooms);
      const message = announcement(await this.list());
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(message); } catch { /* closed: the runtime drops it */ }
      }
      return new Response(null, { status: 204 });
    }

    // Every fixed room in order; one never heard from yet is asked directly, once.
    private async list(): Promise<RoomEntry[]> {
      const missing = order.filter((id) => !this.rooms[id]);
      if (missing.length) {
        const entries = await Promise.all(missing.map((id) => ask(this.env, id)));
        for (const entry of entries) this.rooms = upsertRoom(this.rooms, entry);
        await this.ctx.storage.put(KEY, this.rooms);
      }
      return listRooms(this.rooms, listOptions);
    }
  };
}
