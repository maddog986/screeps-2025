import { cache } from './cache'

export const walkablePositions = (target: _HasId & _HasRoomPosition & { room: Room }, dist = 1): number => {
    const { id } = target

    if (!cache.walkablePositions[id])
        cache.walkablePositions[id] = {}

    if (!cache.walkablePositions[id][dist]) {
        cache.walkablePositions[id][dist] = target.room
            .lookAtArea(target.pos.y - dist, target.pos.x - dist, target.pos.y + dist, target.pos.x + dist, true)
            .filter(
                a =>
                    ["plain", "swamp"].includes(a.terrain || "wall") &&
                    (target.pos.y + dist === a.y ||
                        target.pos.y - dist === a.y ||
                        target.pos.x + dist === a.x ||
                        target.pos.x - dist === a.x)
            ).length
    }

    return cache.walkablePositions[id][dist]
}
