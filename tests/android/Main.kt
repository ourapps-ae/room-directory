import ae.directory.EntryAction
import ae.directory.RoomInfo
import ae.directory.RoomKind
import ae.directory.describeRoom
import ae.directory.entryAction
import ae.directory.findByCode
import ae.directory.listingChanged

// The same cases as tests/fixtures/rooms.json, written out so no JSON library is needed.
fun main() {
    val rooms = listOf(
        RoomInfo("casino", "lobby", 0, listOf()),
        RoomInfo("home", "running", 2, listOf("Ann", "Bob"), "KT7-Q2P"),
        RoomInfo("garden", "lobby", 3, listOf("Cy", "Di", "Ed"), "M4NW9X"),
        RoomInfo("shed", "lobby", 1, listOf("Flo")),
    )
    fun room(id: String) = rooms.first { it.id == id }
    check(entryAction(room("casino"), "Zed", 3) == EntryAction.JOIN)
    check(entryAction(room("home"), "Zed", 3) == EntryAction.WATCH)
    check(entryAction(room("home"), "Ann", 3) == EntryAction.REJOIN)
    check(entryAction(room("garden"), "Zed", 3) == EntryAction.FULL)
    check(entryAction(room("garden"), "Di", 3) == EntryAction.REJOIN)
    check(entryAction(room("shed"), "Zed", 3) == EntryAction.JOIN)
    check(entryAction(null, "Zed", 3) == EntryAction.NONE)
    check(describeRoom(room("casino")) == RoomKind.EMPTY)
    check(describeRoom(room("home")) == RoomKind.IN_GAME)
    check(describeRoom(room("shed")) == RoomKind.LOBBY)
    check(findByCode(rooms, "kt7q2p")?.id == "home")
    check(findByCode(rooms, " kt7 - q2p ")?.id == "home")
    check(findByCode(rooms, "m4nw9x")?.id == "garden")
    check(findByCode(rooms, "") == null)
    check(findByCode(rooms, "nope") == null)
    check(findByCode(rooms, "---") == null)
    check(listingChanged(null, rooms))
    check(!listingChanged(rooms, rooms))
    check(listingChanged(rooms, rooms.map { if (it.id == "casino") it.copy(playerCount = 1, names = listOf("Zed")) else it }))
    println("19 directory assertions passed")
}
