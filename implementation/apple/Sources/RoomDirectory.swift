import Foundation

// One room as the home list shows it.
struct RoomInfo: Decodable, Identifiable, Equatable {
    let id: String
    let status: String
    let playerCount: Int
    let names: [String]
    var code: String? = nil

    // What the home list compares, to tell whether it changed.
    var summary: String { "\(id)|\(status)|\(playerCount)|\(names.joined(separator: ","))" }
}

struct RoomsMessage: Decodable {
    let type: String
    let rooms: [RoomInfo]?
}

enum EntryAction: Equatable { case join, rejoin, watch, full, none }

enum RoomKind: Equatable { case empty, inGame, lobby }

enum RoomDirectory {
    static let defaultOpenStatuses: Set<String> = ["lobby"]

    static func listingChanged(_ previous: [RoomInfo]?, _ next: [RoomInfo]) -> Bool {
        guard let previous else { return true }
        return previous.map(\.summary) != next.map(\.summary)
    }

    // Enter the room: sit down, rejoin, or watch a game under way; full while no seat is free.
    static func entryAction(_ room: RoomInfo?, myName: String, capacity: Int, openStatuses: Set<String> = defaultOpenStatuses) -> EntryAction {
        guard let room else { return .none }
        let inGame = !openStatuses.contains(room.status)
        if room.names.contains(myName) { return .rejoin }
        if !inGame && room.playerCount >= capacity { return .full }
        return inGame ? .watch : .join
    }

    static func describe(_ room: RoomInfo, openStatuses: Set<String> = defaultOpenStatuses) -> RoomKind {
        room.playerCount == 0 ? .empty : openStatuses.contains(room.status) ? .lobby : .inGame
    }

    // Codes are typed by people: case, spaces and hyphens do not matter.
    static func normaliseCode(_ code: String) -> String {
        code.uppercased().filter { !$0.isWhitespace && $0 != "-" }
    }

    static func findByCode(_ rooms: [RoomInfo], _ code: String) -> RoomInfo? {
        let wanted = normaliseCode(code)
        if wanted.isEmpty { return nil }
        return rooms.first { $0.code.map(normaliseCode) == wanted }
    }
}
