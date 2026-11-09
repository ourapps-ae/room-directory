import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { announcement, describeRoom, entryAction, findByCode, listRooms, listingChanged, removeRoom, upsertRoom, type Rooms } from "../implementation/server/directory-core.ts";
import { digest, exportAll, importAll, verify } from "../implementation/server/directory-migration.ts";
import { createDirectoryClass } from "../implementation/server/directory.ts";
import { watchRooms, type LiveMessage } from "../implementation/web/directory-client.ts";
import { homeScreen } from "../examples/consumer.ts";

const fixture = JSON.parse(readFileSync(new URL("fixtures/rooms.json", import.meta.url), "utf8"));
const byId = (id: string) => fixture.rooms.find((r: { id: string }) => r.id === id);
const asRooms = (): Rooms => fixture.rooms.reduce((all: Rooms, r: { id: string }) => upsertRoom(all, r as never), {});

test("upsert and remove do not change the original list", () => {
  const before: Rooms = {};
  const after = upsertRoom(before, byId("home"));
  assert.deepEqual(before, {});
  assert.deepEqual(Object.keys(after), ["home"]);
  assert.deepEqual(removeRoom(after, "home"), {});
  assert.deepEqual(Object.keys(after), ["home"]);
});

test("fixed rooms keep their order, others follow by id, open rooms can be asked for", () => {
  const rooms = asRooms();
  assert.deepEqual(listRooms(rooms, { order: ["home", "casino", "absent"] }).map((r) => r.id), ["home", "casino", "garden", "shed"]);
  assert.deepEqual(listRooms(rooms, { openOnly: true }).map((r) => r.id), ["casino", "garden", "shed"]);
  assert.deepEqual(listRooms(rooms, { openOnly: true, openStatuses: ["running"] }).map((r) => r.id), ["home"]);
});

test("join by code ignores case, spaces and hyphens and never matches an empty code", () => {
  const rooms = asRooms();
  for (const [code, id] of fixture.codes) assert.equal(findByCode(rooms, code)?.id ?? null, id, code);
});

test("entry action and description follow the room's state", () => {
  for (const [id, name, expected] of fixture.entry) assert.equal(entryAction(byId(id), name, fixture.capacity), expected, `${id}/${name}`);
  assert.equal(entryAction(null, "Zed", 3), "none");
  for (const [id, kind] of fixture.describe) assert.equal(describeRoom(byId(id)).kind, kind, id);
});

test("listing change is detected from the rooms' summaries only", () => {
  const list = fixture.rooms;
  assert.equal(listingChanged(null, list), true);
  assert.equal(listingChanged(structuredClone(list), list), false);
  const joined = structuredClone(list);
  joined[0].playerCount = 1;
  joined[0].names = ["Zed"];
  assert.equal(listingChanged(list, joined), true);
});

class FakeBase {
  stored = new Map<string, unknown>();
  sockets: { send(m: string): void }[] = [];
  aborted: string[] = [];
  ctx: any;
  env: any;
  constructor(ctx: any, env: any) { this.ctx = ctx; this.env = env; }
}
function makeContext(sockets: { sent: string[]; send(m: string): void }[] = [], stored = new Map<string, unknown>()) {
  const aborted: string[] = [];
  return {
    aborted, stored,
    ctx: {
      storage: { get: async (k: string) => stored.get(k), put: async (k: string, v: unknown) => { stored.set(k, v); } },
      getWebSockets: () => sockets,
      blockConcurrencyWhile: (work: () => Promise<void>) => { pending.push(work()); },
      abort: (reason: string) => { aborted.push(reason); },
    },
  };
}
const pending: Promise<void>[] = [];
const socket = () => { const s = { sent: [] as string[], send(m: string) { s.sent.push(m); } }; return s; };

test("directory object: list, update, announce to watchers, remove, persist", async () => {
  const watcher = socket();
  const { ctx, stored } = makeContext([watcher]);
  const asked: string[] = [];
  const Directory = createDirectoryClass(FakeBase as never, {
    roomIds: ["casino", "home"], maxConnections: 2,
    askRoom: async (_env, id) => { asked.push(id); return { id, status: "lobby", playerCount: 0, names: [] }; },
    accept: (_ctx, first) => Response.json({ first }),
  });
  const directory = new Directory(ctx as never, {} as never) as any;
  await Promise.all(pending.splice(0));

  const first = (await (await directory.fetch(new Request("https://directory/"))).json()) as { id: string }[];
  assert.deepEqual(first.map((r) => r.id), ["casino", "home"]);
  assert.deepEqual(asked.sort(), ["casino", "home"]);

  const update = { id: "home", status: "running", playerCount: 2, names: ["Ann", "Bob"] };
  const response = await directory.fetch(new Request("https://directory/", { method: "POST", body: JSON.stringify(update) }));
  assert.equal(response.status, 204);
  assert.equal(watcher.sent.length, 1);
  assert.deepEqual(JSON.parse(watcher.sent[0]), { type: "rooms", rooms: [{ id: "casino", status: "lobby", playerCount: 0, names: [] }, update] });
  assert.equal(watcher.sent[0], announcement(JSON.parse(watcher.sent[0]).rooms));
  assert.deepEqual(asked.length, 2, "a room already known is not asked again");
  assert.ok(stored.get("rooms"));

  const extra = { id: "garden", status: "lobby", playerCount: 1, names: ["Cy"], code: "M4NW9X" };
  await directory.fetch(new Request("https://directory/", { method: "POST", body: JSON.stringify(extra) }));
  const withExtra = (await (await directory.fetch(new Request("https://directory/"))).json()) as { id: string }[];
  assert.deepEqual(withExtra.map((r) => r.id), ["casino", "home", "garden"]);
  await directory.fetch(new Request("https://directory/?id=garden", { method: "DELETE" }));
  assert.equal(watcher.sent.length, 3);
  assert.equal(JSON.parse(watcher.sent[2]).rooms.length, 2);

  // A new object after a restart reads the saved list.
  const again = new Directory(makeContext([], stored).ctx as never, {} as never) as any;
  await Promise.all(pending.splice(0));
  assert.deepEqual(Object.keys(again.rooms).sort(), ["casino", "home"]);
});

test("directory object: watcher connections need an upgrade and are capped; a newer deploy restarts it", async () => {
  const sockets = [socket(), socket()];
  const { ctx, aborted } = makeContext(sockets);
  const Directory = createDirectoryClass(FakeBase as never, { maxConnections: 2, accept: (_c, first) => Response.json({ first }) });
  const directory = new Directory(ctx as never, { CODE_VERSION: "2" } as never) as any;
  await Promise.all(pending.splice(0));
  const headers = { upgrade: "websocket", "x-code-version": "2" };
  assert.equal((await directory.fetch(new Request("https://directory/ws"))).status, 426);
  assert.equal((await directory.fetch(new Request("https://directory/ws", { headers }))).status, 503);
  assert.deepEqual(aborted, ["new deploy"], "the first call carried no version");
  sockets.pop();
  const ok = await directory.fetch(new Request("https://directory/ws", { headers }));
  assert.deepEqual(await ok.json(), { first: JSON.stringify({ type: "rooms", rooms: [] }) });
});

test("watcher reports changed lists and the server being down, nothing else", () => {
  const seen: unknown[] = [];
  let onMessage: (m: LiveMessage) => void = () => {};
  let onDown: (d: boolean) => void = () => {};
  const calls: string[] = [];
  const watcher = watchRooms((path, hello, message, down) => {
    assert.equal(path, "/rooms/ws");
    assert.equal(hello(), null);
    onMessage = message; onDown = down;
    return { open: () => calls.push("open"), close: () => calls.push("close") };
  }, (state) => seen.push(structuredClone(state)));
  assert.deepEqual(calls, ["open"]);
  onDown(true);
  onDown(true);
  assert.equal(seen.length, 1);
  onMessage({ type: "rooms", rooms: fixture.rooms });
  assert.deepEqual(watcher.state().down, false);
  onMessage({ type: "rooms", rooms: structuredClone(fixture.rooms) });
  onMessage({ type: "other" });
  onMessage({ type: "rooms", rooms: "bad" });
  assert.equal(seen.length, 2);
  watcher.sleep(); watcher.wake(); watcher.stop();
  assert.deepEqual(calls, ["open", "close", "open", "close"]);
});

test("example home screen: list text and the button for a typed code", () => {
  let onMessage: (m: LiveMessage) => void = () => {};
  const screen = homeScreen((_p, _h, message) => { onMessage = message; return { open() {}, close() {} }; }, "Zed", fixture.capacity);
  assert.equal(screen.shown(), "");
  onMessage({ type: "rooms", rooms: fixture.rooms });
  assert.equal(screen.shown(), "casino:empty home:inGame garden:lobby shed:lobby");
  assert.deepEqual(screen.buttonForCode("m4 nw9x"), { roomId: "garden", action: "full" });
  assert.deepEqual(screen.buttonForCode("kt7q2p"), { roomId: "home", action: "watch" });
  assert.equal(screen.buttonForCode("zzz"), null);
  screen.stop();
});

test("migration: ndjson export is sorted and checksummed, import verifies and round-trips", () => {
  const rooms = asRooms();
  const text = exportAll(rooms);
  const lines = text.trimEnd().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines[0].type, "header");
  assert.equal(lines[0].rooms, Object.keys(rooms).length);
  assert.deepEqual(lines.slice(1).map((line) => line.id), Object.keys(rooms).sort());
  const imported = importAll(text);
  assert.deepEqual(imported, rooms);
  assert.deepEqual(verify(rooms, imported), { counts: true, checksums: true, sample: Object.keys(rooms).sort() });
  assert.equal(exportAll(JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(rooms).reverse())))), text);
});

test("migration: tampered, miscounted, duplicate or malformed input is rejected and changes are detected", () => {
  const rooms = asRooms();
  const text = exportAll(rooms);
  const first = Object.keys(rooms).sort()[0];
  assert.throws(() => importAll(text.replace('"playerCount":', '"playerCount":9')), /checksum mismatch/);
  assert.throws(() => importAll(text.replace(`"rooms":${Object.keys(rooms).length}`, `"rooms":${Object.keys(rooms).length + 1}`)), /count mismatch/);
  const rows = text.trimEnd().split("\n");
  assert.throws(() => importAll([...rows, rows[1]].join("\n")), /duplicate room/);
  assert.throws(() => importAll("{}\n"), /not an ae\/room-directory-state/);
  assert.throws(() => importAll(rows[0] + "\n" + JSON.stringify({ type: "other" })), /unknown line type/);
  const bad = { ...rooms[first], names: [1] } as never;
  const crafted = [rows[0], JSON.stringify({ type: "room", id: first, entry: bad, sha256: digest(bad) })].join("\n").replace(/"rooms":\d+/, '"rooms":1');
  assert.throws(() => importAll(crafted), /names must be strings/);
  const changed: Rooms = { ...rooms, [first]: { ...rooms[first], playerCount: rooms[first].playerCount + 1 } };
  assert.equal(verify(rooms, changed).checksums, false);
  const { [first]: _gone, ...rest } = rooms;
  assert.equal(verify(rooms, rest).counts, false);
});
