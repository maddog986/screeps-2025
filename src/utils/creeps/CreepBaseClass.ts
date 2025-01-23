import { CONFIG } from 'config'
import Traveler from 'utils/Traveler'
import utils, { createEnum } from 'utils/utils'
import { TargetType, TargetTypes } from './creep_memory'

export enum ROLE {
    'harvester' = 'harvester',
    'mule' = 'mule',
    'builder' = 'builder',
    'upgrader' = 'upgrader',
};

export class CreepBaseClass {
    creep: Creep

    // move: CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND | -100 = -100
    // transfer: ScreepsReturnCode | -100 = -100

    // cache key
    cache() {
        return this.creep.name
    }

    constructor(creep: Creep) {
        this.creep = creep

        // tick resets
        this.creep.memory.move = -100
        this.creep.memory.transfer = -100
        this.creep.memory.work = -100
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

    get target() {
        return this.creep._targets.get()
    }

    get target_last() {
        return this.creep._targets.last()
    }



    hasFreeCapacity(resource: ResourceConstant | undefined = undefined) {
        return this.creep.store.getFreeCapacity(resource) > 0
    }

    hasUsedCapacity(resource: ResourceConstant | undefined = undefined) {
        return this.creep.store.getUsedCapacity(resource) > 0
    }

    findJob(find_jobs: JOB[]) {
        find_jobs.find((job) => {
            const methodName = `task_${job}`
            if (typeof (this as any)[methodName] === "function") {
                return (this as any)[methodName]() // Call the dynamic method
            }
            return false
        })
    }



    allTargets() {
        return this.creep._targets.getAll()
    }

    findTarget() {
        // base for each creep class to find a target
    }

    hasTarget() {
        return this.hasTargets()
    }

    hasTargets() {
        return this.creep._targets.hasTargets()
    }

    setTarget(target: TargetTypes, job: JOB) {
        this.creep._targets.add(target, job)
    }

    removeTarget(target: TargetTypes) {
        this.creep._targets.remove(target)
    }

    lastTargetId() {
        return this.creep._targets.lastId()
    }

    run() {
        // find targets
        if (!this.hasTargets()) {
            this.findTarget()
        }

        // no tasks to complete?
        if (!this.hasTargets()) return

        // run through all targets and jobs
        this.allTargets()
            .forEach((target) => {
                const methodName = `job_${target.job}`
                if (typeof (this as any)[methodName] === "function") {
                    (this as any)[methodName](target) // Call the dynamic method
                }
            })
    }

    moveToTarget() {
        const target = this.target
        if (!target) return

        // already done this tick
        if ([OK, ERR_TIRED].includes(this.move_code as any)) {
            return
        }

        // if creep doesnt have a MOVE body part, return
        if (!this.creep.body.some(({ type }) => type === MOVE)) {
            return
        }

        // move it
        this.move_code = Traveler.move(this.creep, target instanceof RoomPosition ? target : (target as _HasRoomPosition).pos)
    }









    /**
     * JOBS
     */

    // common used jobs amoungst all TASKS
    job_withdraw(target: TargetTypes, resource: ResourceConstant = RESOURCE_ENERGY) {
        // already full?
        if (!this.hasFreeCapacity()) {
            this.removeTarget(target)
            return
        }

        // already done this tick
        if ([OK, ERR_TIRED].includes(this.transfer_code as any)) {
            return
        }

        if (target instanceof Creep) {
            // wait until next tick so we dont interupt the other creep
            if (target.memory.transfer === OK && this.creep.pos.isNearTo(target)) {
                this.creep.say('🕒')
                return
            }

            target.memory.transfer = target.transfer(this.creep, resource)

            if ([OK, ERR_NOT_ENOUGH_RESOURCES].includes(target.memory.transfer as any) || !this.hasFreeCapacity()) {
                this.removeTarget(target)
            } else if (target.memory.transfer === ERR_NOT_IN_RANGE) {
                this.moveToTarget()
            }
        } else if (target instanceof StructureContainer) {
            this.transfer_code = this.creep.withdraw(target, resource)

            if ([OK, ERR_NOT_ENOUGH_RESOURCES].includes(this.transfer_code as any) || !this.hasFreeCapacity()) {
                this.removeTarget(target)
            } else if (this.transfer_code === ERR_NOT_IN_RANGE) {
                this.moveToTarget()
            }
        }
    }

    // common used jobs amoungst all TASKS
    job_transfer(target: AnyStoreStructure | Creep, resource: ResourceConstant = RESOURCE_ENERGY): void {
        // empty?
        if (!this.hasUsedCapacity() || target.store.getFreeCapacity(resource) === 0) {
            this.removeTarget(target)
            return
        }

        // already done this tick
        if ([OK, ERR_TIRED].includes(this.transfer_code as any)) {
            return
        }

        this.transfer_code = this.creep.transfer(target as any, resource)

        if ([OK, ERR_FULL, ERR_NOT_ENOUGH_RESOURCES].includes(this.transfer_code as any) || !this.hasUsedCapacity()) {
            this.removeTarget(target)
        } else if (this.transfer_code === ERR_NOT_IN_RANGE) {
            this.moveToTarget()
        }
    }

    /**
     * TASKS
     */

    task_assist(): boolean {
        const last_target = this.target_last as TargetType | null

        const target = utils.creeps({ id_not: last_target ? last_target.id : undefined, notAssigned: true, hasTarget: true, hasParts_not: [MOVE], sortByDistance: this.creep.pos, atTarget: false })
            // grab the closest one
            .shift()

        if (target) {
            this.creep._targets.add(target, JOBS.assist)
            return true
        }

        return false
    }

    job_assist(target: Creep) {
        // Ensure the target is a creep and has a valid target
        if (!(target instanceof Creep) || !target.memory?.target) {
            this.removeTarget(target)
            return
        }

        // Ensure we haven't already moved this tick
        if ([OK, ERR_TIRED].includes(this.move_code as any)) {
            return
        }

        // Move towards the assisting target if not in range
        if (!utils.isNearTo(this.creep.pos, target.pos)) {
            this.moveToTarget()
            return
        }

        // Validate the target object (e.g., controller, structure, etc.)
        const target_object = Game.getObjectById<Creep>(target.memory.target)
        if (!target_object || !('pos' in target_object)) {
            this.removeTarget(target)
            return
        }

        const creep_puller = this.creep
        const creep_pulled = target
        const target_destination = target_object.pos
        const pulled_required_distance = target_object instanceof StructureController ? 3 : 1
        const puller_distance = utils.getRangeTo(creep_puller.pos, target_destination)
        const pulled_distance = utils.getRangeTo(creep_pulled.pos, target_destination)

        // start the link
        creep_puller.pull(creep_pulled)
        creep_pulled.move(creep_puller)

        if (puller_distance === pulled_required_distance || pulled_distance === pulled_required_distance) {
            this.move_code = creep_puller.move(creep_puller.pos.getDirectionTo(creep_pulled))
            if (this.move_code === OK) this.removeTarget(target)
        } else {
            // move to target
            this.move_code = creep_puller.moveTo(target_destination)
        }
    }


    // build
    task_build(): boolean {
        // construction sites
        const target = this.creep.room.find(FIND_MY_CONSTRUCTION_SITES)
            // order by least done
            .sort((a, b) => a.progress - b.progress)
            // move containers to the bottom of the list
            .sort((a, b) => {
                if (a.structureType === STRUCTURE_EXTENSION) return 1
                if (b.structureType === STRUCTURE_EXTENSION) return -1
                return 0
            })
            // move extensions to the bottom of the list
            .sort((a, b) => {
                if (a.structureType === STRUCTURE_EXTENSION) return 1
                if (b.structureType === STRUCTURE_EXTENSION) return -1
                return 0
            })
            // move towers to the bottom of the list
            .sort((a, b) => {
                if (a.structureType === STRUCTURE_TOWER) return 1
                if (b.structureType === STRUCTURE_TOWER) return -1
                return 0
            })
            // get last one
            .pop()

        if (target) {
            this.creep._targets.add(target, JOBS.build)
            return true
        }

        return false
    }

    job_build(target: ConstructionSite) {
        // empty?
        if (!this.hasUsedCapacity()) {
            this.removeTarget(target)
            return
        }

        // already work done work this tick
        if ([OK, ERR_TIRED].includes(this.work_code as any)) {
            return
        }

        this.work_code = this.creep.build(target)

        if ([ERR_INVALID_TARGET, ERR_NOT_ENOUGH_RESOURCES].includes(this.work_code as any) || !this.hasUsedCapacity()) {
            this.removeTarget(target)
        } else if (this.work_code === ERR_NOT_IN_RANGE) {
            this.moveToTarget()
        }
    }

    // harvest
    task_harvest(): boolean {

        // find a energy source
        const target = this.creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE, {
            filter: (source) =>
                // has energy
                source.energy > 0 &&
                // can this source support another creep?
                (
                    this.role !== ROLE.harvester ||
                    utils.walkablePositions(source.pos, 1) > utils.creeps({ id_not: this.creep.id, role: ROLE.harvester, job: JOBS.harvest }).filter(c => c.memory.target === source.id).length
                )
        })

        if (target) {
            this.creep._targets.add(target, JOBS.harvest)
            return true
        }

        return false
    }

    job_harvest(target: Source) {
        // already work done work this tick
        if ([OK, ERR_TIRED].includes(this.work_code as any)) {
            return
        }

        this.work_code = this.creep.harvest(target)

        if ([ERR_NOT_ENOUGH_RESOURCES].includes(this.work_code as any) || !this.hasFreeCapacity()) {
            this.removeTarget(target)
        } else if (this.work_code === ERR_NOT_IN_RANGE) {
            this.moveToTarget()
        }
    }

    // idle
    task_idle(): boolean {
        // do nothing
        // TODO: make sure creep isnt the way of something
        return true
    }

    job_idle(): void {
        // do nothing
    }

    // refill_builder
    task_refill_builder(): boolean {
        if (!this.hasUsedCapacity()) return false

        const last_target = this.target_last as TargetType | null

        const creep = utils.creeps({ id_not: last_target ? last_target.id : undefined, notOverAssigned: true, freeCapacity: 10 })
            .filter((creep) => {
                const { id, body, store, memory: { role } } = creep

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

            this.creep._targets.add(creep, JOBS.transfer)
            return true
        }

        return false
    }

    job_refill_builder(target: StructureStorage | StructureContainer | Creep) {
        this.job_transfer(target)
    }

    // refill_upgrader
    task_refill_upgrader(): boolean {
        if (!this.hasUsedCapacity()) return false

        const last_target = this.target_last as TargetType | null

        const creep = utils.creeps({ id_not: last_target ? last_target.id : undefined, notOverAssigned: true, freeCapacity: 10 })
            .filter((creep) => {
                const { id, body, store, memory: { role } } = creep

                // must be a certain role
                if (role !== ROLE.upgrader) return false

                // get range to creep
                const rangeTo = utils.getRangeTo(this.creep.pos, creep.pos)

                // how much energy does the creep use per tick
                const energy_use_per_tick = body.filter(({ type }) => type === WORK).length * HARVEST_POWER

                // how much energy does the creep use before we can reach it
                const energy_use_given_distance = energy_use_per_tick * (rangeTo)

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
            this.creep._targets.add(creep, JOBS.transfer)
            return true
        }

        return false
    }

    job_refill_upgrader(target: StructureStorage | StructureContainer | Creep) {
        if (this.transfer_code !== OK) {
            const upgraders_near_by = utils.creeps({ role: ROLE.upgrader, freeCapacity: 5, inRange: [this.creep.pos, 1] })

            if (upgraders_near_by.length > 0) {
                this.transfer_code = this.creep.transfer(upgraders_near_by[0], RESOURCE_ENERGY)
            }
        }

        this.job_transfer(target)
    }

    // repair
    task_repair(): boolean {
        if (!this.hasUsedCapacity()) return false

        // find repairable structure
        const target_repair = this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: ({ hits, hitsMax }) => hits < hitsMax
        })

        if (target_repair) {
            this.creep._targets.add(target_repair, JOBS.repair)
            return true
        }

        return false
    }

    job_repair(target: Structure): void {
        // empty?
        if (!this.hasUsedCapacity()) {
            this.removeTarget(target)
            return
        }

        // already work done work this tick
        if ([OK, ERR_TIRED].includes(this.work_code as any)) {
            return
        }

        this.work_code = this.creep.repair(target as any)

        if ([ERR_INVALID_TARGET, ERR_NOT_ENOUGH_RESOURCES].includes(this.work_code as any) || !this.hasUsedCapacity()) {
            this.removeTarget(target)
        } else if (this.work_code === ERR_NOT_IN_RANGE) {
            this.moveToTarget()
        }

        // clear target if at max hits
        if (target && 'hits' in target && 'hitsMax' in target && target.hits === target.hitsMax) {
            this.removeTarget(target)
        }
    }

    // refill_spawn
    task_refill_spawn(): boolean {
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
            this.creep._targets.add(target, JOBS.transfer)
            return true
        }

        return false
    }

    job_refill_spawn(target: AnyStoreStructure) {
        this.job_transfer(target)
    }

    // renew
    task_renew(): boolean {
        if (this.creep.ticksToLive && this.creep.ticksToLive >= CONFIG.autoRenewCreepLevel) return false

        // if creep has less body parts than loadout, return
        if (this.creep.body.length < CreepBaseClass.loadout(this.creep.room).body.length) return false

        // find a spawn to renew at
        const target = this.creep.pos.findClosestByPath(FIND_MY_SPAWNS, {
            filter: (spawn) =>
                // not spawning
                !spawn.spawning &&

                // full of energy
                spawn.store.getFreeCapacity(RESOURCE_ENERGY) === 0 &&

                // no other creeps assigned to renew
                utils.creeps({ job: JOBS.renew, target: spawn.id }).length === 0
        })

        if (target) {
            this.creep._targets.add(target, JOBS.renew)
            return true
        }

        return false
    }

    job_renew(target: StructureSpawn): void {
        if (this.creep.ticksToLive && this.creep.ticksToLive > 1000) {
            this.removeTarget(target)
        }

        // already done this tick
        if ([OK, ERR_TIRED].includes(this.work_code as any)) {
            return
        }

        const renewed = target.renewCreep(this.creep)

        if (renewed === ERR_NOT_IN_RANGE) {
            this.moveToTarget()
        }

        if (this.creep.ticksToLive && this.creep.ticksToLive > 1000) {
            this.removeTarget(target)
        }
    }

    // upgrade_controller
    task_upgrade_controller(): boolean {
        // upgrade controller
        const target_controller = this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: ({ structureType }) => structureType === STRUCTURE_CONTROLLER
        })

        if (target_controller) {
            this.creep._targets.add(target_controller, JOBS.upgrade_controller)
            return true
        }

        return false
    }

    job_upgrade_controller(target: StructureController) {
        // empty?
        if (!this.hasUsedCapacity()) {
            this.removeTarget(target)
            return
        }

        // already done this tick
        if ([OK, ERR_TIRED].includes(this.work_code as any)) {
            return
        }

        this.work_code = this.creep.upgradeController(target)

        if ([ERR_NO_BODYPART, ERR_NOT_ENOUGH_RESOURCES].includes(this.work_code as any) || !this.hasUsedCapacity()) {
            this.removeTarget(target)
        } else if (this.work_code === ERR_NOT_IN_RANGE) {
            this.moveToTarget()
        }
    }

    // withdraw_harvester
    task_withdraw_harvester(): boolean {
        if (!this.hasFreeCapacity()) return false

        const withdraw_from = [ROLE.harvester]

        if (this.creep.memory.role !== ROLE.mule) {
            // would be funny watching a mule try to take resources from another mule though...
            withdraw_from.push(ROLE.mule)
        }

        const last_target = this.target_last as TargetType | null

        const harvesters = utils.creeps({
            id_not: last_target ? last_target.id : undefined,
            role: withdraw_from,
            job_not: JOBS.transfer,
            usedCapacity: 3,
            notOverAssigned: true,
            sortByUsedCapacity: true,
        })

        const target = harvesters
            // slice by half
            .slice(0, Math.ceil(harvesters.length / 2))
            // sort by distance closest first
            .sort((a, b) => utils.getRangeTo(this.creep.pos, a.pos) - utils.getRangeTo(this.creep.pos, b.pos))
            // grab first
            .shift()

        if (target) {
            this.creep._targets.add(target, JOBS.withdraw)
            return true
        }

        return false
    }

    job_withdraw_harvester(target: Creep) {
        this.job_withdraw(target)
    }

    // withdraw_container
    task_withdraw_container(): boolean {
        if (!this.hasFreeCapacity()) return false

        const last_target = this.target_last as TargetType | null

        const containers = this.creep.room.find(FIND_STRUCTURES, {
            filter: (c) => c.structureType === STRUCTURE_CONTAINER &&

                (!last_target || c.id !== last_target.id) &&

                c.store.getUsedCapacity(RESOURCE_ENERGY) >= 5 &&

                // not near a spawn
                (this.role !== ROLE.mule || c.pos.findInRange(FIND_MY_SPAWNS, 3, {
                    filter: (spawn) => spawn.room.energyAvailable < spawn.room.energyCapacityAvailable
                }).length === 0)
        })

        // find a container to withdraw from
        const target = this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: (c) =>
                (!last_target || c.id !== last_target.id) &&

                c.structureType === STRUCTURE_CONTAINER &&

                c.store.getUsedCapacity(RESOURCE_ENERGY) >= 5 &&

                // not near a spawn
                (this.role !== ROLE.mule || c.pos.findInRange(FIND_MY_SPAWNS, 3, {
                    filter: (spawn) => spawn.room.energyAvailable < spawn.room.energyCapacityAvailable
                }).length === 0)
        })

        if (target) {
            this.creep._targets.add(target, JOBS.withdraw)
            return true
        }

        return false
    }

    job_withdraw_container(target: StructureContainer) {
        this.job_withdraw(target)
    }
}

export const JOBS = createEnum(CreepBaseClass.prototype, 'job_')

export type JOB = keyof typeof JOBS
