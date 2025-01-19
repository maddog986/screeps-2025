import { cache } from './cache'

export const partsCost = function (parts: BodyPartConstant[]): number {
    return parts.reduce((num, part) => num + BODYPART_COST[part], 0)
}

export const createBody = function (parts: BodyPartConstant[], energyAvailable: number): BodyPartConstant[] {
    let parts_cost = partsCost(parts)

    // use as much as energyAvailable as possible by doubling the body parts until we reach the energyAvailable
    while (parts_cost <= energyAvailable) {
        if (parts_cost + partsCost(parts) > energyAvailable) {
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

export const walkablePositions = (target: _HasId & _HasRoomPosition & { room: Room }, dist = 1): number => {
    if (!target || !target.room) return 0

    return cache.getItem(`wp_${target.room.name}_${target.pos.x}_${target.pos.y}_${dist}`, -1, () => {
        return target.room
            .lookAtArea(target.pos.y - dist, target.pos.x - dist, target.pos.y + dist, target.pos.x + dist, true)
            .filter(
                a =>
                    ["plain", "swamp"].includes(a.terrain || "wall") &&
                    (target.pos.y + dist === a.y ||
                        target.pos.y - dist === a.y ||
                        target.pos.x + dist === a.x ||
                        target.pos.x - dist === a.x)
            ).length
    })
}

export function createEnumFromKeys<T extends Record<string, any>>(obj: T): { [K in keyof T]: K } {
    const enumObj: any = {}
    for (const key of Object.keys(obj)) {
        enumObj[key] = key
    }
    return enumObj
}
