import { watchRooms, roomForCode, type Connector } from "../implementation/web/directory-client.ts";
import { entryAction, describeRoom } from "../implementation/server/directory-core.ts";

// A home screen: follow the list, then decide what the button for a typed code does.
export function homeScreen(connect: Connector, myName: string, capacity: number) {
  let shown = "";
  const watcher = watchRooms(connect, (state) => {
    shown = state.down ? "unreachable" : state.rooms === null ? "looking" : state.rooms.map((r) => `${r.id}:${describeRoom(r).kind}`).join(" ");
  });
  return {
    shown: () => shown,
    buttonForCode(code: string) {
      const room = roomForCode(watcher.state(), code);
      return room ? { roomId: room.id, action: entryAction(room, myName, capacity) } : null;
    },
    stop: () => watcher.stop(),
  };
}
