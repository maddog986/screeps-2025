import cache from './cache'

export enum ROOMTYPE {
    SOURCEKEEPER = 'SK',
    CORE = 'CORE',
    CONTROLLER = 'CTRL',
    ALLEY = 'ALLEY'
}

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

    // Helper function: Check if a position is walkable
    static isWalkable(room: Room, x: number, y: number): boolean {
        return !room
            .lookAt(x, y)
            .some(({ type, terrain, constructionSite }) => type === "structure" || (type === "constructionSite" && constructionSite!.structureType !== 'road') || (type === "terrain" && terrain === "wall"))
    }

    // const neighbors = utils.getNeighbors(x, y, 1)
    // neighbors.forEach(([dx, dy]) => {
    //     if (roads.some(({ x: nx, y: ny }) => nx === dx && ny === dy)) {
    //         room.visual.line(dx, dy, x, y, { color: "#666", opacity: 0.25, width: 0.45 })
    //     }
    // })

    // • • •
    // • x •
    // • • •

    static getNeighbors(x: number, y: number, distance: number = 1): [number, number][] {
        const neighbors: [number, number][] = []
        for (let dx = -distance; dx <= distance; dx++) {
            for (let dy = -distance; dy <= distance; dy++) {
                // filter out of bounds
                if (x + dx < 0 || x + dx > 49 || y + dy < 0 || y + dy > 49) continue
                if (dx === 0 && dy === 0) continue // Skip the center point
                neighbors.push([x + dx, y + dy])
            }
        }
        return neighbors
    }

    //   •
    // • x •
    //   •
    static getOrthogonalNeighbors(x: number, y: number, distance: number = 1): [number, number][] {
        const neighbors: [number, number][] = []
        for (let i = 1; i <= distance; i++) {
            neighbors.push([x + i, y], [x - i, y], [x, y + i], [x, y - i])
        }
        return neighbors
    }

    static getGridNeighbors(x: number, y: number, distance: number = 1): [number, number][] {
        const neighbors: [number, number][] = []
        for (let dx = -distance; dx <= distance; dx++) {
            for (let dy = -distance; dy <= distance; dy++) {
                const nx = x + dx
                const ny = y + dy
                // Ensure coordinates are within the Screeps map boundaries
                if (nx >= 0 && nx <= 49 && ny >= 0 && ny <= 49) {
                    neighbors.push([nx, ny])
                }
            }
        }
        return neighbors
    }

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

    @cache("inRangeTo", 100)
    static inRangeTo(pos1: RoomPosition, pos2: RoomPosition, range: number): boolean {
        return this.getRangeTo(pos1, pos2) <= range
    }

    @cache("findOptimalPosition", 100)
    static findOptimalPosition(room: Room, position: RoomPosition, range: number = 1): RoomPosition | undefined {
        const adjacentPositions: RoomPosition[] = []

        // Get all adjacent positions within range
        this.getNeighbors(position.x, position.y, range).forEach(([x, y]) => {
            if (
                room.lookAt(x, y).some(
                    ({ type, terrain }) =>
                        type === "structure" ||
                        type === "constructionSite" ||
                        (type === "terrain" && terrain === "wall")
                )
            )
                return

            adjacentPositions.push(new RoomPosition(x, y, room.name))
        })

        // Evaluate each position for visibility to all walkable tiles around the source
        const optimalPosition = adjacentPositions
            .map((pos) => ({
                pos,
                visibleTiles: this.getNeighbors(pos.x, pos.y, 1).filter(
                    ([nx, ny]) =>
                        this.isWalkable(room, nx, ny) &&
                        this.isNearTo(position, new RoomPosition(nx, ny, pos.roomName))
                ).length,
            }))
            // Sort by number of visible tiles and fall back to distance from source if needed
            .sort((a, b) => b.visibleTiles - a.visibleTiles || this.getRangeTo(position, a.pos) - this.getRangeTo(position, b.pos))
            .shift() // Take the position with the most visible tiles

        return optimalPosition?.pos // Return the optimal position or undefined if none found
    }

    static positionToObject(pos: RoomPosition): { x: number, y: number, roomName: string } {
        return { x: pos.x, y: pos.y, roomName: pos.roomName }
    }

    static objectToPosition(obj: { x: number, y: number, roomName: string }): RoomPosition {
        return new RoomPosition(obj.x, obj.y, obj.roomName)
    }

    static pathToDirections(path: RoomPosition[]): DirectionConstant[] {
        const directions: DirectionConstant[] = []

        for (let i = 0; i < path.length - 1; i++) {
            const currentPos = path[i]
            const nextPos = path[i + 1]
            const direction = currentPos.getDirectionTo(nextPos)
            directions.push(direction as DirectionConstant)
        }

        return directions
    }

    static directionsToPath(startPos: RoomPosition, directions: DirectionConstant[]): RoomPosition[] {
        const path: RoomPosition[] = [startPos] // Start with the initial position

        let currentPos = startPos

        for (const direction of directions) {
            if (currentPos.x <= 0 || currentPos.x >= 49 || currentPos.y <= 0 || currentPos.y >= 49) {
                break
            }

            const nextPos = this.getNextPosition(currentPos, direction)
            path.push(nextPos)
            currentPos = nextPos
        }

        return path
    }

    static getNextPosition(pos: RoomPosition, direction: DirectionConstant): RoomPosition {
        const directionOffsets = {
            [TOP]: [0, -1],
            [TOP_RIGHT]: [1, -1],
            [RIGHT]: [1, 0],
            [BOTTOM_RIGHT]: [1, 1],
            [BOTTOM]: [0, 1],
            [BOTTOM_LEFT]: [-1, 1],
            [LEFT]: [-1, 0],
            [TOP_LEFT]: [-1, -1]
        }

        const [dx, dy] = directionOffsets[direction]
        return new RoomPosition(pos.x + dx, pos.y + dy, pos.roomName)
    }

    static reverseDirection(direction: DirectionConstant): DirectionConstant {
        return ((direction + 4 - 1) % 8) + 1 as DirectionConstant
    }

    static getRandomAdjacentDirection(direction: DirectionConstant): DirectionConstant {
        // Array of relative offsets for adjacent directions
        const adjacentOffsets = [-1, 0, 1]

        // Randomly pick an offset
        const randomOffset = adjacentOffsets[Math.floor(Math.random() * adjacentOffsets.length)]

        // Calculate the new direction
        const newDirection = ((direction + randomOffset - 1 + 8) % 8) + 1 as DirectionConstant

        return newDirection
    };

    static randomDirection(): DirectionConstant {
        // directions to use when searching for room exists
        const directions = [FIND_EXIT_TOP, FIND_EXIT_RIGHT, FIND_EXIT_BOTTOM, FIND_EXIT_LEFT]
        const values = Object.values(directions)
        return values[Math.floor(values.length * Math.random())]
    }









    // static getNextScoutRoom(origin: string): string | null {
    //     const radius = 3 // Define search radius
    //     const SCOUT_EXPIRATION = 150 // Adjust based on priority

    //     const nearbyRooms = this.getRoomsInRadius(origin, radius)

    //     const staleRooms = nearbyRooms.filter(room =>
    //         !Memory.rooms?.[room]?.last_seen ||
    //         (Game.time - Memory.rooms[room].last_seen) > SCOUT_EXPIRATION
    //     )

    //     const validRooms = staleRooms.filter(room =>
    //         !this.isDangerousRoom(room) &&
    //         !this.hasInvaderCore(room)
    //     )

    //     return validRooms.length > 0 ? validRooms[0] : null
    // }

    // static getRoomName(x: number, y: number): string {
    //     const ew = x < 0 ? `W${Math.abs(x)}` : `E${x}`
    //     const ns = y < 0 ? `S${Math.abs(y)}` : `N${y}`
    //     return `${ew}${ns}`
    // }

    // static getRoomsInRadius(origin: string, radius: number): string[] {
    //     const originCoords = this.getRoomCoordinates(origin)
    //     if (!originCoords) return []

    //     const rooms: string[] = []

    //     for (let dx = -radius; dx <= radius; dx++) {
    //         for (let dy = -radius; dy <= radius; dy++) {
    //             if (dx === 0 && dy === 0) continue
    //             const newRoom = this.getRoomName(originCoords.x + dx, originCoords.y + dy)
    //             if (newRoom) rooms.push(newRoom)
    //         }
    //     }
    //     return rooms
    // }

    // // Avoid dangerous rooms (Source Keeper & Core rooms)
    // static isDangerousRoom(roomName: string): boolean {
    //     const type = this.roomType(roomName)
    //     return type === ROOMTYPE.SOURCEKEEPER || type === ROOMTYPE.CORE
    // }

    // // Check for Invader Cores in a room
    // static hasInvaderCore(roomName: string): boolean {
    //     const room = Game.rooms[roomName]
    //     if (!room) return false

    //     return room.find(FIND_HOSTILE_STRUCTURES, {
    //         filter: (s) => s.structureType === STRUCTURE_INVADER_CORE
    //     }).length > 0
    // }

    // static getRoomCoordinates(roomName: string) {
    //     const coordinateRegex = /(E|W)(\d+)(N|S)(\d+)/g
    //     const match = coordinateRegex.exec(roomName)
    //     if (!match) return

    //     return {
    //         x: Number(match[2]),
    //         y: Number(match[4]),
    //         xDir: match[1],
    //         yDir: match[3],
    //     }
    // }

    // static roomType(roomName: string) {
    //     const coords = this.getRoomCoordinates(roomName)
    //     if (!coords) return ROOMTYPE.ALLEY

    //     if (coords.x % 10 === 0 || coords.y % 10 === 0) {
    //         return ROOMTYPE.ALLEY
    //     } else if (coords.x % 10 != 0 && coords.x % 5 === 0 && coords.y % 10 != 0 && coords.y % 5 === 0) {
    //         return ROOMTYPE.CORE
    //     } else if (coords.x % 10 <= 6 && coords.x % 10 >= 4 && coords.y % 10 <= 6 && coords.y % 10 >= 4) {
    //         return ROOMTYPE.SOURCEKEEPER
    //     } else {
    //         return ROOMTYPE.CONTROLLER
    //     }
    // }
}
