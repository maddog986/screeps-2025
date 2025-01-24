import cache from './cache'

export default class utils {
    @cache("walkablePositions", 1000)
    static walkablePositions(target: RoomPosition, dist = 1): number {
        if (!target || !target.roomName || !Game.rooms[target.roomName]) return 0

        // TODO: verify room is valid
        return Game.rooms[target.roomName]
            .lookAtArea(target.y - dist, target.x - dist, target.y + dist, target.x + dist, true)
            .filter(a =>
                ["plain", "swamp"].includes(a.terrain || "wall") &&
                (target.y + dist === a.y ||
                    target.y - dist === a.y ||
                    target.x + dist === a.x ||
                    target.x - dist === a.x)
            )
            .length
    }
}
