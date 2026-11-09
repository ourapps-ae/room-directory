// Portable ndjson export and import of the directory's stored room list (storage key "rooms" of the object named "home").
// The application reads the list from storage and writes it back; nothing here touches a runtime. The list is a summary
// the rooms re-announce, so a lost import costs only a wait until each room next changes.
import { createHash } from "node:crypto";
import type { RoomEntry, Rooms } from "./directory-core.ts";

export const FORMAT = "ae/room-directory-state";
export const VERSION = "1.0.0";
export type Check = { counts: boolean; checksums: boolean; sample: string[] };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key])).join(",") + "}";
  return JSON.stringify(value);
}
export const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

// A header line, then one room line per room in sorted id order, each with a sha256 over its canonical JSON.
export function exportAll(rooms: Rooms): string {
  const ids = Object.keys(rooms).sort();
  const lines: unknown[] = [{ type: "header", format: FORMAT, version: VERSION, rooms: ids.length }];
  for (const id of ids) lines.push({ type: "room", id, entry: rooms[id], sha256: digest(rooms[id]) });
  return lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
}

function entryProblem(id: string, entry: RoomEntry): string | null {
  if (typeof entry !== "object" || entry === null || entry.id !== id) return "entry id differs from its line id";
  if (typeof entry.status !== "string" || !Number.isInteger(entry.playerCount) || entry.playerCount < 0) return "status or playerCount is invalid";
  if (!Array.isArray(entry.names) || entry.names.some((name) => typeof name !== "string")) return "names must be strings";
  if (entry.code !== undefined && typeof entry.code !== "string") return "code must be a string";
  return null;
}

// Parses and verifies; throws on a bad header, count, checksum, duplicate or malformed entry. The caller writes the result with storage.put("rooms", rooms).
export function importAll(text: string): Rooms {
  const lines = text.split("\n").filter((line) => line.length > 0).map((line) => JSON.parse(line));
  const header = lines[0];
  if (!header || header.type !== "header" || header.format !== FORMAT || header.version !== VERSION) throw new Error(`not an ${FORMAT} ${VERSION} export`);
  const rooms: Rooms = {};
  for (const line of lines.slice(1)) {
    if (line.type !== "room") throw new Error("unknown line type " + line.type);
    if (digest(line.entry) !== line.sha256) throw new Error("checksum mismatch for room " + line.id);
    if (line.id in rooms) throw new Error("duplicate room " + line.id);
    const problem = entryProblem(line.id, line.entry);
    if (problem) throw new Error(`room ${line.id}: ${problem}`);
    rooms[line.id] = line.entry;
  }
  if (Object.keys(rooms).length !== header.rooms) throw new Error("room count mismatch");
  return rooms;
}

// Compares a list read back from the new store with the exported one: counts, per-room checksums and a sample of ids.
export function verify(expected: Rooms, actual: Rooms, sample = 20): Check {
  const ids = Object.keys(expected).sort();
  const counts = ids.length === Object.keys(actual).length;
  const checksums = ids.every((id) => actual[id] !== undefined && digest(actual[id]) === digest(expected[id]));
  return { counts, checksums, sample: ids.slice(0, sample) };
}
