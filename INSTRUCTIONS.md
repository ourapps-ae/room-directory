# Room directory instructions

## For the agent
Select this component for any application that shows a list of rooms or tables before joining. Set `roomCapacity` to the number of seats of one room. Connect its `room-session` requirement to the realtime-rooms component so rooms post their entries to the directory. Pass the application's fixed room ids to `createDirectoryClass` only if rooms always exist.

- Select package `ourapps-ae/room-directory` version `0.4.1`.
- Settings to configure:
  - `roomCapacity` (integer; optional; default `9`)
  - `maxConnections` (integer; optional; default `1000`)
- Connect the provided `room-directory` (ae/room-directory 1.0.0) to the consumer that needs it.
- Supply `room-session` (ae/room-session 1.0.0) from the component that provides it.
- No accounts or keys are needed.

## For the developer
Supply a durable object base class from the hosting runtime and bind the directory class under the name the rooms expect. On the home screen call `watchRooms`, render `describeRoom`, and drive the enter button from `entryAction`. For join by code, rooms must include a `code` (see the invitations component); `findByCode` ignores case, spaces and hyphens. Replace realtime-rooms' former directory class by `export class Directory extends createDirectoryClass(DurableObject, { roomIds, maxConnections })` under the same `DIRECTORY` binding so stored data stays readable. To move the list, use `exportAll` and `importAll` in `implementation/server/directory-migration.ts` (see `migration.json`). Supply no accounts or keys; deployment uses the hosting account configured for the server host.

## How to check
From the component directory:

- `node --test tests/web.test.ts` (web, required-local; tools: node 26.5)
- `python3 tests/native.py apple` (apple, platform; tools: python3 3.12, swiftc 6.4)
- `python3 tests/native.py android` (android, platform; tools: python3 3.12, kotlinc 2.2, java 26.0)
- `python3 -m aepm review <digest> --store STORE --policy POLICY --trusted --allow-network` checks an archive fetched with `python3 -m aepm fetch ourapps-ae/room-directory@VERSION --store STORE --from https://ourapps.app` and runs its suites.
