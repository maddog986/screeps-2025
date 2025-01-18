import { CreepBaseClass, JOB, ROLE } from './creeps/CreepBaseClass'
import { walkablePositions } from './utils'

export enum ASSIGNMENT {
    assist = 'assist',
    build = 'build',
    harvest = 'harvest',
    idle = 'idle',
    refill_builder = 'refill_builder',
    refill_upgrader = 'refill_upgrader',
    refill_spawn = 'refill_spawn',
    repair = 'repair',
    transfer = 'transfer',
    upgrade_controller = 'upgrade_controller',
    withdraw_harvester = 'withdraw_harvester',
}

export const CREEP_ASSIGNMENTS = {
    'assist': function (this: CreepBaseClass): boolean {
        const mules_assisting = Object.values(Game.creeps)
            .filter(({ memory: { role, job, target } }) => role === ROLE.mule && job === JOB.assist)

        // find a creep to assist
        const target = this.creep.pos.findClosestByPath(FIND_MY_CREEPS, {
            filter: ({ id, body, pos, memory: { role, target, move } }) => {
                if (!target || move === OK || body.some(({ type }) => type === MOVE)) return false

                // make sure no other creeps are already assisting
                const assisting = mules_assisting.find(({ memory: { target } }) => target === id)
                if (assisting) return false

                const target_object = Game.getObjectById(target)
                if (!target_object) return false

                const distance = pos.getRangeTo(target_object as any)
                if (distance <= 1) return false

                if (target_object instanceof StructureController) {
                    return distance > 3
                }

                return distance > 1
            }
        })

        if (target) {
            this.setTarget(target, JOB.assist)
            return true
        }

        return false
    },

    'build': function (this: CreepBaseClass): boolean {
        // construction sites
        const targets = this.creep.room.find(FIND_MY_CONSTRUCTION_SITES)
            // order by most done
            .sort((a, b) => b.progress - a.progress)
            // get first one
            .slice(0, 1)

        if (targets.length > 0) {
            this.setTarget(targets[0], JOB.build)
            return true
        }

        return false
    },

    'harvest': function (this: CreepBaseClass): boolean {
        const creeps = Object.values(Game.creeps).filter(({ memory: { role, job, target } }) => role === ROLE.harvester && job === JOB.harvest)

        // find a energy source
        const target = this.creep.pos.findClosestByPath(FIND_SOURCES, {
            filter: (source) => source.energy > 0 && walkablePositions(source, 1) > creeps.length
        })

        if (target) {
            this.setTarget(target, JOB.harvest)
            return true
        }

        return false
    },

    'idle': function (this: CreepBaseClass): boolean {
        // do nothing
        // TODO: make sure creep isnt the way of something
        return true
    },

    'refill_builder': function (this: CreepBaseClass): boolean {
        const mules = Object.values(Game.creeps)
            .filter(({ memory: { role, job, target } }) => role === ROLE.mule && job === JOB.transfer)

        const creeps = Object.values(Game.creeps)
            .filter((creep) => {
                const { my, id, body, store, memory: { role } } = creep

                // dont target last target
                if (!my || this.last_target === id) return false

                // must be a certain role
                if (role !== ROLE.builder) return false

                // how much energy does the creep use per tick
                const energy_use_per_tick = body.filter(({ type }) => type === WORK).length * 2

                // get range to creep
                const rangeTo = this.creep.pos.getRangeTo(creep)

                // how much energy does the creep use before we can reach it
                const energy_use_given_distance = energy_use_per_tick * rangeTo

                return (
                    // only go to creep that will be close to empty before we get there
                    (rangeTo < 3 || store.getUsedCapacity(RESOURCE_ENERGY) < energy_use_given_distance) &&
                    // no other mules assigned
                    mules.some(({ memory: { target } }) => target === id) === false
                )
            })
            // sort by distance most empty first
            .sort((a, b) => a.store.getUsedCapacity(RESOURCE_ENERGY) - b.store.getUsedCapacity(RESOURCE_ENERGY))

        if (creeps.length) {
            this.setTarget(creeps[0], JOB.transfer)
            return true
        }

        return false
    },

    'refill_upgrader': function (this: CreepBaseClass): boolean {
        const mules = Object.values(Game.creeps)
            .filter(({ memory: { role, job, target } }) => role === ROLE.mule && job === JOB.transfer)

        const creeps = Object.values(Game.creeps)
            .filter((creep) => {
                const { my, id, body, store, memory: { role } } = creep

                // dont target last target
                if (!my || this.last_target === id) return false

                // must be a certain role
                if (role !== ROLE.upgrader) return false

                // how much energy does the creep use per tick
                const energy_use_per_tick = body.filter(({ type }) => type === WORK).length * 2

                // get range to creep
                const rangeTo = this.creep.pos.getRangeTo(creep)

                // how much energy does the creep use before we can reach it
                const energy_use_given_distance = energy_use_per_tick * (rangeTo + 2)

                return (
                    // only go to creep that will be close to empty before we get there
                    (rangeTo < 3 || store.getUsedCapacity(RESOURCE_ENERGY) < energy_use_given_distance) &&
                    // no other mules assigned
                    mules.some(({ memory: { target } }) => target === id) === false
                )
            })
            // sort by distance most empty first
            .sort((a, b) => a.store.getUsedCapacity(RESOURCE_ENERGY) - b.store.getUsedCapacity(RESOURCE_ENERGY))

        // no upgraders with free capacity
        if (creeps.length === 0) {
            return false
        }

        if (creeps.length > 0) {
            this.setTarget(creeps[0], JOB.transfer)
            return true
        }

        return false
    },

    'repair': function (this: CreepBaseClass): boolean {
        // only check for repairs every 5 ticks
        if (Game.time % 6 !== 0) {
            return false
        }

        // find repairable structure
        const target_repair = this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: ({ hits, hitsMax }) => hits < hitsMax
        })

        if (target_repair) {
            this.setTarget(target_repair, JOB.repair)
            return true
        }

        return false
    },

    'refill_spawn': function (this: CreepBaseClass): boolean {
        // get all spawns and extensions
        const targets = this.creep.room.find(FIND_MY_STRUCTURES, {
            filter: ({ structureType }) => structureType === STRUCTURE_SPAWN || structureType === STRUCTURE_EXTENSION
        })
            // sort by structureType, spawns first
            .sort((a, b) => a.structureType === STRUCTURE_SPAWN ? -1 : 1)

        // transfer resources to a spawn
        const target = targets.find((target: any) => (target instanceof StructureSpawn && target.store.getFreeCapacity(RESOURCE_ENERGY) > 0) || (target instanceof StructureExtension && target.store.getFreeCapacity(RESOURCE_ENERGY) > 0))

        if (target) {
            this.setTarget(target, JOB.transfer)
            return true
        }

        return false
    },

    'transfer': function (this: CreepBaseClass): boolean {
        // transfer resources to another creep
        const target = this.creep.pos.findClosestByPath(FIND_MY_CREEPS, {
            filter: ({ id, memory: { role, job, transfer }, store }) => store.getFreeCapacity(RESOURCE_ENERGY) >= 5 &&
                // dont transfer to a creep doing an assist job, it will slow them down
                job !== JOB.assist &&
                [ROLE.mule, ROLE.builder].includes(role) &&
                this.last_target !== id
        })

        if (target) {
            this.setTarget(target, JOB.transfer)
            return true
        }

        return false
    },

    'upgrade_controller': function (this: CreepBaseClass): boolean {
        // upgrade controller
        const target_controller = this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: ({ structureType }) => structureType === STRUCTURE_CONTROLLER
        })

        if (target_controller) {
            this.setTarget(target_controller, JOB.upgrade_controller)
            return true
        }

        return false
    },

    'withdraw_harvester': function (this: CreepBaseClass): boolean {
        const withdraw_from = [ROLE.harvester]

        if (this.creep.memory.role !== ROLE.mule) {
            withdraw_from.push(ROLE.mule)
        }

        // take resources from another creep
        const target = this.creep.pos.findClosestByPath(FIND_MY_CREEPS, {
            filter: ({ id, memory: { role, transfer, job }, store }) => store.getUsedCapacity(RESOURCE_ENERGY) >= 5 &&
                job !== JOB.transfer &&
                withdraw_from.includes(role) &&
                this.creep.id !== id
        })

        if (target) {
            this.setTarget(target, JOB.withdraw)
            return true
        }

        return false
    },
}
