import cache, { cpuLog } from 'utils/cache'
import utils from 'utils/utils'
import RoomSpawnManager from './room_spawn'

interface RoomMatrixContext {
    spawn?: StructureSpawn
}

export default class RoomMatrix<TContext extends Record<string, any> = {}> extends RoomSpawnManager<TContext & RoomMatrixContext> {
    matrix: CostMatrix
    terrain: RoomTerrain

    public structures: AnyStructure[]
    public containers: StructureContainer[]
    public constructions: ConstructionSite<BuildableStructureConstant>[]
    public sources: Source[]
    public controllerLevel: number
    public spawn: StructureSpawn

    constructor(room: Room) {
        super(room)

        this.sources = this.getContext('sources', true) //this.room.find(FIND_SOURCES)
        this.constructions = this.getContext('constructionSites', true) // this.room.find(FIND_MY_CONSTRUCTION_SITES)
        this.structures = this.getContext('structures', true) // this.room.find(FIND_STRUCTURES)
        this.containers = this.getContext('containers', true) // this.allStructures.filter(({ structureType }) => structureType === STRUCTURE_CONTAINER)
        this.controllerLevel = this.getContext('controllerLevel')
        this.spawn = this.spawns[0]

        this.setContext('spawn', this.spawn)

        this.log(`**RoomBuilder** context loaded:`, {
            controllerLevel: this.controllerLevel,
            containers: this.containers.length,
            spawn: this.spawn ? this.spawn.id : 'none',
        })

        this.terrain = Game.map.getRoomTerrain(this.room.name)
        this.matrix = new PathFinder.CostMatrix()

        this.buildRoomCostMatrix()
    }

    @cpuLog
    getMatrix(creep: Creep, options: TravelerOptions = {}): CostMatrix {
        // console.log('**RoomMatrix:** getMatrix', creep)
        this.logCpu()

        const matrix = this.buildRoomCreepMatrix(creep, options)

        this.log(`**RoomMatrix:** ${this.room.name} matrix built for creep ${creep.name}. CPU: ${this.getLogCpu()}`)

        return matrix
    }

    @cache('buildRoomCostMatrix', 100)
    private buildRoomCostMatrix(options: TravelerOptions = {}): void {
        const {
            highCost = 8,           // Default high cost
            edgeCost = 200,         // Default edge cost
            wallCost = 15,          // Default wall cost
            roadCost = 1,           // Default road cost
            plainCost = 3,          // Default plain cost
            swampCost = 9,         // Default swamp cost
            ...TRAVELER_DEFAULT
        } = options

        this.logCpu()

        // set swamp and plain costs
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                const type = this.terrain.get(x, y)
                const cost = this.matrix.get(x, y)

                switch (type) {
                    case TERRAIN_MASK_WALL:
                        this.matrix.set(x, y, 255)

                        // nice to have, but its slow as shit
                        // // Directly check and set costs for adjacent positions
                        // for (let dx = -1; dx <= 1; dx++) {
                        //     for (let dy = -1; dy <= 1; dy++) {
                        //         const nx = x + dx
                        //         const ny = y + dy
                        //         if (nx >= 0 && nx < 50 && ny >= 0 && ny < 50) {
                        //             const cost = this.matrix.get(nx, ny)
                        //             this.matrix.set(nx, ny, Math.min(255, cost + highCost))
                        //         }
                        //     }
                        // }
                        break
                    case TERRAIN_MASK_SWAMP:
                        this.matrix.set(x, y, Math.min(255, cost + swampCost))
                        break
                    case 0:
                        this.matrix.set(x, y, Math.min(255, cost + plainCost))
                        break
                }
            }
        }

        this.log('**matrix**: set swamp and plain costs', `cpu:${this.getLogCpu()}`)
        this.logCpu()

        // Mark positions within a distance of 4 around the controller
        const controller = this.room.controller
        if (controller && controller.my) {
            // get all positions around the target
            utils.getNeighbors(controller.pos.x, controller.pos.y, 3)
                // remove out of bounds
                .filter(([x, y]) => x >= 0 && x < 50 && y >= 0 && y < 50)
                // remap with existing cost
                .map(([x, y]) => ({ x, y, cost: this.matrix.get(x, y) }))
                // set new cost
                .forEach(({ x, y, cost }) => {
                    this.matrix.set(x, y, Math.max(1, cost + highCost))
                })
        }

        this.log('**matrix**: controller ', `cpu:${this.getLogCpu()}`)
        this.logCpu()

        // Mark positions around spawns
        this.spawns.forEach(s => {
            // get all positions around the target
            utils.getNeighbors(s.pos.x, s.pos.y, 1)
                // remove out of bounds
                // ignore walls
                .filter(([x, y]) => x >= 0 && x < 50 && y >= 0 && y < 50 && this.terrain.get(x, y) === TERRAIN_MASK_WALL)
                // set new cost
                .forEach(([x, y]) => {
                    const cost = this.matrix.get(x, y)
                    this.matrix.set(x, y, Math.min(255, cost + highCost))
                })
        })

        this.log('**matrix**: spawns', `cpu:${this.getLogCpu()}`)
        this.logCpu()

        // Mark positions around sources
        this.sources
            .forEach(s => {
                // get all positions around the target
                utils.getNeighbors(s.pos.x, s.pos.y, 1)
                    // remove out of bounds
                    .filter(([x, y]) => x >= 0 && x < 50 && y >= 0 && y < 50)
                    // ignore walls
                    .filter(([x, y]) => this.terrain.get(x, y) !== TERRAIN_MASK_WALL)
                    // remap with existing cost
                    .map(([x, y]) => ({ x, y, cost: this.matrix.get(x, y) }))
                    // set new cost
                    .forEach(({ x, y, cost }) => {
                        this.matrix.set(x, y, plainCost)
                    })
            })

        this.log('**matrix**: sources', `cpu:${this.getLogCpu()}`)
        this.logCpu()

        //room.find(FIND_STRUCTURES)
        this.structures
            // remap with existing cost
            .map(({ pos: { x, y, }, structureType }) => ({ x, y, structureType, cost: this.matrix.get(x, y) }))

            .forEach(({ cost, structureType, x, y }) => {
                if (structureType === STRUCTURE_ROAD || structureType === STRUCTURE_CONTAINER || structureType === STRUCTURE_RAMPART) {
                    // Favor roads
                    this.matrix.set(x, y, Math.max(1, cost - 10))
                } else {
                    // Impassable structures
                    this.matrix.set(x, y, 255)
                }
            })

        this.log('**matrix**: structures', `cpu:${this.getLogCpu()}`)
        this.logCpu()

        //room.find(FIND_CONSTRUCTION_SITES)
        this.constructions
            // remap with existing cost
            .map(({ pos: { x, y, }, structureType }) => ({ x, y, structureType, cost: this.matrix.get(x, y) }))
            .forEach(({ cost, structureType, x, y }) => {
                if (structureType === STRUCTURE_ROAD || structureType === STRUCTURE_CONTAINER || structureType === STRUCTURE_RAMPART) {
                    // Favor roads
                    this.matrix.set(x, y, Math.max(1, cost - 10))
                } else {
                    // Impassable structures
                    this.matrix.set(x, y, 255)
                }
            })

        this.log('**matrix**: constructions', `cpu:${this.getLogCpu()}`)
    }

    @cpuLog
    private buildRoomCreepMatrix(creep: Creep, options: TravelerOptions = {}): CostMatrix {
        const costMatrix = this.matrix.clone()

        const {
            highCost = 8,           // Default high cost
            ignoreCreeps = false,   // Default ignore creeps
            ...TRAVELER_DEFAULT
        } = options

        if (ignoreCreeps) return costMatrix

        if (!creep.manager.hasTask('harvest')) {
            const sources: Source[] = this.getContext('sources', true)

            sources.forEach(s => {
                utils.getNeighbors(s.pos.x, s.pos.y, 1)
                    .forEach(([x, y]) => {
                        costMatrix.set(x, y, 200)
                    })
            })
        }

        // avoid enemies
        this.enemies.forEach((c: Creep) => {
            const canAttack = c.body.some(b => b.type === ATTACK || b.type === RANGED_ATTACK)

            utils.getNeighbors(c.pos.x, c.pos.y, canAttack ? 4 : 2)
                .forEach(([x, y]) => {
                    const cost = costMatrix.get(x, y)

                    costMatrix.set(x, y, canAttack ? 255 : 120)
                })
        })

        // find creeps that have been at the same position for awhile
        //room.find(FIND_MY_CREEPS)
        this.creeps
            // remap with existing cost
            .map((c) => ({ c, x: c.pos.x, y: c.pos.y, cost: costMatrix.get(c.pos.x, c.pos.y) }))
            .forEach(({ c, x, y, cost }) => {
                // cheap hack to get creeps to group together near a controller
                // idea is they could share resources while together
                const controller = this.room.controller
                if (controller && c.pos.inRangeTo(controller.pos, 3)) {
                    utils.getNeighbors(c.pos.x, c.pos.y, 1)
                        .forEach(([x, y]) => {
                            const cost = costMatrix.get(x, y)

                            // is position clear of creeps and structures?
                            if (cost <= 200) {
                                costMatrix.set(x, y, Math.max(1, cost - highCost))
                            }
                        })
                }

                if (c.id === creep.id) return // don't pathfind through self

                // parked creep
                if (!c.memory.travel || !c.memory.tasks?.length) {
                    costMatrix.set(x, y, 255)
                } else if (c.memory.travel && c.memory.travel.target) {
                    const destinationPosition = utils.objectToPosition(c.memory.travel.destination)

                    // creeps end point, try to avoid
                    if (c.pos.isEqualTo(destinationPosition)) {
                        costMatrix.set(destinationPosition.x, destinationPosition.y, 255)
                    } else {
                        const cost = costMatrix.get(destinationPosition.x, destinationPosition.y)
                        costMatrix.set(destinationPosition.x, destinationPosition.y, Math.min(255, cost + 20))
                    }
                }
            })

        return costMatrix
    }
}
