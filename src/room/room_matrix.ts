import utils from 'utils/utils'
import RoomSpawnManager from './room_spawn'

export default class RoomMatrix extends RoomSpawnManager {
    matrix: CostMatrix
    terrain: RoomTerrain

    public structures: AnyStructure[]
    public containers: AnyStructure[]
    public constructions: ConstructionSite<BuildableStructureConstant>[]
    public sources: Source[]
    public controllerLevel: number
    public spawn: StructureSpawn

    constructor(room: Room) {
        super(room)

        this.sources = this.getContext('sources') //this.room.find(FIND_SOURCES)
        this.constructions = this.getContext('constructionSites') // this.room.find(FIND_MY_CONSTRUCTION_SITES)
        this.structures = this.getContext('structures') // this.room.find(FIND_STRUCTURES)
        this.containers = this.getContext('containers') // this.allStructures.filter(({ structureType }) => structureType === STRUCTURE_CONTAINER)
        this.controllerLevel = this.getContext('controllerLevel')
        this.spawn = this.spawns[0]

        this.terrain = Game.map.getRoomTerrain(this.room.name)
        this.matrix = new PathFinder.CostMatrix()

        this.buildRoomCostMatrix()

        this.log(`**RoomMatrix:** ${this.room.name} matrix built.`)
    }

    getMatrix(creep: Creep, options: TravelerOptions = {}): CostMatrix {
        // console.log('**RoomMatrix:** getMatrix', creep)
        this.log(`**RoomMatrix:** ${this.room.name} matrix built for creep ${creep.name}.`)
        return this.buildRoomCreepMatrix(creep, options)
    }

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

        // set swamp and plain costs
        utils.getGridNeighbors(0, 0, 50)
            // remap with terrain type
            .map(([x, y]) => ({ x, y, type: this.terrain.get(x, y) }))
            // set costs
            .forEach(({ x, y, type }) => {
                const cost = this.matrix.get(x, y)

                switch (type) {
                    case TERRAIN_MASK_WALL:
                        this.matrix.set(x, y, 255)

                        // get all positions around the wall to increase cost
                        utils.getNeighbors(x, y, 1)
                            // remove out of bounds
                            .filter(([x, y]) => x >= 0 && x < 50 && y >= 0 && y < 50)
                            // remap
                            .map(([x, y]) => ({ x, y, cost: this.matrix.get(x, y) }))
                            // set new cost
                            .forEach(({ x, y, cost }) => {
                                this.matrix.set(x, y, Math.min(255, cost + highCost))
                            })
                        break
                    case TERRAIN_MASK_SWAMP:
                        this.matrix.set(x, y, Math.min(255, cost + swampCost))
                        break
                    case 0:
                        this.matrix.set(x, y, Math.min(255, cost + plainCost))
                        break
                }
            })

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

        // Mark positions around spawns
        this.spawns.forEach(s => {
            // get all positions around the target
            utils.getNeighbors(s.pos.x, s.pos.y, 1)
                // remove out of bounds
                .filter(([x, y]) => x >= 0 && x < 50 && y >= 0 && y < 50)
                // ignore walls
                .filter(([x, y]) => this.terrain.get(x, y) === TERRAIN_MASK_WALL)
                // remap with existing cost
                .map(([x, y]) => ({ x, y, cost: this.matrix.get(x, y) }))
                // set new cost
                .forEach(({ x, y, cost }) => {
                    this.matrix.set(x, y, Math.min(255, cost + highCost))
                })
        })

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
    }

    private buildRoomCreepMatrix(creep: Creep, options: TravelerOptions = {}): CostMatrix {
        const costMatrix = this.matrix.clone()

        const {
            highCost = 8,           // Default high cost
            ignoreCreeps = false,   // Default ignore creeps
            ...TRAVELER_DEFAULT
        } = options

        if (ignoreCreeps) return costMatrix

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
