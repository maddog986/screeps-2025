import { CONFIG } from 'config'
import { cache } from './cache'
import Traveler from './Traveler'
import utils from './utils'
import { layoutKey, visual_structure } from './visuals'

interface SimplePositions {
    [name: string]: number[][]
}

// Parse layout into structure positions
function getBuildPositions(layout: string[]): SimplePositions {
    if (!layout.length) return {}

    const height = layout.length
    const width = layout[0].length
    const centerY = Math.floor(height / 2)
    const centerX = Math.floor(width / 2)
    const positions: SimplePositions = {}

    layout.forEach((row, y) => {
        row.split('').forEach((char, x) => {
            const structure = layoutKey[char]
            if (!structure) return
            positions[structure] = positions[structure] || []
            positions[structure].push([x - centerX, y - centerY])
        })
    })

    return positions
}

interface StructurePosition {
    x: number
    y: number
    structure: string
    level: number
}

function rotateStructures(allStructures: StructurePosition[], centerPoint: RoomPosition, angleDegrees: number) {
    const angleRadians = (Math.PI / 180) * angleDegrees // Convert degrees to radians
    const cosAngle = Math.cos(angleRadians)
    const sinAngle = Math.sin(angleRadians)

    for (const structure of allStructures) {
        // Translate point relative to the center
        const relX = structure.x - centerPoint.x
        const relY = structure.y - centerPoint.y

        // Rotate the point
        const rotatedX = Math.round(relX * cosAngle - relY * sinAngle)
        const rotatedY = Math.round(relX * sinAngle + relY * cosAngle)

        // Translate back
        structure.x = centerPoint.x + rotatedX
        structure.y = centerPoint.y + rotatedY
    }
}

export default class RoomBuilder {
    room: Room
    buildable_structures: StructurePosition[]

    constructor(room: Room) {
        this.room = room
        this.buildable_structures = []

        this.process_structures()
    }

    @cache("find", 1)
    find<S extends AnyStructure>(find: FindConstant): S[] {
        return this.room.find(find)
    }

    process_structures() {
        const buildOrder = CONFIG.buildOrder[this.room.name]
        if (!buildOrder) return

        const spawn = this.find(FIND_MY_SPAWNS).shift()
        if (!spawn) return

        this.buildable_structures = []

        for (const level in buildOrder) {
            const layout = buildOrder[level]
            if (!layout) continue

            const positions = getBuildPositions(layout)
            for (const structure in positions) {
                positions[structure].forEach(([x, y]) => {
                    // is this position clear?
                    const structures = this.room.lookAt(spawn.pos.x + x, spawn.pos.y + y)
                    if (structures.some(({ type }) => type === "structure" || type === "constructionSite")) return

                    this.buildable_structures.push({
                        x: spawn.pos.x + x,
                        y: spawn.pos.y + y,
                        structure,
                        level: Number(level),
                    })
                })
            }
        }

        // rotate the structures
        if (CONFIG.buildRotate) {
            rotateStructures(this.buildable_structures, spawn.pos, CONFIG.buildRotate)
        }

        const allStructures = this.find(FIND_STRUCTURES)
        const containers = allStructures.filter(({ structureType }) => structureType === STRUCTURE_CONTAINER)
        const constructureSites = this.find(FIND_MY_CONSTRUCTION_SITES)
        const spawns = this.find(FIND_MY_SPAWNS)
        const sources = this.find(FIND_SOURCES)

        // add a container near sources
        sources
            .forEach((source) => {
                const optimalPosition = utils.findOptimalPosition(this.room, source.pos, 1)
                if (!optimalPosition) return

                this.buildable_structures.push({ x: optimalPosition.x, y: optimalPosition.y, structure: STRUCTURE_CONTAINER, level: 3 })
            })

        // build roads to sources
        spawns.forEach((spawn) => {
            sources.forEach((source) => {
                // look for containers near source
                const container_near_source = allStructures
                    // get all containers near source
                    .filter(({ pos, structureType }) => structureType === STRUCTURE_CONTAINER && utils.inRangeTo(source.pos, pos, 2))
                    // remap to structure positions
                    .map(({ pos }) => ({ x: pos.x, y: pos.y, structure: STRUCTURE_CONTAINER, level: CONFIG.buildContainers }))
                    // get first item
                    .shift()

                if (container_near_source) {
                    this.buildable_structures.push(container_near_source)
                }

                const container_pos = this.buildable_structures
                    .find(({ x, y, structure }) => structure === STRUCTURE_CONTAINER && utils.inRangeTo(source.pos, new RoomPosition(x, y, this.room.name), 2))
                if (!container_pos) return

                // find a path to the source
                new RoomPosition(container_pos.x, container_pos.y, this.room.name).findPathTo(spawn.pos, {
                    range: 1,
                    ignoreCreeps: true,
                    maxOps: 5000,
                    maxRooms: 1,
                    costCallback: (roomName, costMatrix) => {
                        costMatrix = Traveler.buildRoomCostMatrix(roomName, costMatrix, {
                            swampCost: 1,
                            plainCost: 1,
                            ignoreCreeps: true
                        })

                        for (const { x, y, structure } of this.buildable_structures) {
                            if (structure === STRUCTURE_WALL) {
                                costMatrix.set(x, y, 255)
                            } else if (structure === STRUCTURE_ROAD || structure === STRUCTURE_CONTAINER) {
                                costMatrix.set(x, y, 1)
                            } else {
                                costMatrix.set(x, y, 255)
                            }
                        }

                        return costMatrix
                    },
                })
                    .forEach(({ x, y }) => {
                        this.buildable_structures.push({ x: x, y, structure: STRUCTURE_ROAD, level: CONFIG.buildRoads })
                    })

                // remove container_near_source from buildable_structures
                const index = this.buildable_structures.findIndex(({ x, y }) => x === container_pos.x && y === container_pos.y)
                if (index >= 0) {
                    this.buildable_structures.splice(index, 1)
                }
            })

            // remove duplicates from all_structures if there is a higher level
            this.buildable_structures = this.buildable_structures
                .filter((v, i, a) => a.findIndex(t => (t.x === v.x && t.y === v.y && t.structure === v.structure) && t.level < v.level) === -1)
        })

        this.buildable_structures = this.buildable_structures
            .filter(({ x, y }) => this.room.lookAt(x, y).some(({ type }) => type !== "structure" && type !== "constructionSite"))

    }

    draw_structures() {
        for (const { x, y, structure, level } of this.buildable_structures) {
            visual_structure({
                room: this.room,
                x: x,
                y: y,
                type: structure as any,
                opts: { opacity: 1 }
            })
        }

        const allStructures = this.find(FIND_STRUCTURES)
        const constructureSites = this.find(FIND_MY_CONSTRUCTION_SITES)
        const roads: StructurePosition[] = [...allStructures, ...constructureSites]
            // filter out roads
            .filter(({ structureType }) => structureType === STRUCTURE_ROAD)
            // remap to structure positions
            .map(({ pos }) => ({ x: pos.x, y: pos.y, level: 3, structure: STRUCTURE_ROAD }))

        const temp_roads = this.buildable_structures.filter(({ structure }) => structure === STRUCTURE_ROAD)
        roads.push(...temp_roads)

        roads
            // remove duplicates from all_structures if there is a lower level
            .filter((v, i, a) => a.findIndex(t => (t.x === v.x && t.y === v.y && t.structure === v.structure) && t.level < v.level) === -1)

            .forEach(({ x, y, level }) => {
                // Get neighboring positions around the current road
                const neighbors = utils.getNeighbors(x, y, 1)

                neighbors.forEach(([dx, dy]) => {
                    if (this.room.lookAt(dx, dy).some(({ type }) => type === "structure" || type === "constructionSite")) return

                    if (roads.some(({ x: nx, y: ny }) => nx === dx && ny === dy)) {
                        this.room.visual.line(dx, dy, x, y, { color: "#666", opacity: 0.25, width: 0.45 })
                    }
                })
            })

        if (CONFIG.visuals.show_build_levels) {
            for (const { x, y, structure, level } of this.buildable_structures) {
                // draw text above the structure with level
                this.room.visual.text(level.toString(), x, y + 0.15, {
                    font: '0.4 Arial',
                    opacity: 0.75
                })
            }
        }
    }

    build_it(structure: StructurePosition) {
        const pos = new RoomPosition(structure.x, structure.y, this.room.name)
        this.room.createConstructionSite(pos, structure.structure as BuildableStructureConstant)
    }

    build_structures() {
        const constructionSites = this.find(FIND_MY_CONSTRUCTION_SITES)
        if (constructionSites.length >= CONFIG.build.max_constructions) return

        const spawn = this.find(FIND_MY_SPAWNS).shift()
        if (!spawn) return

        const buildables = []

        const towers = this.buildable_structures
            .filter(({ structure }) => structure === STRUCTURE_TOWER)
            // sort by closest to spawn
            .sort((a, b) => utils.getRangeTo(new RoomPosition(a.x, a.y, this.room.name), spawn.pos) - utils.getRangeTo(new RoomPosition(b.x, b.y, this.room.name), spawn.pos))

        if (towers) {
            buildables.push(...towers)
        }

        const extensions = this.buildable_structures
            .filter(({ structure }) => structure === STRUCTURE_EXTENSION)
            // sort by closest to spawn
            .sort((a, b) => utils.getRangeTo(new RoomPosition(a.x, a.y, this.room.name), spawn.pos) - utils.getRangeTo(new RoomPosition(b.x, b.y, this.room.name), spawn.pos))

        if (extensions) {
            buildables.push(...extensions)
        }

        const containers = this.buildable_structures
            .filter(({ structure }) => structure === STRUCTURE_CONTAINER)
            // sort by closest to spawn
            .sort((a, b) => utils.getRangeTo(new RoomPosition(a.x, a.y, this.room.name), spawn.pos) - utils.getRangeTo(new RoomPosition(b.x, b.y, this.room.name), spawn.pos))

        if (containers) {
            buildables.push(...containers)
        }

        const roads = this.buildable_structures
            .filter(({ structure }) => structure === STRUCTURE_ROAD)
            // sort by closest to spawn
            .sort((a, b) => utils.getRangeTo(new RoomPosition(a.x, a.y, this.room.name), spawn.pos) - utils.getRangeTo(new RoomPosition(b.x, b.y, this.room.name), spawn.pos))

        if (roads) {
            buildables.push(...roads)
        }

        const ramparts = this.buildable_structures
            .filter(({ structure }) => structure === STRUCTURE_RAMPART)
            // sort by closest to spawn
            .sort((a, b) => utils.getRangeTo(new RoomPosition(a.x, a.y, this.room.name), spawn.pos) - utils.getRangeTo(new RoomPosition(b.x, b.y, this.room.name), spawn.pos))

        if (ramparts) {
            buildables.push(...ramparts)
        }

        const walls = this.buildable_structures
            .filter(({ structure }) => structure === STRUCTURE_WALL)
            // sort by closest to spawn
            .sort((a, b) => utils.getRangeTo(new RoomPosition(a.x, a.y, this.room.name), spawn.pos) - utils.getRangeTo(new RoomPosition(b.x, b.y, this.room.name), spawn.pos))

        if (walls) {
            buildables.push(...walls)
        }

        // whatever is left
        const whatever = this.buildable_structures

        if (whatever) {
            buildables.push(...whatever)
        }

        // build the structures
        buildables
            .slice(0, Math.min(buildables.length, Math.max(0, CONFIG.build.max_constructions - constructionSites.length)))
            .forEach((structure) => {
                this.build_it(structure)
            })
    }

    run() {
        if (CONFIG.visuals.enabled && CONFIG.visuals.show_build) {
            this.draw_structures()
        }

        if (CONFIG.build.enabled) {
            this.build_structures()
        }
    }
}
