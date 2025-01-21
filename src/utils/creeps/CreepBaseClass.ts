import Traveler from 'utils/Traveler'
import utils from 'utils/utils'

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
    upgrade_controller = 'upgrade_controller',
    withdraw_harvester = 'withdraw_harvester',
    withdraw_container = 'withdraw_container',
}

export const CREEP_ASSIGNMENTS = {
    'assist': function (this: CreepBaseClass): boolean {
        const mules_assisting = utils.creeps({ role: ROLE.mule, job: JOB.assist })

        // find a creep to assist
        const target = this.creep.pos.findClosestByPath(FIND_MY_CREEPS, {
            filter: ({ id, body, pos, memory: { role, target, move } }) => {
                if (!target || move === OK || body.some(({ type }) => type === MOVE)) return false

                // make sure no other creeps are already assisting
                const assisting = mules_assisting.find(({ memory: { target } }) => target === id)
                if (assisting) return false

                const target_object = Game.getObjectById(target)
                if (!target_object) return false

                const distance = utils.getRangeTo(pos, (target_object as any).pos)
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
        // how many creeps already assigned to the job
        const creeps_assigned_to_job = utils.creeps({ role: ROLE.harvester, job: JOB.harvest, id_not: this.creep.id })

        // find a energy source
        const target = this.creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE, {
            filter: (source) =>
                // has energy
                source.energy > 0 &&
                // can this source support another creep?
                utils.walkablePositions(source.pos, 1) > creeps_assigned_to_job.filter(c => c.memory.target === source.id).length
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
        if (!this.hasUsedCapacity()) return false

        const creep = utils.creeps({ notOverAssigned: true, freeCapacity: 10 })
            .filter((creep) => {
                const { id, body, store, memory: { role } } = creep

                // dont target last target
                if (this.last_target === id) return false

                // must be a certain role
                if (role !== ROLE.builder) return false

                // get range to creep
                const rangeTo = utils.getRangeTo(this.creep.pos, creep.pos)

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
            // draw circle around creep
            this.creep.room.visual.circle(creep.pos, { radius: 1, fill: 'transparent', stroke: 'green' })

            this.setTarget(creep, JOB.transfer)
            return true
        }

        return false
    },

    'refill_upgrader': function (this: CreepBaseClass): boolean {
        if (!this.hasUsedCapacity()) return false

        const creep = utils.creeps({ notOverAssigned: true, freeCapacity: 10 })
            .filter((creep) => {
                const { id, body, store, memory: { role } } = creep

                // dont target last target
                if (this.last_target === id) return false

                // must be a certain role
                if (role !== ROLE.upgrader) return false

                // get range to creep
                const rangeTo = utils.getRangeTo(this.creep.pos, creep.pos)

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

    'repair': function (this: CreepBaseClass): boolean {
        if (!this.hasUsedCapacity()) return false

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
        if (!this.hasUsedCapacity()) return false

        // get all spawns and extensions
        const target = this.creep.room.find(FIND_MY_STRUCTURES, {
            filter: (s) =>
                (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_TOWER)
        })
            // has free capacity
            .filter(({ store }) => store.getFreeCapacity(RESOURCE_ENERGY) > 0)
            // sort by distance
            .sort((a, b) => utils.getRangeTo(this.creep.pos, a.pos) - utils.getRangeTo(this.creep.pos, b.pos))
            // grab first
            .shift()

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
        if (!this.hasFreeCapacity()) return false

        const withdraw_from = [ROLE.harvester]

        if (this.creep.memory.role !== ROLE.mule) {
            // would be funny watching a mule try to take resources from another mule though...
            withdraw_from.push(ROLE.mule)
        }

        const harvesters = utils.creeps({
            role: withdraw_from,
            usedCapacity: 3,
            notOverAssigned: true,
        })
            .filter(({ store, memory: { role, job } }) =>
                // must not have a transfer job (probably refilling spawn)
                job !== JOB.transfer
            )
            // sort by store most full first
            .sort((a, b) => b.store.getUsedCapacity(RESOURCE_ENERGY) - a.store.getUsedCapacity(RESOURCE_ENERGY))

        const target = harvesters
            // slice by half
            .slice(0, Math.ceil(harvesters.length / 2))
            // sort by distance closest first
            .sort((a, b) => utils.getRangeTo(this.creep.pos, a.pos) - utils.getRangeTo(this.creep.pos, b.pos))
            // grab first
            .shift()

        if (target) {
            this.setTarget(target, JOB.withdraw)
            return true
        }

        return false
    },

    'withdraw_container': function (this: CreepBaseClass): boolean {
        if (!this.hasFreeCapacity()) return false

        const containers = this.creep.room.find(FIND_STRUCTURES, {
            filter: (c) => c.structureType === STRUCTURE_CONTAINER && c.store.getUsedCapacity(RESOURCE_ENERGY) >= 5
        })

        // find a container to withdraw from
        const target = this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: (c) => c.structureType === STRUCTURE_CONTAINER && c.store.getUsedCapacity(RESOURCE_ENERGY) >= 5
        })

        if (target) {
            this.setTarget(target, JOB.withdraw)
            return true
        }

        return false
    }
}

export class CreepBaseClass {
    creep: Creep
    target: RoomPosition | _HasId | { pos: RoomPosition } | null

    // move: CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND | -100 = -100
    // transfer: ScreepsReturnCode | -100 = -100

    // cache key
    cache() {
        return this.creep.name
    }

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

    static loadout(room: Room): { body: BodyPartConstant[], max: number } {
        return {
            body: [WORK, CARRY, MOVE],
            max: 1
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

    set move_code(move: ScreepsReturnCode | -100) {
        this.creep.memory.move = move
    }

    get transfer_code() {
        return this.creep.memory.transfer ?? -100
    }

    set transfer_code(transfer: ScreepsReturnCode | -100) {
        this.creep.memory.transfer = transfer
    }

    get pickup_code() {
        return this.creep.memory.pickup ?? -100
    }

    set pickup_code(pickup: ScreepsReturnCode | -100) {
        this.creep.memory.pickup = pickup
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
        const reacquire = !!this.target

        // if (reacquire) {
        //     console.log(this.creep.name, 'clear target. reacquire?')
        // }

        this.job = JOB.idle
        this.target = null
        this.creep.memory.job = JOB.idle

        delete this.creep.memory.target
        delete this.creep.memory.target_time
        delete this.creep.memory._travel
        delete this.creep.memory._move

        if (reacquire) {
            this.findTarget()
        }
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
            this.clearTarget()
        }
    }

    moveToTarget(target: RoomPosition | { pos: RoomPosition } | null = null) {
        if (!this.target) return

        // already done this tick
        if ([OK, ERR_TIRED].includes(this.move_code as any)) {
            return
        }

        // if creep doesnt have a MOVE body part, return
        if (!this.creep.body.some(({ type }) => type === MOVE)) {
            return
        }

        // move it
        this.move_code = Traveler.move(this.creep, this.target instanceof RoomPosition ? this.target : (this.target as _HasRoomPosition).pos)
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
            this.moveToTarget(this.target as Creep)
            return
        }

        const target_object_distance = utils.getRangeTo(this.creep.pos, (target_object as any).pos) - 1
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
        const pull = this.creep.pull(this.target)
        // accept pull
        this.target.memory.move = this.target.move(this.creep) as CreepMoveReturnCode
        // actual movement
        this.move_code = this.creep.move(this.creep.pos.getDirectionTo(this.target)) as CreepMoveReturnCode

        if (this.move_code === OK && this.target.memory.move === OK && pull === OK) {
            this.clearTarget()
        }

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
        if (!this.hasUsedCapacity() || (this.target && (this.target as _HasId & { store: Storage }).store.getFreeCapacity(resource) === 0)) {
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
        } else if (this.target instanceof StructureContainer) {
            this.transfer_code = this.creep.withdraw(this.target, resource)

            if ([OK, ERR_NOT_ENOUGH_RESOURCES].includes(this.transfer_code as any) || !this.hasFreeCapacity()) {
                this.clearTarget()
            } else if (this.transfer_code === ERR_NOT_IN_RANGE) {
                this.moveToTarget()
            }
        }
    }
}
