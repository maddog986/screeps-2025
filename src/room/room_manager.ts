import RoomMatrix from 'room/room_matrix'

export default class RoomManager extends RoomMatrix {
    constructor(room: Room) {
        super(room)

        this.log(`**RoomManager** context keys:`, this.contextKeys())
    }
}
