# Room directory component

## Purpose and facilities
`room-directory` keeps one summary of every room (id, status, player count, names, optional join code), tells every watching home screen the whole list again after each change, and answers what the enter button should do (join, rejoin, watch, full) and which room a typed code names. The server part is a directory object class built on an injected runtime base class; the client parts are a list watcher for web and pure list logic for Apple and Android.

Facilities: `room-directory` (Room list, live change announcements and join by code).

## User inputs
Two settings. `roomCapacity` is the number of seats after which an open room shows as full (default 9). `maxConnections` caps the watching connections the directory accepts (default 1000, the recipe's large band; the recipe may lower it from the scale answer).

- `roomCapacity` (integer; optional; default `9`)
- `maxConnections` (integer; optional; default `1000`)

## Artefacts and dependencies
`component.json` maps every `implementation/` source into `components/room-directory/`:

- `implementation/android/src/main/java/ae/directory/RoomDirectory.kt` -> `components/room-directory/android/src/main/java/ae/directory/RoomDirectory.kt`
- `implementation/apple/Sources/RoomDirectory.swift` -> `components/room-directory/apple/Sources/RoomDirectory.swift`
- `implementation/server/directory-core.ts` -> `components/room-directory/server/directory-core.ts`
- `implementation/server/directory.ts` -> `components/room-directory/server/directory.ts`
- `implementation/web/directory-client.ts` -> `components/room-directory/web/directory-client.ts`

Dependencies: none.
`tools.lock.json` pins verification tools: node 26.5.0, python3 3.12.8, swiftc 6.4.2, kotlinc 2.2.0, java 26.0.1. Licence wording remains deferred.

## Provided interfaces
- `room-directory` (ae/room-directory) version 1.0.0 is described by three documents: `interfaces/room-directory.json` (OpenRPC 1.3.2) for the library calls, tagged with the languages that provide them (`typescript`, `swift`, `kotlin`); `interfaces/room-directory-http.json` (OpenAPI 3.1.1) for the requests the Directory object answers; `interfaces/room-directory-live.json` (AsyncAPI 3.1.0) for its live `{type:"rooms"}` list. Types are JSON Schema 2020-12.
- `interfaces/room-directory-state.schema.json` is the JSON Schema 2020-12 document (ae/room-directory-state 1.0.0) of the stored list and its ndjson export lines.

## Required interfaces
- `room-session` (ae/room-session) version 1.0.0, supplied by the recipe or application; `interfaces/required-room-session.json` is a copy of the providing component's interface document.

## Integration
Server: `createDirectoryClass(DurableObjectBase, { roomIds, maxConnections })` returns the directory class; rooms announce themselves with `POST` (upsert) and `DELETE ?id=`. The application can pass `roomIds` for rooms that always exist; each is asked directly the first time it is missing. Web: `watchRooms(connect, onChange)` takes a connector with the shape of the realtime-rooms `Live` class and reports only changed lists and changes of server reachability. Apple and Android: decode the `{type:"rooms"}` message into `RoomInfo` and use `RoomDirectory.entryAction`, `describe`, `findByCode`. `examples/consumer.ts` runs a home screen without the game. The component expects the room-session component to supply the rooms that post their entries and the `/room` summary route used to ask a missing room; it imports nothing from it.

## Visual definition and connected examples
`visual/definition.json` maps its ports to the provided and required interfaces. `visual/examples/connected.json` connects the component to an illustrative application consumer. Both image formats and a text description are in `visual/output/`.

## Infrastructure
The directory object needs a hosting runtime that provides a durable object with storage and WebSocket acceptance (Cloudflare Workers in the recipe). Local tests use fakes and no accounts. Cost and capacity are unmeasured.

## Verification
Required-local: `node --test tests/web.test.ts` checks list operations, join by code, entry actions, change detection, the directory object with fake storage and sockets (list, update, announce, remove, restart, upgrade and cap checks, deploy restart), the web watcher and the example. Platform: `python3 tests/native.py apple` compiles and runs the Swift checks against `tests/fixtures/rooms.json`; `python3 tests/native.py android` compiles the Kotlin checks (needs kotlinc, not installed on the authoring machine, so not run there).

- `node --test tests/web.test.ts` (web, required-local; tools: node 26.5.0)
- `python3 tests/native.py apple` (apple, platform; tools: python3 3.12.8, swiftc 6.4.2)
- `python3 tests/native.py android` (android, platform; tools: python3 3.12.8, kotlinc 2.2.0, java 26.0.1)

## Scenarios and presentation
A home screen shows three rooms; the second is mid-game so its button says watch; a person types a code with spaces and lower case and the right room is selected; the server restarts and the list is restored from storage; the connection drops and the screen says the server cannot be reached until the next list arrives.

## Updates and removal
Patch updates replace files. `migration.json` describes store `rooms` (schema `interfaces/room-directory-state.schema.json`, ndjson export and import in `implementation/server/directory-migration.ts`, tested). The stored map is under key `rooms` in the object named `home`; an application binds `DIRECTORY` to this component's class under the class name `Directory`. The stored room list is a rebuildable summary: removal can delete it with no loss.
