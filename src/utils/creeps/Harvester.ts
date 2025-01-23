import { CONFIG } from 'config'
import utils from 'utils/utils'
import { CreepBaseClass, JOBS, ROLE } from './CreepBaseClass'

export default class Harvester extends CreepBaseClass {
    static loadout(room: Room) {
        let room_energy = Math.min(700, room.energyCapacityAvailable)
        let sources = room.find(FIND_SOURCES_ACTIVE)

        const room_creeps = utils.creeps({ room: room.name, ticksToLive: 100 })
        const full_harvesters = room_creeps.filter(({ store, memory: { role } }) => role === ROLE.harvester && !store.getFreeCapacity()).length
        if (full_harvesters) return { max: 0, body: [] }

        const mule_counts = room_creeps
            .filter(({ memory: { role } }) => role === ROLE.mule)
            .length

        let source_walkable_positions = sources
            .reduce((acc, s) => {
                return acc + Math.min(CONFIG.maxHarvestersPerSource, utils.walkablePositions(s.pos, 1))
            }, 0)

        let body: BodyPartConstant[] = [WORK, CARRY, MOVE]

        // is there a container near all the sources?
        const containers_at_sources = sources
            .map((source) => source.pos.findInRange(FIND_STRUCTURES, 1, {
                filter: (s) => s.structureType === STRUCTURE_CONTAINER
            }))
            .filter((containers) => containers.length).length === sources.length

        if (room.controller && room.controller.level >= 2) {
            let ticks_until_empty = 0

            while (ticks_until_empty <= 220) {
                source_walkable_positions -= 0.50

                if (containers_at_sources && mule_counts === 0) {
                    body = utils.createBody([WORK, CARRY, MOVE], room_energy)
                } else if (containers_at_sources && mule_counts > 0) {
                    body = utils.createBody([WORK, WORK, CARRY], room_energy)
                } else if (mule_counts === 0) {
                    body = utils.createBody([WORK, CARRY, MOVE], room_energy)
                } else {
                    body = utils.createBody([WORK, CARRY, CARRY], room_energy)
                }

                const work_parts_total = body.filter((part) => part === WORK).length
                const energy_per_tick = work_parts_total * HARVEST_POWER * Math.ceil(source_walkable_positions)

                ticks_until_empty = sources.length * SOURCE_ENERGY_CAPACITY / energy_per_tick
            }
        }

        return {
            max: Math.ceil(source_walkable_positions),
            body
        }
    }

    findTarget() {
        const has_move_part = this.creep.body.some(({ type }) => type === MOVE)

        this.findJob([JOBS.renew])
        if (this.target) return

        // can an find energy source
        if (!has_move_part || this.hasFreeCapacity()) {
            this.findJob([JOBS.harvest])
        }

        // can the creep do something with stored energy?
        if (has_move_part && this.hasUsedCapacity()) {
            // count mules spawned
            const mules = utils.creeps({ role: ROLE.mule }).length

            if (mules === 0) {
                this.findJob([JOBS.refill_spawn])
            }
        }
    }

    harvest(target: Source): any {
        // signal to renew if lifeTime is low
        if (this.creep.ticksToLive && this.creep.ticksToLive <= CONFIG.autoRenewCreepLevel) {
            return this.removeTarget(target)
        }

        // if (this.target && this.creep.memory.target_time && this.creep.memory.target_time > 0) {
        //     if (this.target instanceof Source && this.target.energy === 0) {
        //         return false // wait for energy to come back
        //     }
        // }

        // if (this.target instanceof Source && this.target.energy === 0) {
        //     return this.removeTarget() // wait for energy to come back
        // }

        // const work_parts = this.creep.body.filter(({ type }) => type === WORK).length
        // const move_parts = this.creep.body.filter(({ type }) => type === MOVE).length

        // if (move_parts === 0 && this.creep.store.getFreeCapacity() < work_parts * HARVEST_POWER) {
        //     const spawn = this.creep.room.find(FIND_MY_SPAWNS).shift()

        //     const source = this.creep.room.find(FIND_SOURCES_ACTIVE)
        //         // find closest to spawn
        //         .sort((a, b) => a.pos.getRangeTo(spawn!.pos) - b.pos.getRangeTo(spawn!.pos))
        //         .shift()

        //     if (source && source.id !== this.creep.memory.target) {
        //         // does source have positions left?
        //         const walkable_positions = utils.walkablePositions(source.pos, 1)
        //         const harvesters_assigned = utils.creeps({ target: source.id }).length

        //         if (walkable_positions > harvesters_assigned) {
        //             this.creep.memory.target = source.id
        //         }
        //     }

        //     return
        // }

        super.job_harvest(target)
    }

    run() {
        super.run()

        // pickup dropped energy if not full
        if (this.pickup_code !== OK && this.hasFreeCapacity()) {
            const dropped_energy = this.creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                filter: ({ resourceType }) => resourceType === RESOURCE_ENERGY
            })
            if (dropped_energy) {
                this.pickup_code = this.creep.pickup(dropped_energy)
            }
        }

        // if no work was done, find a nearby construction site
        if (this.work_code !== OK && this.hasUsedCapacity()) {
            const construction_sites = this.creep.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 4)

            if (construction_sites.length) {
                this.work_code = this.creep.build(construction_sites[0])
            }

            if (this.work_code !== OK) {
                // find something to repair
                const repairs = this.creep.pos.findInRange(FIND_STRUCTURES, 3, {
                    filter: (s) => s.hits < s.hitsMax
                })

                if (repairs.length) {
                    this.work_code = this.creep.repair(repairs[0])
                }
            }
        }

        // find a nearby container to transfer to
        if (this.transfer_code !== OK && this.hasUsedCapacity()) {
            const container = this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: (c) => c.structureType === STRUCTURE_CONTAINER && c.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            })

            if (container) {
                this.transfer_code = this.creep.transfer(container, RESOURCE_ENERGY)
            }
        }

        // find a mule creep nearby to transfer to
        if (this.transfer_code !== OK) {
            const mules = utils.creeps({ inRange: [this.creep.pos, 1], role: [ROLE.mule, ROLE.builder, ROLE.upgrader], job_not: JOBS.assist })

            if (mules.length) {
                const mule = mules[0]

                this.transfer_code = this.creep.transfer(mule, RESOURCE_ENERGY)
                // console.log(`${this.creep.name} transfer to ${mule.name} code: ${this.transfer_code}`)

                // if mules target is self, clear target
                if (mule.memory.target === this.creep.id || (mule.memory.job === JOBS.withdraw && mule.store.getFreeCapacity() === 0)) {
                    delete mule.memory.job
                    delete mule.memory.target
                }
            }
        }

        // if already transfered, return
        if (this.transfer_code !== OK) {
            const harvesters = utils.creeps({ inRange: [this.creep.pos, 1], role: [ROLE.harvester], freeCapacity: 10 })

            if (harvesters.length) {
                const harvester = harvesters[0]
                this.transfer_code = this.creep.transfer(harvester, RESOURCE_ENERGY, Math.min(10, harvester.store.getFreeCapacity(RESOURCE_ENERGY), this.creep.store.getUsedCapacity(RESOURCE_ENERGY)))
            }
        }
    }
}
