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

    // static findPath(creep: Creep, target: RoomPosition, options: TravelerOptions = {}): string {
    //     const { range = 1, ignoreCreeps = false } = options
    //     return creep.room.findPath(creep.pos, target, {
    //         range,
    //         ignoreCreeps,
    //         ignoreRoads: true,
    //         maxRooms: 1,
    //         maxOps: 1000,
    //         costCallback: (roomName, costMatrix) => this.buildRoomCostMatrix(roomName, costMatrix),
    //     })
    //         .map(step => step.direction)
    //         .join('')
    // }

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
            const nextPos = this.getNextPosition(currentPos, direction)
            path.push(nextPos)
            currentPos = nextPos
        }

        return path
    }

    static getNextPosition(pos: RoomPosition, direction: DirectionConstant): RoomPosition {
        let { x, y } = pos
        const roomName = pos.roomName

        // Adjust x and y based on the direction
        switch (direction) {
            case TOP:
                y -= 1
                break
            case TOP_RIGHT:
                y -= 1
                x += 1
                break
            case RIGHT:
                x += 1
                break
            case BOTTOM_RIGHT:
                y += 1
                x += 1
                break
            case BOTTOM:
                y += 1
                break
            case BOTTOM_LEFT:
                y += 1
                x -= 1
                break
            case LEFT:
                x -= 1
                break
            case TOP_LEFT:
                y -= 1
                x -= 1
                break
        }

        return new RoomPosition(x, y, roomName)
    }

}
