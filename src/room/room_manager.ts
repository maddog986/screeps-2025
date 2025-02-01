import { cpuLog } from 'utils/cache'
import RoomBuilder from './room_builder'

declare global {
    interface Room {
        _manager?: RoomManager
        manager: RoomManager
    }
}

// extend Room prototype
if (!Room.prototype._manager) {
    Object.defineProperty(Room.prototype, 'manager', {
        get: function (): RoomManager {
            if (!this._manager) {
                this._manager = new RoomManager(this)
            }
            return this._manager
        },
    })
}

interface RoomManagerContext {
    creepsIdle: Creep[]
    containerNearSource: StructureContainer[]
    harvestersAtSource: Creep[]
    refillableStructures: Structure<StructureConstant>[]
    refillableStructuresNotOverAssigned: Structure<StructureConstant>[]
    conatinersNearSpawn: StructureContainer[]
}

export default class RoomManager<TContext extends Record<string, any> = {}> extends RoomBuilder<TContext & RoomManagerContext> {
    creepsIdle: Creep[]

    containerNearSource: StructureContainer[]
    conatinersNearSpawn: StructureContainer[]
    harvestersAtSource: Creep[]
    refillableStructures: Structure<StructureConstant>[]
    refillableStructuresNotOverAssigned: Structure<StructureConstant>[]
    towers: StructureTower[]
    creepsNeedHealing: Creep[]
    droppedResources: Resource<ResourceConstant>[]
    sourcePositions: number
    tombstones: Tombstone[]

    constructor(room: Room) {
        super(room)

        this.creepsIdle = []
        this.containerNearSource = []
        this.conatinersNearSpawn = []
        this.harvestersAtSource = []
        this.refillableStructures = []
        this.refillableStructuresNotOverAssigned = []
        this.towers = []
        this.creepsNeedHealing = []
        this.droppedResources = []
        this.sourcePositions = 0
        this.tombstones = []

        // needs to be my room
        if (!room.controller?.my) {
            return
        }



        this.towers = this.getContext('towers', true)
        this.droppedResources = this.getContext('droppedResources', true)

        this.creepsIdle = this.creeps
            .filter((creep) => !creep.memory.tasks || creep.memory.tasks.length === 0)

        this.creepsNeedHealing = this.creeps
            .filter((creep) => creep.hits < creep.hitsMax)

        this.containerNearSource = this.containers
            .filter(this.filterByNear(this.sources))

        this.conatinersNearSpawn = this.containers
            .filter(this.filterByNear(this.spawns))

        // harvesters at source
        this.harvestersAtSource = this.creeps
            .filter((creep) => (creep.memory.role === 'harvester' || creep.manager.hasTask('harvest')) && !creep.memory.travel)

        this.refillableStructures = this.getContext('structures', true)
            .filter(this.filterByStructureType([STRUCTURE_EXTENSION, STRUCTURE_SPAWN, STRUCTURE_TOWER]))
            .filter(this.getFreeCapacity)

        this.refillableStructuresNotOverAssigned = this.refillableStructures
            .filter(this.isNotOverAssignedTo('transfer').bind(this))

        this.sourcePositions = this.sources.reduce((a, b) => a + this.walkablePositions(b), 0)

        this.tombstones = this.room.find(FIND_TOMBSTONES).filter(t => t.store.getUsedCapacity(RESOURCE_ENERGY) > 0)

        this.setContext('sourcePositions', this.sourcePositions)
        this.setContext('creepsIdle', this.creepsIdle)
        this.setContext('creepsNeedHealing', this.creepsNeedHealing)
        this.setContext('containerNearSource', this.containerNearSource)
        this.setContext('harvestersAtSource', this.harvestersAtSource)
        this.setContext('refillableStructures', this.refillableStructures)
        this.setContext('refillableStructuresNotOverAssigned', this.refillableStructuresNotOverAssigned)
        this.setContext('conatinersNearSpawn', this.conatinersNearSpawn)

        this.log(`**RoomManager** context keys added:`, {
            creepsIdle: this.creepsIdle.length,
            refillableStructures: this.refillableStructures,
            harvestersAtSource: this.harvestersAtSource.length,
            containerNearSource: this.containerNearSource.length,
            conatinersNearSpawn: this.conatinersNearSpawn.length,
            refillableStructuresNotOverAssigned: this.refillableStructuresNotOverAssigned.length
        })

        // towers need to attack
        this.manageTowers()

        // have creeps pickup dropped resources near by
        this.pickupResources()

        // have a harvester transfer resources to a container near a source
        this.harvesterTransferToContainer()

        // builders/mules can vampire energy from harvesters
        this.vampireCreeps()

        // figure out what to do with idle creeps
        this.idleCreeps()
    }

    @cpuLog
    private manageTowers() {
        for (const tower of this.towers) {
            if (this.enemies.length) {
                const result = tower.attack(this.enemies[0])
                this.log(`Tower attacking enemy: ${this.enemies[0].name}: ${result}`)
                continue
            }

            if (this.creepsNeedHealing.length) {
                const creep = this.creepsNeedHealing[0]
                const result = tower.heal(creep)
                this.log(`Tower healing creep: ${creep.name}: ${result}`)
                continue
            }
        }
    }

    @cpuLog
    private pickupResources() {
        this.droppedResources.forEach(resource => {
            const creepsNearBy = this.creeps.filter(creep => creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
                creep.pos.inRangeTo(resource, 1)
            )

            creepsNearBy.forEach(creep => {
                const transfer = creep.pickup(resource)
                if (transfer === OK) {
                    creep.manager.completed.add('transfer')
                }
            })
        })
    }

    @cpuLog
    private idleCreeps() {
        const totalMules = this.creeps.filter(c => c.memory.role === 'mule').length

        // have an idle creep transfer resources from a container near a source to a container near a spawn
        this.creepsIdle
            // only creeps with carry wanted
            .filter(c => c.body.some(p => p.type === CARRY))
            // looping through all creeps
            .forEach(creep => {
                this.setContext('creep', creep) // set context for this creep

                const tombstones = this.tombstones
                    .filter(this.filterByHasUsedCapacity.bind(this))
                    .filter(this.isNotOverAssignedTo('withdraw').bind(this))

                const containerNearSourceWithUsedCapacity = this.containerNearSource
                    .filter(this.filterByHasUsedCapacity.bind(this))
                    .filter(this.isNotOverAssignedTo('withdraw').bind(this))

                const conatinersNearSpawnWithFreeCapacity = this.conatinersNearSpawn
                    .filter(this.filterByHasFreeCapacity.bind(this))
                    .filter(this.isNotOverAssignedTo('transfer').bind(this))

                const conatinersNearSpawnWithUsedCapacity = this.conatinersNearSpawn
                    .filter(this.filterByHasUsedCapacity.bind(this))
                    .filter(this.isNotOverAssignedTo('withdraw').bind(this))

                const refillableStructures = this.refillableStructuresNotOverAssigned
                    .filter(this.isNotOverAssignedTo('transfer').bind(this))

                const creepsAssignedToHarvest = this.creeps.filter(c => c.manager.hasTask('harvest')).length
                const sourcesNoPositions = this.sourcePositions - creepsAssignedToHarvest <= 0

                // console.log(creep.name, `sourcePositions: ${this.sourcePositions} creepsAssignedToHarvest: ${creepsAssignedToHarvest} sourcesNoPositions: ${sourcesNoPositions ? 'true' : 'false'}`)
                const fillInAsMule = totalMules === 0 || creep.memory.role === 'mule'

                // free needs energy
                if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
                    // refill structures using spawn container
                    if (refillableStructures.length && (conatinersNearSpawnWithUsedCapacity.length || containerNearSourceWithUsedCapacity.length) && fillInAsMule) {
                        const refillable = refillableStructures
                            // sort by range of creep, sortest first
                            .sort(this.sortByCreepRange.bind(this))
                            // grab closest
                            .shift() as Structure<StructureConstant>

                        const container = [...conatinersNearSpawnWithUsedCapacity, ...containerNearSourceWithUsedCapacity]
                            // sort by range of creep, sortest first
                            .sort((a, b) => a.pos.getRangeTo(refillable) - b.pos.getRangeTo(refillable))
                            // closest first
                            .shift() as Structure<StructureConstant>

                        creep.manager.addTask({
                            action: 'withdraw',
                            id: container.id,
                            blocking: true // block transfer request until withdraw is done
                        })

                        creep.manager.addTask({
                            action: 'transfer',
                            id: refillable.id,
                        })
                    }


                    // refill a spawn container from source container
                    else if (containerNearSourceWithUsedCapacity.length && conatinersNearSpawnWithFreeCapacity.length && fillInAsMule) {
                        const refillable = conatinersNearSpawnWithFreeCapacity
                            // sort by range of creep, sortest first
                            .sort(this.sortByCreepRange.bind(this))
                            // grab closest
                            .shift() as Structure<StructureConstant>

                        const container = containerNearSourceWithUsedCapacity
                            // sort by range of creep, sortest first
                            .sort((a, b) => a.pos.getRangeTo(refillable) - b.pos.getRangeTo(refillable))
                            // closest first
                            .shift() as Structure<StructureConstant>

                        creep.manager.addTask({
                            action: 'withdraw',
                            id: container.id,
                            blocking: true
                        })

                        creep.manager.addTask({
                            action: 'transfer',
                            id: refillable.id,
                        })
                    }


                    // else if ((containerNearSourceWithUsedCapacity.length || conatinersNearSpawnWithUsedCapacity.length) && !['harvester', 'mule'].includes(creep.memory.role)) {
                    //     const containers = [...conatinersNearSpawnWithUsedCapacity, ...containerNearSourceWithUsedCapacity]
                    //         // sort by range of creep, sortest first
                    //         .sort(this.sortByCreepRange.bind(this))
                    //     console.log(`4): containers(${containers.length}):`, containers[0])
                    //     creep.manager.addTask({
                    //         action: 'withdraw',
                    //         id: containers[0].id,
                    //         blocking: true
                    //     })
                    // }
                    // pickup tombstones
                    else if (tombstones.length && fillInAsMule) {
                        const tombstone = tombstones
                            // sort by range of creep, sortest first
                            .sort(this.sortByCreepRange.bind(this))
                            // grab closest
                            .shift() as Tombstone

                        creep.manager.addTask({
                            action: 'withdraw',
                            id: tombstone.id,
                        })
                    }

                    // withdraw from a source container
                    else if (containerNearSourceWithUsedCapacity.length && !fillInAsMule) {
                        const container = containerNearSourceWithUsedCapacity
                            // sort by range of creep, sortest first
                            .sort(this.sortByCreepRange.bind(this))
                            .shift() as StructureContainer

                        creep.manager.addTask({
                            action: 'withdraw',
                            id: container.id,
                            blocking: true
                        })
                    }

                    // // withdraw from a source container if a mule
                    // else if (containerNearSourceWithUsedCapacity.length && (sourcesNoPositions || ['mule'].includes(creep.memory.role))) {
                    //     const containers = containerNearSourceWithUsedCapacity
                    //         // sort by range of creep, sortest first
                    //         .sort(this.sortByCreepRange.bind(this))
                    //     console.log(`5): containers(${containers.length}):`, containers[0])
                    //     creep.manager.addTask({
                    //         action: 'withdraw',
                    //         id: containers[0].id,
                    //         blocking: true
                    //     })
                    // }
                    // }
                }


                // creep has energy
                else {
                    // transfer into a refillable Structure
                    if (refillableStructures.length && fillInAsMule) {
                        const refillable = refillableStructures
                            // sort by range of creep, sortest first
                            .sort(this.sortByCreepRange.bind(this))
                            .shift() as Structure

                        creep.manager.addTask({
                            action: 'transfer',
                            id: refillable.id,
                        })
                    }


                    // refill spawn container
                    else if (conatinersNearSpawnWithFreeCapacity.length) {
                        const refillable = conatinersNearSpawnWithFreeCapacity
                            // sort by range of creep, sortest first
                            .sort(this.sortByCreepRange.bind(this))
                            .shift() as Structure

                        creep.manager.addTask({
                            action: 'transfer',
                            id: refillable.id,
                        })
                    }


                    // park the mule somewhere near the spawn
                    else if (['mule'].includes(creep.memory.role) && this.conatinersNearSpawn.length) {
                        creep.manager.addTask({
                            action: 'move',
                            pos: this.conatinersNearSpawn[0].pos,
                        })
                    }


                    // else if (containerNearSourceWithUsedCapacity.length && creep.store.getFreeCapacity() > 0) {
                    //     const container = containerNearSourceWithUsedCapacity
                    //         // sort by range of creep, sortest first
                    //         .sort(this.sortByCreepRange.bind(this))
                    //     // withdraw from a source container
                    //     creep.manager.addTask({
                    //         action: 'withdraw',
                    //         id: container[0].id,
                    //     })
                    // }
                }
            })
    }

    @cpuLog
    private vampireCreeps() {
        const vampireCreeps = this.creeps.filter(c => ['builder', 'mule'].includes(c.memory.role))
        const harvesters = this.creeps.filter(c => c.memory.role === 'harvester' &&
            c.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
            !c.manager.completed.has('transfer')
        )
        for (const creep of vampireCreeps) {
            if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) continue

            const harvestersNearBy = harvesters.filter(c => c.pos.inRangeTo(creep, 1))
                // smallest first
                .sort(this.sortByUsedCapacity.bind(this))
                // reverse so we get largest first
                .reverse()

            if (harvestersNearBy.length) {
                const transfer = harvestersNearBy[0].transfer(creep, RESOURCE_ENERGY)
                if (transfer === OK) {
                    creep.manager.completed.add('transfer')
                    break
                }
            }
        }
    }

    @cpuLog
    private harvesterTransferToContainer() {
        if (this.refillableStructures.length === 0) {
            this.containerNearSource.forEach(container => {
                const creepsNearBy = this.creeps.filter(creep => creep.memory.role == 'harvester' &&
                    !creep.manager.completed.has('transfer') &&
                    !creep.memory.travel &&
                    creep.manager.hasTask('harvest') &&
                    creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
                    creep.pos.inRangeTo(container, 1)
                )

                creepsNearBy.forEach(creep => {
                    const transfer = creep.transfer(container, RESOURCE_ENERGY)
                    if (transfer === OK) {
                        creep.manager.completed.add('transfer')
                    }
                })
            })
        }
    }
}
