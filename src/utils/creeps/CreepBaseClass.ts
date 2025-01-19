import { walkablePositions } from 'utils/utils'
import { Traveler } from '../Traveler'

export enum ROLE {
    'harvester' = 'harvester',
    'mule' = 'mule',
    'builder' = 'builder',
    'upgrader' = 'upgrader',
};

export enum JOB {
    assist = 'assist',
    build = 'build',
    harvest = 'harvest',
    idle = 'idle',
    repair = 'repair',
    transfer = 'transfer',
    upgrade_controller = 'upgrade_controller',
    withdraw = 'withdraw',
}


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
        const target = this.creep.room.find(FIND_MY_CONSTRUCTION_SITES)
            // order by least done
            .sort((a, b) => a.progress - b.progress)
            // get last one
            .pop()

        if (target) {
            this.setTarget(target, JOB.build)
            return true
        }

        return false
    },

    'harvest': function (this: CreepBaseClass): boolean {
        const creeps_assigned_to_job = Object.values(Game.creeps)
            .filter(({ id, memory: { role, job, target } }) => role === ROLE.harvester && job === JOB.harvest && id !== this.creep.id)

        // find a energy source
        const target = this.creep.pos.findClosestByPath(FIND_SOURCES, {
            filter: (source) =>
                // can this source support another creep?
                walkablePositions(source, 1) > creeps_assigned_to_job.filter(c => c.memory.target === source.id).length
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

        const creep = Object.values(Game.creeps)
            .filter((creep) => {
                const { my, id, body, store, memory: { role } } = creep

                // dont target last target
                if (!my || this.last_target === id) return false

                // must be a certain role
                if (role !== ROLE.builder) return false

                // no other mules assigned
                if (mules.some(({ memory: { target } }) => target === id)) return false

                // get range to creep
                const rangeTo = this.creep.pos.getRangeTo(creep)

                // how much energy does the creep use per tick
                const energy_use_per_tick = body.filter(({ type }) => type === WORK).length * HARVEST_POWER

                // how much energy does the creep use before we can reach it
                const energy_use_given_distance = energy_use_per_tick * (rangeTo + 4)

                // only go to creep that will be close to empty before we get there
                if (rangeTo > 3 && store.getUsedCapacity(RESOURCE_ENERGY) > energy_use_given_distance) return false

                // passed all checks
                return true
            })
            // sort by store most empty last
            .sort((a, b) => b.store.getUsedCapacity(RESOURCE_ENERGY) - a.store.getUsedCapacity(RESOURCE_ENERGY))
            // grab last one
            .pop()

        if (creep) {
            this.setTarget(creep, JOB.transfer)
            return true
        }

        return false
    },

    'refill_upgrader': function (this: CreepBaseClass): boolean {
        const mules = Object.values(Game.creeps)
            .filter(({ memory: { role, job, target } }) => role === ROLE.mule && job === JOB.transfer)

        const creep = Object.values(Game.creeps)
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
                const energy_use_given_distance = energy_use_per_tick * (rangeTo + 4)

                return (
                    // only go to creep that will be close to empty before we get there
                    (rangeTo < 3 || store.getUsedCapacity(RESOURCE_ENERGY) < energy_use_given_distance) &&
                    // no other mules assigned
                    mules.some(({ memory: { target } }) => target === id) === false
                )
            })
            // sort by store most empty last
            .sort((a, b) => b.store.getUsedCapacity(RESOURCE_ENERGY) - a.store.getUsedCapacity(RESOURCE_ENERGY))
            // grab last one
            .pop()

        if (creep) {
            this.setTarget(creep, JOB.transfer)
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

export class CreepBaseClass {
    creep: Creep
    target: _HasId | _HasRoomPosition | undefined | null

    // move: CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND | -100 = -100
    // transfer: ScreepsReturnCode | -100 = -100

    constructor(creep: Creep) {
        this.creep = creep
        this.target = creep.memory.target ? Game.getObjectById(creep.memory.target) : null

        // tick resets
        this.creep.memory.move = -100
        this.creep.memory.transfer = -100
        this.creep.memory.work = -100

        if (this.creep.memory.target_time == undefined) this.creep.memory.target_time = -1

        if (this.target) {
            this.creep.memory.target_time += 1
        }
    }

    get work_code() {
        return this.creep.memory.work ?? -100
    }

    set work_code(work: ScreepsReturnCode | CreepActionReturnCode | -100) {
        this.creep.memory.work = work
    }

    get move_code() {
        return this.creep.memory.move ?? -100
    }

    set move_code(move: CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND | -100) {
        this.creep.memory.move = move
    }

    get transfer_code() {
        return this.creep.memory.transfer ?? -100
    }

    set transfer_code(transfer: ScreepsReturnCode | -100) {
        this.creep.memory.transfer = transfer
    }

    get role() {
        return this.creep.memory.role
    }

    get job() {
        return this.creep.memory.job ? this.creep.memory.job : JOB.idle
    }

    set job(task: JOB) {
        this.creep.memory.job = task
    }

    get last_target() {
        return this.creep.memory.last_target
    }

    setTarget(target: _HasId | undefined | null, job: JOB = JOB.idle) {
        if (target) {
            this.job = job
            this.target = target

            this.creep.memory.target = target.id
            this.creep.memory.target_time = 0
            this.creep.memory.last_target = target.id

            return
        }

        this.clearTarget()
    }

    hasFreeCapacity(resource: ResourceConstant | undefined = undefined) {
        return this.creep.store.getFreeCapacity(resource) > 0
    }

    hasUsedCapacity(resource: ResourceConstant | undefined = undefined) {
        return this.creep.store.getUsedCapacity(resource) > 0
    }

    findJob(find_jobs: ASSIGNMENT[]) {
        if (this.target) return
        return (find_jobs).some((target) => CREEP_ASSIGNMENTS[target].call(this))
    }

    findTarget() {
        // find a target

        if (!this.target) {
            this.clearTarget()
        }
    }

    clearTarget() {
        this.job = JOB.idle
        this.target = null

        this.creep.memory.job = JOB.idle

        delete this.creep.memory.target
        delete this.creep.memory.target_time
    }

    run() {
        if (!this.target) {
            this.clearTarget()
        }

        // find a target if idle
        if (this.job === JOB.idle) {
            this.findTarget()
        }

        // no tasks to complete?
        if (this.job === JOB.idle || !this.target) return

        // complete task
        this[this.job].call(this)

        if (!this.target) {
            this.findTarget()
        }

        if (!this.target) {
            this.clearTarget()
        }
    }

    moveToTarget() {
        if (!this.target) return

        // already done this tick
        if ([OK, ERR_TIRED].includes(this.move_code as any)) {
            return
        }

        // if creep doesnt have a MOVE body part, return
        if (!this.creep.body.some(({ type }) => type === MOVE)) {
            return
        }

        // get all harvers and upgraders that are working so we can ignore their paths
        const working_creeps = Object.values(Game.creeps).filter(({ memory: { job, target_time } }) =>
            [JOB.harvest, JOB.upgrade_controller].includes(job as any) && target_time && target_time > 0
        )

        // move it
        this.move_code = Traveler.travelTo(this.creep, this.target as _HasRoomPosition, {
            ignoreCreeps: true,
            obstacles: working_creeps.map((c) => c),
        })
    }

    assist() {
        // already work done work this tick
        if ([OK, ERR_TIRED].includes(this.move_code as any)) {
            return
        }

        // make sure target is still legit
        if (!this.target || !(this.target instanceof Creep) || !this.target?.memory?.target) {
            this.clearTarget()
            return
        }

        const target_object = Game.getObjectById(this.target.memory.target)
        if (!target_object) {
            this.clearTarget()
            return
        }

        if (!this.creep.pos.isNearTo(this.target as Creep)) {
            // console.log(this.creep.name, 'move to target:', this.target.name)
            this.move_code = this.creep.moveTo(this.target as Creep)
            return
        }

        const target_object_distance = this.creep.pos.getRangeTo(target_object as any) - 1
        const target_required_distance = (target_object instanceof StructureController) ? 3 : 1

        // console.log(this.creep.name, 'target_object_distance:', target_object_distance, 'target_required_distance:', target_required_distance)

        this.target.memory.target_time = (this.target.memory.target_time ?? 0) + 1

        if (target_object_distance >= target_required_distance) {
            // request pull
            this.creep.pull(this.target)
            // accept pull
            this.target.memory.move = this.target.move(this.creep) as CreepMoveReturnCode
            // actual movement
            this.move_code = this.creep.moveTo(target_object as any)

            // draw a room visual between the two creeps
            this.creep.room.visual.line(this.creep.pos, this.target.pos, { color: 'green' })

            return
        }

        // request pull
        this.creep.pull(this.target)
        // accept pull
        this.target.memory.move = this.target.move(this.creep) as CreepMoveReturnCode
        // actual movement
        this.move_code = this.creep.move(this.creep.pos.getDirectionTo(this.target)) as CreepMoveReturnCode

        this.clearTarget()

    }

    build() {
        // empty?
        if (!this.hasUsedCapacity()) {
            this.clearTarget()
            return
        }

        // already work done work this tick
        if ([OK, ERR_TIRED].includes(this.work_code as any)) {
            return
        }

        this.work_code = this.creep.build(this.target as any)

        if ([ERR_INVALID_TARGET, ERR_NOT_ENOUGH_RESOURCES].includes(this.work_code as any) || !this.hasUsedCapacity()) {
            this.clearTarget()
        } else if (this.work_code === ERR_NOT_IN_RANGE) {
            this.moveToTarget()
        }
    }

    harvest() {
        // already work done work this tick
        if ([OK, ERR_TIRED].includes(this.work_code as any)) {
            return
        }

        this.work_code = this.creep.harvest(this.target as Source)

        if ([ERR_NOT_ENOUGH_RESOURCES].includes(this.work_code as any) || !this.hasFreeCapacity()) {
            this.clearTarget()
        } else if (this.work_code === ERR_NOT_IN_RANGE) {
            this.moveToTarget()
        }
    }

    idle(): void {
        // do nothing
    }

    repair(): void {
        // empty?
        if (!this.hasUsedCapacity()) {
            this.clearTarget()
            return
        }

        // already work done work this tick
        if ([OK, ERR_TIRED].includes(this.work_code as any)) {
            return
        }

        this.work_code = this.creep.repair(this.target as any)

        if ([ERR_INVALID_TARGET, ERR_NOT_ENOUGH_RESOURCES].includes(this.work_code as any) || !this.hasUsedCapacity()) {
            this.clearTarget()
        } else if (this.work_code === ERR_NOT_IN_RANGE) {
            this.moveToTarget()
        }

        // clear target if at max hits
        if (this.target && 'hits' in this.target && 'hitsMax' in this.target && this.target.hits === this.target.hitsMax) {
            this.clearTarget()
        }
    }

    transfer(resource: ResourceConstant = RESOURCE_ENERGY): void {
        // empty?
        if (!this.hasUsedCapacity()) {
            this.clearTarget()
            return
        }

        // already done this tick
        if ([OK, ERR_TIRED].includes(this.transfer_code as any)) {
            return
        }

        // save a transfer request
        if (this.target instanceof Creep && this.target.memory.transfer !== OK) {
            // return this.withdrawResource()
        }

        this.transfer_code = this.creep.transfer(this.target as any, resource)

        if ([OK, ERR_FULL, ERR_NOT_ENOUGH_RESOURCES].includes(this.transfer_code as any) || !this.hasUsedCapacity()) {
            this.clearTarget()
        } else if (this.transfer_code === ERR_NOT_IN_RANGE) {
            this.moveToTarget()
        }
    }

    upgrade_controller() {
        // empty?
        if (!this.hasUsedCapacity()) {
            this.clearTarget()
            return
        }

        // already done this tick
        if ([OK, ERR_TIRED].includes(this.work_code as any)) {
            return
        }

        this.work_code = this.creep.upgradeController(this.target as StructureController)

        if ([ERR_NO_BODYPART, ERR_NOT_ENOUGH_RESOURCES].includes(this.work_code as any) || !this.hasUsedCapacity()) {
            this.clearTarget()
        } else if (this.work_code === ERR_NOT_IN_RANGE) {
            this.moveToTarget()
        }
    }

    withdraw(resource: ResourceConstant = RESOURCE_ENERGY) {
        // already full?
        if (!this.hasFreeCapacity()) {
            this.clearTarget()
            return
        }

        // already done this tick
        if ([OK, ERR_TIRED].includes(this.transfer_code as any)) {
            return
        }

        if (this.target instanceof Creep) {
            // wait until next tick so we dont interupt the other creep
            if (this.target.memory.transfer === OK && this.creep.pos.isNearTo(this.target)) {
                return
            }

            this.target.memory.transfer = this.target.transfer(this.creep, resource)

            if ([OK, ERR_NOT_ENOUGH_RESOURCES].includes(this.target.memory.transfer as any) || !this.hasFreeCapacity()) {
                this.clearTarget()
            } else if (this.target.memory.transfer === ERR_NOT_IN_RANGE) {
                this.moveToTarget()
            }
        }
    }
}
