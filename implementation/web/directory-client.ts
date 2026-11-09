// The home list of rooms, live while a home screen shows. Only a changed list is reported, so a
// tap is not lost to a rebuilt button; a connection that cannot be made says the server is down.
import { findByCode, listingChanged, type RoomEntry } from "../server/directory-core.ts";

export type LiveMessage = { type: string; [key: string]: unknown };
export type LiveHandle = { open(): void; close(): void };
// Same shape as the Live class of realtime-rooms: (path, hello, onMessage, onDown) -> connection.
export type Connector = (path: string, hello: () => string | null, onMessage: (message: LiveMessage) => void, onDown: (down: boolean) => void) => LiveHandle;
export type RoomWatch = { rooms: RoomEntry[] | null; down: boolean };
export type RoomWatcher = {
  state(): RoomWatch;
  // Hidden tab: close the connection. Shown again: reconnect.
  sleep(): void;
  wake(): void;
  stop(): void;
};

export function watchRooms(connect: Connector, onChange: (state: RoomWatch) => void, path = "/rooms/ws"): RoomWatcher {
  let state: RoomWatch = { rooms: null, down: false };
  const set = (patch: Partial<RoomWatch>) => { state = { ...state, ...patch }; onChange(state); };
  const handle = connect(path, () => null, (message) => {
    if (message.type !== "rooms" || !Array.isArray(message.rooms)) return;
    const rooms = message.rooms as RoomEntry[];
    if (listingChanged(state.rooms, rooms) || state.down) set({ rooms, down: false });
  }, (down) => { if (down !== state.down) set({ down }); });
  handle.open();
  return { state: () => state, sleep: () => handle.close(), wake: () => handle.open(), stop: () => handle.close() };
}

// Join by a code a person typed: the room it names, or null.
export function roomForCode(watch: RoomWatch, code: string): RoomEntry | null {
  return watch.rooms ? findByCode(watch.rooms, code) : null;
}
