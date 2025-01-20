import { cache } from './cache'

export default class utils {
    // cache key
    cache() {
        return "utils"
    }

    @cache("partsCost", 1000)
    static partsCost(parts: BodyPartConstant[]): number {
        return parts.reduce((num, part) => num + BODYPART_COST[part], 0)
    }

    @cache("createBody", 1000)
    static createBody(parts: BodyPartConstant[], energyAvailable: number): BodyPartConstant[] {
        let parts_cost = this.partsCost(parts)

        // use as much as energyAvailable as possible by doubling the body parts until we reach the energyAvailable
        while (parts_cost <= energyAvailable) {
            if (parts_cost + this.partsCost(parts) > energyAvailable) {
                return parts
            }

            parts = parts.concat(parts)
            parts_cost += parts_cost
        }

        // if we have more than energyAvailable, remove the last part
        if (parts_cost > energyAvailable) {
            parts.pop()
        }

        return parts
    }

    @cache("walkablePositions", 1000)
    static walkablePositions(target: RoomPosition, dist = 1): number {
        if (!target || !target.roomName || !Game.rooms[target.roomName]) return 0

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

    @cache("findClosestByPath")
    static findClosestByPath<T extends _HasId & _HasRoomPosition>(creep: Creep, targets: T[]): T | null {
        return creep.pos.findClosestByPath(targets)
    }

    // Overload signatures
    static getRangeTo(pos1: RoomPosition, pos2: RoomPosition): number
    static getRangeTo(x1: number, y1: number, x2: number, y2: number): number

    // Method implementation with the decorator
    @cache("getRangeTo", 100)
    static getRangeTo(
        arg1: RoomPosition | number,
        arg2: RoomPosition | number,
        arg3?: number,
        arg4?: number
    ): number {
        if (arg1 instanceof RoomPosition && arg2 instanceof RoomPosition) {
            // Overload for RoomPosition arguments
            return Math.max(
                Math.abs(arg1.x - arg2.x),
                Math.abs(arg1.y - arg2.y)
            )
        } else if (
            typeof arg1 === "number" &&
            typeof arg2 === "number" &&
            typeof arg3 === "number" &&
            typeof arg4 === "number"
        ) {
            // Overload for x1, y1, x2, y2 arguments
            return Math.max(
                Math.abs(arg1 - arg3),
                Math.abs(arg2 - arg4)
            )
        } else {
            throw new Error("Invalid arguments passed to getRangeTo")
        }
    }

    @cache("isNearTo", 100)
    static isNearTo(pos1: RoomPosition, pos2: RoomPosition): boolean {
        return this.getRangeTo(pos1, pos2) <= 1
    }
}
