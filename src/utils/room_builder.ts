import { CONFIG } from 'config'
import { cache } from './cache'
import Traveler from './Traveler'
import utils from './utils'
import { layoutKey, visual_structure } from './visuals'

interface SimplePositions {
    [name: string]: number[][]
}

interface StructurePosition {
    x: number
    y: number
    structure: string
    level: number
}

export default class RoomBuilder {
    room: Room
    allStructures: AnyStructure[]
    containers: AnyStructure[]
    constructureSites: ConstructionSite<BuildableStructureConstant>[]
    spawns: StructureSpawn[]
    sources: Source[]
    spawn: StructureSpawn | undefined

    cache() {
        return "room_builder"
    }

    constructor(room: Room) {
        this.room = room

        this.constructureSites = this.room.find(FIND_MY_CONSTRUCTION_SITES)
        this.sources = this.room.find(FIND_SOURCES)
        this.allStructures = this.room.find(FIND_STRUCTURES)
        this.containers = this.allStructures.filter(({ structureType }) => structureType === STRUCTURE_CONTAINER)
        this.spawns = this.allStructures.filter(({ structureType }) => structureType === STRUCTURE_SPAWN) as StructureSpawn[]
        this.spawn = this.spawns[0]
    }

    // Parse layout into structure positions
    setBuildPositions(layout: string[], center: RoomPosition, level: number): StructurePosition[] {
        if (!layout.length) return []

        const height = layout.length
        const width = layout[0].length
        const centerY = Math.floor(height / 2)
        const centerX = Math.floor(width / 2)

        const buildable_structures: StructurePosition[] = []

        layout.forEach((row, y) => {
            row.split('').forEach((char, x) => {
                const structure = layoutKey[char]
                if (!structure || structure === STRUCTURE_SPAWN) return
                buildable_structures.push({
                    x: center.x + (x - centerX),
                    y: center.y + (y - centerY),
                    structure,
                    level,
                })
            })
        })

        return buildable_structures
    }

    filterPositions(buildable_structures: StructurePosition[]): StructurePosition[] {
        // remove positions that are not clear
        return buildable_structures
            // remove duplicates with a higher level
            .filter((v, i, a) => a.findIndex(t => t.x === v.x && t.y === v.y && t.structure === v.structure && t.level < v.level) === -1)

            // remove structures that are blocked
            .filter(({ x, y }) => utils.isWalkable(this.room, x, y))
    }

    @cache("process_structures", 1)
    process_structures(): StructurePosition[] {
        const buildOrder = CONFIG.build.build_orders[this.room.name]
        if (!buildOrder || !this.spawn) return []

        // this.spawns = Object.values(Game.spawns)//.filter(({ my, room }) => my && room.name === this.room.name) //.this.allStructures.filter(({ structureType }) => structureType === STRUCTURE_SPAWN) as StructureSpawn[]
        // this.spawn = this.spawns[0]

        let buildable_structures: StructurePosition[] = []

        for (const level in buildOrder) {
            // add layout to the buildable_structures
            buildable_structures.push(...this.setBuildPositions(buildOrder[level], this.spawn.pos, Number(level)))
        }

        buildable_structures = this.filterPositions(buildable_structures)

        // add a container near sources
        this.sources
            .forEach((source) => {
                // look for containers near source
                const container_near_source = this.containers
                    // get all containers near source
                    .filter(({ pos }) => utils.inRangeTo(source.pos, pos, 3))
                    // remap to structure positions
                    .map(({ pos }) => ({ x: pos.x, y: pos.y, structure: STRUCTURE_CONTAINER, level: CONFIG.build.auto_build_roads_level }))
                    // get first item
                    .shift()

                if (container_near_source) return

                const optimalPosition = utils.findOptimalPosition(this.room, source.pos, 1)
                if (!optimalPosition) {
                    console.log('BUILDER ISSUE: No optimal position found for container near source:', source)
                    return
                }

                buildable_structures.push({ x: optimalPosition.x, y: optimalPosition.y, structure: STRUCTURE_CONTAINER, level: 3 })
            })

        // build roads to sources
        this.spawns.forEach((spawn) => {
            this.sources.forEach((source) => {
                // look for containers near source
                const container_near_source = this.containers
                    // get all containers near source
                    .filter(({ pos }) => utils.inRangeTo(source.pos, pos, 2))
                    // remap to structure positions
                    .map(({ pos }) => ({ x: pos.x, y: pos.y, structure: STRUCTURE_CONTAINER, level: CONFIG.build.auto_build_roads_level }))
                    // get first item
                    .shift()

                if (container_near_source) {
                    buildable_structures.push(container_near_source)
                }

                const container_pos = buildable_structures
                    .find(({ x, y, structure }) => structure === STRUCTURE_CONTAINER && utils.inRangeTo(source.pos, new RoomPosition(x, y, source.room.name), 2))

                if (!container_pos) {
                    console.log("BUILDER ISSUE: No container position found near source:", source)
                    return
                }

                // find a path to the source
                new RoomPosition(container_pos.x, container_pos.y, this.room.name)
                    .findPathTo(spawn.pos, {
                        range: 1,
                        ignoreCreeps: true,
                        maxOps: 5000,
                        maxRooms: 1,
                        costCallback: (roomName, costMatrix) => {
                            costMatrix = Traveler.buildRoomCostMatrix(roomName, costMatrix, {
                                swampCost: 15,
                                plainCost: 15,
                                ignoreCreeps: true
                            })

                            for (const { x, y, structure } of buildable_structures) {
                                if (structure === STRUCTURE_WALL) {
                                    costMatrix.set(x, y, 255)
                                } else if (structure === STRUCTURE_ROAD) {
                                    costMatrix.set(x, y, 1)
                                } else {
                                    costMatrix.set(x, y, 255)
                                }
                            }

                            return costMatrix
                        },
                    })

                    .forEach(({ x, y }) => {
                        buildable_structures.push({ x: x, y, structure: STRUCTURE_ROAD, level: CONFIG.build.auto_build_roads_level })
                    })

                // remove container_near_source from buildable_structures
                if (container_near_source) {
                    const index = buildable_structures.findIndex(({ x, y, structure }) => x === container_near_source.x && y === container_near_source.y && structure === STRUCTURE_CONTAINER)
                    if (index >= 0) {
                        buildable_structures.splice(index, 1)
                    }
                }
            })
        })

        return this.filterPositions(buildable_structures)
    }

    draw_structures() {
        if (!CONFIG.visuals.enabled) return

        const buildable_structures = this.process_structures()

        for (const { x, y, structure, level } of buildable_structures) {
            visual_structure({
                room: this.room,
                x: x,
                y: y,
                type: structure as any,
                opts: { opacity: 1 }
            })
        }

        const roads: StructurePosition[] = [...this.allStructures, ...this.constructureSites]
            // filter out roads
            .filter(({ structureType }) => structureType === STRUCTURE_ROAD)
            // remap to structure positions
            .map(({ pos }) => ({ x: pos.x, y: pos.y, level: CONFIG.build.auto_build_roads_level, structure: STRUCTURE_ROAD }))

        roads.push(...buildable_structures.filter(({ structure }) => structure === STRUCTURE_ROAD))

        roads
            .forEach(({ x, y, level }) => {
                // Get neighboring positions around the current road
                const neighbors = utils.getNeighbors(x, y, 1)

                neighbors.forEach(([dx, dy]) => {
                    if (!utils.isWalkable(this.room, dx, dy)) return

                    if (roads.some(({ x: nx, y: ny }) => nx === dx && ny === dy)) {
                        this.room.visual.line(dx, dy, x, y, { color: "#666", opacity: 0.25, width: 0.45 })
                    }
                })
            })

        if (!CONFIG.build.show_build_levels) return

        const controllerLevel = this.room.controller!.level + (this.room.controller!.progress / this.room.controller!.progressTotal)

        for (const { x, y, structure, level } of buildable_structures) {
            // draw text above the structure with level
            this.room.visual.text(level.toString(), x, y + 0.1, {
                font: '0.3 Arial',
                color: structure === STRUCTURE_CONTAINER ? '#000' : (controllerLevel >= level ? 'yellow' : '#fff'),
                opacity: 0.75
            })
        }
    }

    build_it(structure: StructurePosition) {
        const pos = new RoomPosition(structure.x, structure.y, this.room.name)
        this.room.createConstructionSite(pos, structure.structure as BuildableStructureConstant)
    }

    build_structures() {
        const constructionSites = this.constructureSites
        if (constructionSites.length >= CONFIG.build.max_constructions) return

        const spawn = this.spawn
        if (!spawn) return

        const controllerLevel = this.room.controller!.level + (this.room.controller!.progress / this.room.controller!.progressTotal)

        const buildable_structures = this.process_structures()
            // filter out higher levels
            .filter(({ level }) => level <= controllerLevel)

        const buildables = []

        const towers = buildable_structures
            .filter(({ structure }) => structure === STRUCTURE_TOWER)
            // sort by closest to spawn
            .sort((a, b) => utils.getRangeTo(new RoomPosition(a.x, a.y, this.room.name), spawn.pos) - utils.getRangeTo(new RoomPosition(b.x, b.y, this.room.name), spawn.pos))

        if (towers) {
            buildables.push(...towers)
        }

        const extensions = buildable_structures
            .filter(({ structure }) => structure === STRUCTURE_EXTENSION)
            // sort by closest to spawn
            .sort((a, b) => utils.getRangeTo(new RoomPosition(a.x, a.y, this.room.name), spawn.pos) - utils.getRangeTo(new RoomPosition(b.x, b.y, this.room.name), spawn.pos))

        if (extensions) {
            buildables.push(...extensions)
        }

        const containers = buildable_structures
            .filter(({ structure }) => structure === STRUCTURE_CONTAINER)
            // sort by closest to spawn
            .sort((a, b) => utils.getRangeTo(new RoomPosition(a.x, a.y, this.room.name), spawn.pos) - utils.getRangeTo(new RoomPosition(b.x, b.y, this.room.name), spawn.pos))

        if (containers) {
            buildables.push(...containers)
        }

        const roads = buildable_structures
            .filter(({ structure }) => structure === STRUCTURE_ROAD)
            // sort by closest to spawn
            .sort((a, b) => utils.getRangeTo(new RoomPosition(a.x, a.y, this.room.name), spawn.pos) - utils.getRangeTo(new RoomPosition(b.x, b.y, this.room.name), spawn.pos))

        if (roads) {
            buildables.push(...roads)
        }

        const ramparts = buildable_structures
            .filter(({ structure }) => structure === STRUCTURE_RAMPART)
            // sort by closest to spawn
            .sort((a, b) => utils.getRangeTo(new RoomPosition(a.x, a.y, this.room.name), spawn.pos) - utils.getRangeTo(new RoomPosition(b.x, b.y, this.room.name), spawn.pos))

        if (ramparts) {
            buildables.push(...ramparts)
        }

        const walls = buildable_structures
            .filter(({ structure }) => structure === STRUCTURE_WALL)
            // sort by closest to spawn
            .sort((a, b) => utils.getRangeTo(new RoomPosition(a.x, a.y, this.room.name), spawn.pos) - utils.getRangeTo(new RoomPosition(b.x, b.y, this.room.name), spawn.pos))

        if (walls) {
            buildables.push(...walls)
        }

        // whatever is left
        const whatever = buildable_structures

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
        if (!CONFIG.build.enabled) return

        this.build_structures()

        if (CONFIG.build.show_build) {
            this.draw_structures()
        }
    }
}
