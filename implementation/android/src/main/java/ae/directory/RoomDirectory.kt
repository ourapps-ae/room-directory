package ae.directory

// One room as the home list shows it; the application decodes it from the directory's JSON.
data class RoomInfo(val id: String, val status: String, val playerCount: Int, val names: List<String>, val code: String? = null) {
    // What the home list compares, to tell whether it changed.
    val summary: String get() = "$id|$status|$playerCount|${names.joinToString(",")}"
}

enum class EntryAction { JOIN, REJOIN, WATCH, FULL, NONE }

enum class RoomKind { EMPTY, IN_GAME, LOBBY }

val defaultOpenStatuses: Set<String> = setOf("lobby")

fun listingChanged(previous: List<RoomInfo>?, next: List<RoomInfo>): Boolean =
    previous == null || previous.map { it.summary } != next.map { it.summary }

// Enter the room: sit down, rejoin, or watch a game under way; full while no seat is free.
fun entryAction(room: RoomInfo?, myName: String, capacity: Int, openStatuses: Set<String> = defaultOpenStatuses): EntryAction {
    if (room == null) return EntryAction.NONE
    val inGame = room.status !in openStatuses
    if (myName in room.names) return EntryAction.REJOIN
    if (!inGame && room.playerCount >= capacity) return EntryAction.FULL
    return if (inGame) EntryAction.WATCH else EntryAction.JOIN
}

fun describeRoom(room: RoomInfo, openStatuses: Set<String> = defaultOpenStatuses): RoomKind =
    if (room.playerCount == 0) RoomKind.EMPTY else if (room.status in openStatuses) RoomKind.LOBBY else RoomKind.IN_GAME

// Codes are typed by people: case, spaces and hyphens do not matter.
fun normaliseCode(code: String): String = code.uppercase().filter { !it.isWhitespace() && it != '-' }

fun findByCode(rooms: List<RoomInfo>, code: String): RoomInfo? {
    val wanted = normaliseCode(code)
    if (wanted.isEmpty()) return null
    return rooms.firstOrNull { it.code?.let(::normaliseCode) == wanted }
}
