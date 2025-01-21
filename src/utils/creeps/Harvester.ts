import utils from 'utils/utils'
import { ASSIGNMENT, CreepBaseClass, JOB, ROLE } from './CreepBaseClass'

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
                return acc + utils.walkablePositions(s.pos, 1)
            }, 0)

        let body: BodyPartConstant[] = [WORK, CARRY, MOVE]

        if (room.controller && room.controller.level >= 2) {
            let ticks_until_empty = 0

            while (ticks_until_empty <= 220) {
                source_walkable_positions -= 0.50
                body = utils.createBody(mule_counts > 0 ? [WORK, CARRY, CARRY] : [WORK, CARRY, MOVE], room_energy)

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

        // can an find energy source
        if (!has_move_part || this.hasFreeCapacity()) {
            this.findJob([ASSIGNMENT.harvest])
        }

        // can the creep do something with stored energy?
        if (has_move_part && this.hasUsedCapacity()) {
            // count mules spawned
            const mules = utils.creeps({ role: ROLE.mule }).length

            if (mules === 0) {
                this.findJob([ASSIGNMENT.refill_spawn])
            }
        }
    }

    harvest(): any {
        // if (this.target && this.creep.memory.target_time && this.creep.memory.target_time > 0) {
        //     if (this.target instanceof Source && this.target.energy === 0) {
        //         return false // wait for energy to come back
        //     }
        // }

        // if (this.target instanceof Source && this.target.energy === 0) {
        //     return this.clearTarget() // wait for energy to come back
        // }

        const work_parts = this.creep.body.filter(({ type }) => type === WORK).length
        const move_parts = this.creep.body.filter(({ type }) => type === MOVE).length

        if (move_parts === 0 && this.creep.store.getFreeCapacity() < work_parts * HARVEST_POWER) {
            return
        }

        super.harvest()
    }

    run() {
        super.run()

        // if already transfered, return
        if (this.transfer_code === OK) {
            return
        }

        // if hasent worked, find a nearby construction site
        if (this.creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0 && this.work_code !== OK) {
            const construction_site = this.creep.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 4).shift()

            if (construction_site) {
                this.work_code = this.creep.build(construction_site)
            }

            if (this.work_code !== OK) {
                // find something to repair
                const repair = this.creep.pos.findInRange(FIND_STRUCTURES, 3, {
                    filter: (s) => s.hits < s.hitsMax
                }).shift()

                if (repair) {
                    this.work_code = this.creep.repair(repair)
                }
            }
        }

        // find a mule creep nearby to transfer to
        const mule = this.creep.pos.findClosestByPath(FIND_MY_CREEPS, {
            filter: ({ memory: { role, transfer, job }, store }) => store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
                [ROLE.mule, ROLE.builder, ROLE.upgrader].includes(role as any) && job !== JOB.assist
        })

        if (mule) {
            this.transfer_code = this.creep.transfer(mule, RESOURCE_ENERGY)

            // if mules target is self, clear target
            if (mule.memory.target === this.creep.id) {
                delete mule.memory.job
                delete mule.memory.target
            }
        }

        // if already transfered, return
        if (this.transfer_code === OK) {
            return
        }

        // find a harvester nearby to transfer a small amount to
        const harvester = this.creep.pos.findClosestByPath(FIND_MY_CREEPS, {
            filter: ({ memory: { role }, store }) => store.getFreeCapacity(RESOURCE_ENERGY) >= 5 &&
                role === ROLE.harvester
        })

        if (harvester) {
            this.transfer_code = this.creep.transfer(harvester, RESOURCE_ENERGY, Math.min(5, harvester.store.getFreeCapacity(RESOURCE_ENERGY), this.creep.store.getUsedCapacity(RESOURCE_ENERGY)))
        }

        // if already transfered, return
        if (this.transfer_code === OK) {
            return
        }

        // pickup dropped energy if not full
        if (this.creep.store.getFreeCapacity() > 0 && this.pickup_code !== OK) {
            const dropped_energy = this.creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                filter: ({ resourceType }) => resourceType === RESOURCE_ENERGY
            })
            if (dropped_energy) {
                this.pickup_code = this.creep.pickup(dropped_energy)
            }
        }

        // find a nearby container to transfer to
        const container = this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: (c) => c.structureType === STRUCTURE_CONTAINER && c.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        })

        if (container) {
            this.transfer_code = this.creep.transfer(container, RESOURCE_ENERGY)
        }
    }
}
