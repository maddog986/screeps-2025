import RoomBuilder from 'room/room_builder'

export default class RoomManager extends RoomBuilder {
    constructor(room: Room) {
        super(room)

        this.log(`**RoomManager** context keys:`, this.context.keys())
    }
}
