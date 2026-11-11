# Source mapping

Reference revision: `19905b75dbea89fbfd424d67fe26c81aaed0e018`. Paths below are under the `recipe/` folder of `ourapps-ae/OurPoker` unless they name another `ourapps-ae` component.

## Files

- `implementation/server/directory.ts` <- `implementation/server/directory.ts` in `ourapps-ae/realtime-rooms` lines 1-64 (`createDirectoryClass`), which `server/src/directory.ts` lines 1-3 wraps with the fixed room ids.
  - Generalised: the runtime base class is injected instead of imported from `cloudflare:workers`; `ROOM_IDS` becomes the optional `roomIds` option; `MAX_SOCKETS` 200 becomes the `maxConnections` option; the room-asking call and the WebSocket acceptance are replaceable (`askRoom`, `accept`) with the original behaviour as defaults; `DELETE ?id=` is added so open rooms can be removed; the list is ordered by `listRooms`.
  - Kept: all missing rooms are asked in parallel, then merged into the list and saved once.
  - Left behind: nothing of the poker application.
- `implementation/server/directory-core.ts` <-
  - `listRooms` order rule: `implementation/server/directory.ts` in `ourapps-ae/realtime-rooms` lines 52-63; `upsertRoom` line 37; `announcement` lines 39 and 32.
  - `listingChanged`, `summary`: `web/src/store.ts` lines 126-130 (whole-list comparison) and `ios/OurPoker/Sources/Model.swift` lines 215-222 (`summary`).
  - `entryAction`: `web/src/screens.ts` lines 86-92, `ios/OurPoker/Sources/HomeScreen.swift` lines 112-117, `android/app/src/main/java/app/ourapps/ourpoker/ui/HomeScreen.kt` lines 175-179; the fixed 9 becomes the `capacity` argument and the lobby status becomes `openStatuses`.
  - `describeRoom`: `web/src/screens.ts` line 62, `HomeScreen.swift` lines 87-92, `HomeScreen.kt` lines 150-168.
  - `removeRoom`, `findByCode`, `normaliseCode`, the `openOnly` filter and the optional `code` field: new (`generated-platform`); the recipe has no join-by-code, only fixed rooms chosen from a list.
- `implementation/web/directory-client.ts` <- `web/src/store.ts` lines 122-136 (`watchRooms`: reports a changed list or a change of reachability), using the connection shape of `implementation/web/live.ts` in `ourapps-ae/realtime-rooms`. Generalised: the connection is an injected connector, state is returned as `{rooms, down}`; `sleep`/`wake` come from `store.ts` lines 254-261. `roomForCode`: new.
- `implementation/apple/Sources/RoomDirectory.swift` <- `ios/OurPoker/Sources/Model.swift` lines 215-222 (`RoomInfo`), `LiveMessage.swift` lines 1-8, `HomeScreen.swift` lines 81-139, `TableModel.swift` lines 159-172. Generalised: status is a string, capacity and open statuses are arguments. The screens, the live connection and the room preview theme stay in the application.
- `implementation/android/src/main/java/ae/directory/RoomDirectory.kt` <- `android/app/src/main/java/app/ourapps/ourpoker/net/Model.kt` lines 153-156, `TableViewModel.kt` lines 106-135, `ui/HomeScreen.kt` lines 150-182. Same generalisation as Apple; no serialisation annotations (the application decodes). Not compiled on the authoring machine (no kotlinc).

## Left behind in the recipe

- Room names and previews (`roomName`, `themeFor`), the home screen layout, the language button, update prompts and guides.
- The lobby screen of one room (`lobbyScreen` in `web/src/screens.ts` lines 113-140, `LobbyScreen.swift`, `LobbyScreen.kt`) lists the players of one room, not the rooms; it belongs to seating and the recipe.
- The directory wire path `/rooms/ws` and the `/room` summary route belong to realtime-rooms routing.

- `implementation/server/directory-migration.ts` and `interfaces/room-directory-state.schema.json` have no recipe counterpart; the `maxConnections` default is 1000.

## Note for realtime-rooms

This component's `directory.ts` is the only directory class. realtime-rooms' `RoomInfo` type (`adapter.ts` line 5) matches `RoomEntry` here apart from the optional `code`.
