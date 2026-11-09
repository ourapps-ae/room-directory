import Foundation

struct Fixture: Decodable {
    let capacity: Int
    let rooms: [RoomInfo]
    let entry: [[String]]
    let describe: [[String]]
    let codes: [[String?]]
}

func check(_ condition: Bool, _ message: String) {
    if !condition { FileHandle.standardError.write(Data("FAILED: \(message)\n".utf8)); exit(1) }
}

let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: URL(fileURLWithPath: "tests/fixtures/rooms.json")))
func room(_ id: String) -> RoomInfo { fixture.rooms.first { $0.id == id }! }
let words: [String: EntryAction] = ["join": .join, "rejoin": .rejoin, "watch": .watch, "full": .full, "none": .none]
let kinds: [String: RoomKind] = ["empty": .empty, "inGame": .inGame, "lobby": .lobby]
var count = 0

for row in fixture.entry {
    check(RoomDirectory.entryAction(room(row[0]), myName: row[1], capacity: fixture.capacity) == words[row[2]]!, "entry \(row)")
    count += 1
}
check(RoomDirectory.entryAction(nil, myName: "Zed", capacity: 3) == .none, "no room")
for row in fixture.describe {
    check(RoomDirectory.describe(room(row[0])) == kinds[row[1]]!, "describe \(row)")
    count += 1
}
for row in fixture.codes {
    check(RoomDirectory.findByCode(fixture.rooms, row[0]!)?.id == row[1], "code \(row)")
    count += 1
}
check(RoomDirectory.listingChanged(nil, fixture.rooms), "first list is a change")
check(!RoomDirectory.listingChanged(fixture.rooms, fixture.rooms), "same list is no change")
var joined = fixture.rooms
joined[0] = RoomInfo(id: "casino", status: "lobby", playerCount: 1, names: ["Zed"])
check(RoomDirectory.listingChanged(fixture.rooms, joined), "a joiner is a change")
print("\(count + 3) directory assertions passed")
