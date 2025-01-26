import { CONFIG } from 'config'
import Traveler from 'creep_traveler'
import RoomSpawnManager from 'room/room_spawn'
import { STRUCTURE_KEY } from 'utils/RoomVisual.prototype'
import cache from 'utils/cache'
import utils from 'utils/utils'

declare global {
    interface StructurePosition {
        x: number
        y: number
        structure: string
        level: number
    }
}

export default class RoomBuilder extends RoomSpawnManager {
    allStructures: AnyStructure[]
    containers: AnyStructure[]
    constructureSites: ConstructionSite<BuildableStructureConstant>[]
    sources: Source[]
    controllerLevel: number
    spawn: StructureSpawn

    constructor(room: Room) {
        super(room)

        this.sources = this.getContext('sources') //this.room.find(FIND_SOURCES)
        this.constructureSites = this.getContext('constructionSites') // this.room.find(FIND_MY_CONSTRUCTION_SITES)
        this.allStructures = this.getContext('structures') // this.room.find(FIND_STRUCTURES)
        this.containers = this.getContext('containers') // this.allStructures.filter(({ structureType }) => structureType === STRUCTURE_CONTAINER)
        this.controllerLevel = this.getContext('controllerLevel')
        this.spawn = this.spawns[0]

        this.setContext('testing', true)

        this.log(`**RoomBuilder** context loaded:`, {
            controllerLevel: this.controllerLevel,
            sources: this.sources.length,
            constructionSitess: this.constructureSites.length,
            allStructures: this.allStructures.length,
            containers: this.containers.length,
            spawn: this.spawn ? this.spawn.id : 'none',
        })
    }

    run() {
        super.run()

        this.displayMatrix()
        this.buildStructures()
    }

    /**
     * ROOM BUILDER
     */

    // Parse layout into structure positions
    private setBuildPositions(layout: string[], center: RoomPosition, level: number): StructurePosition[] {
        if (!layout.length) return []

        const height = layout.length
        const width = layout[0].length
        const centerY = Math.floor(height / 2)
        const centerX = Math.floor(width / 2)

        const buildable_structures: StructurePosition[] = []

        layout.forEach((row, y) => {
            row.split('').forEach((char, x) => {
                const structure = STRUCTURE_KEY[char as keyof typeof STRUCTURE_KEY]
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

    private filterPositions(buildable_structures: StructurePosition[]): StructurePosition[] {
        // remove positions that are not clear
        return buildable_structures
            // remove duplicates with a higher level
            .filter((v, i, a) => a.findIndex(t => t.x === v.x && t.y === v.y && t.structure === v.structure && t.level < v.level) === -1)
            .filter((v, i, a) => a.findIndex(t => t.x === v.x && t.y === v.y && t.structure === v.structure) === i)

            // remove structures that are blocked
            .filter(({ x, y }) => utils.isWalkable(this.room, x, y))

        // .filter((v, i, a) => a.findIndex(t => t.x === v.x && t.y === v.y && t.structure === v.structure) === i)
    }

    @cache("process_structures", 1)
    process_structures(): StructurePosition[] {
        const buildConfig = CONFIG.rooms[this.room.name]?.build
        const buildOrder = buildConfig?.build_orders
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
                    .filter(({ pos }) => source.pos.getRangeTo(pos) <= 3)
                    // remap to structure positions
                    .map(({ pos }) => ({ x: pos.x, y: pos.y, structure: STRUCTURE_CONTAINER, level: buildConfig.auto_build_roads_level }))
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
                    .map(({ pos }) => ({ x: pos.x, y: pos.y, structure: STRUCTURE_CONTAINER, level: buildConfig.auto_build_roads_level }))
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
                        buildable_structures.push({ x: x, y, structure: STRUCTURE_ROAD, level: buildConfig.auto_build_roads_level })
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

    private displayBuildStructures() {
        if (!CONFIG.visuals.enabled) return

        const buildable_structures = this.process_structures()

        for (const { x, y, structure, level } of buildable_structures) {
            this.room.visual.structure(new RoomPosition(x, y, this.room.name), structure as RoomVisualStructure)
        }

        const roads: StructurePosition[] = [...this.allStructures, ...this.constructureSites]
            // filter out roads
            .filter(({ structureType }) => structureType === STRUCTURE_ROAD)
            // remap to structure positions
            .map(({ pos }) => ({ x: pos.x, y: pos.y, level: this.config.build.auto_build_roads_level, structure: STRUCTURE_ROAD }))

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

        if (!this.config.build.show_build_levels) return

        for (const { x, y, structure, level } of buildable_structures) {
            // draw text above the structure with level
            this.room.visual.text(level.toString(), x, y + 0.1, {
                font: '0.3 Arial',
                color: structure === STRUCTURE_CONTAINER ? '#000' : (this.controllerLevel >= level ? 'yellow' : '#fff'),
                opacity: 0.75
            })
        }
    }

    private built_structures = 0

    // construct a structure
    private constructStructure(structure: StructurePosition) {
        if (!this.config.build.enabled) return

        const constructionSites = this.constructureSites
        if ((constructionSites.length + this.built_structures) >= this.config.build.max_constructions) return

        const pos = new RoomPosition(structure.x, structure.y, this.room.name)
        if (OK === this.room.createConstructionSite(pos, structure.structure as BuildableStructureConstant)) {
            this.built_structures++
        }
    }

    // build structures
    private buildStructures() {
        if (!this.config.build.enabled) return

        const spawn = this.spawn
        if (!spawn) return

        const controllerLevel = this.room.controller!.level + (this.room.controller!.progress / this.room.controller!.progressTotal)

        const buildable_structures = this.process_structures()
            // filter out higher levels
            .filter(({ level }) => level <= controllerLevel)

        if (this.config.build.show_build) {
            this.displayBuildStructures()
        }

        this.log(`**RoomBuilder** Buildable structures to build ${buildable_structures.length}`)

        // sort by priority
        buildable_structures.sort((a: StructurePosition, b: StructurePosition) => {
            const priorityA = this.config.build.build_orders[a.level]?.indexOf(a.structure as string) ?? Infinity
            const priorityB = this.config.build.build_orders[b.level]?.indexOf(b.structure as string) ?? Infinity

            return priorityA - priorityB
        })

        // do building
        if (this.config.build.max_constructions > 0) {
            // build the structures
            buildable_structures
                .slice(0, Math.min(buildable_structures.length, Math.max(0, this.config.build.max_constructions - this.constructureSites.length)))
                .forEach((structure) => {
                    this.constructStructure(structure)
                })
        }
    }

    // display the room matrix
    private displayMatrix() {
        if (!CONFIG.visuals.enabled || !CONFIG.visuals.show_matrix) return

        // lets visualize the room matrix
        const matrix = new PathFinder.CostMatrix
        const room_matrix = Traveler.buildRoomCostMatrix(this.room.name, matrix)

        // loop through the matrix, display a number on each tile with its cost
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                const cost = room_matrix.get(x, y)
                this.room.visual.text(cost.toString(), x, y + 0.1, {
                    font: '0.4 Arial',
                    opacity: 0.35
                })
            }
        }

    }
}
