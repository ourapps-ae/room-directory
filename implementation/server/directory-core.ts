// Pure operations on the list of rooms: no storage, no connections, no application words.
export type RoomEntry = { id: string; status: string; playerCount: number; names: string[]; code?: string };
export type Rooms = { [id: string]: RoomEntry };
export type RoomsMessage = { type: "rooms"; rooms: RoomEntry[] };
export type ListOptions = { order?: readonly string[]; openOnly?: boolean; openStatuses?: readonly string[] };
export type EntryAction = "join" | "rejoin" | "watch" | "full" | "none";
export type RoomDescription = { kind: "empty" | "inGame" | "lobby"; names: string[] };

export const DEFAULT_OPEN_STATUSES: readonly string[] = ["lobby"];

export function upsertRoom(rooms: Rooms, entry: RoomEntry): Rooms {
  return { ...rooms, [entry.id]: entry };
}

export function removeRoom(rooms: Rooms, id: string): Rooms {
  const { [id]: _gone, ...rest } = rooms;
  return rest;
}

// Fixed rooms come first in the given order; any others follow by id. A room not heard from yet
// and named in `order` is left out (the directory asks it directly first).
export function listRooms(rooms: Rooms, options: ListOptions = {}): RoomEntry[] {
  const order = options.order ?? [];
  const open = options.openStatuses ?? DEFAULT_OPEN_STATUSES;
  const fixed = order.filter((id) => rooms[id]).map((id) => rooms[id]);
  const rest = Object.keys(rooms).filter((id) => !order.includes(id)).sort().map((id) => rooms[id]);
  const all = [...fixed, ...rest];
  return options.openOnly ? all.filter((r) => open.includes(r.status)) : all;
}

// Codes are typed by people: case, spaces and hyphens do not matter.
export function normaliseCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]+/g, "");
}

export function findByCode(rooms: Rooms | RoomEntry[], code: string): RoomEntry | null {
  const wanted = normaliseCode(code);
  if (!wanted) return null;
  const list = Array.isArray(rooms) ? rooms : Object.values(rooms);
  return list.find((r) => r.code !== undefined && normaliseCode(r.code) === wanted) ?? null;
}

// What a client compares to tell whether the list changed, so a tap is not lost to a redraw.
export function summary(room: RoomEntry): string {
  return `${room.id}|${room.status}|${room.playerCount}|${room.names.join(",")}`;
}

export function listingChanged(previous: RoomEntry[] | null, next: RoomEntry[]): boolean {
  if (previous === null) return true;
  return previous.map(summary).join("\n") !== next.map(summary).join("\n");
}

export function announcement(rooms: RoomEntry[]): string {
  const message: RoomsMessage = { type: "rooms", rooms };
  return JSON.stringify(message);
}

// Enter the room: sit down, rejoin, or watch a game under way; full while no seat is free.
export function entryAction(room: RoomEntry | null, myName: string, capacity: number, openStatuses: readonly string[] = DEFAULT_OPEN_STATUSES): EntryAction {
  if (!room) return "none";
  const inGame = !openStatuses.includes(room.status);
  const seated = room.names.includes(myName);
  if (seated) return "rejoin";
  if (!inGame && room.playerCount >= capacity) return "full";
  return inGame ? "watch" : "join";
}

export function describeRoom(room: RoomEntry, openStatuses: readonly string[] = DEFAULT_OPEN_STATUSES): RoomDescription {
  const kind = room.playerCount === 0 ? "empty" : openStatuses.includes(room.status) ? "lobby" : "inGame";
  return { kind, names: room.names };
}
