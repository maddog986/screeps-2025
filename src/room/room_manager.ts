import RoomBuilder from './room_builder'

declare global {
    interface Room {
        _manager?: RoomManager
        manager: RoomManager
    }
}

// extend Room prototype
Object.defineProperty(Room.prototype, 'manager', {
    get: function (): RoomManager {
        if (!this._manager) {
            this._manager = new RoomManager(this)
        }
        return this._manager
    },
})

export default class RoomManager extends RoomBuilder {
    constructor(room: Room) {
        super(room)

        this.log(`**RoomManager** context keys:`, this.contextKeys())
    }
}
