import { ASSIGNMENT, CREEP_ASSIGNMENTS } from '../jobs'
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
            console.log(this.creep.name, 'no target.')
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
