import { ASSIGNMENT, CreepBaseClass, JOB, ROLE } from './CreepBaseClass'

export default class Harvester extends CreepBaseClass {
    findTarget() {
        const has_move_part = this.creep.body.some(({ type }) => type === MOVE)

        // can an find energy source
        if (!has_move_part || this.hasFreeCapacity()) {
            this.findJob([ASSIGNMENT.harvest])
        }

        // can the creep do something with stored energy?
        if (has_move_part && this.hasUsedCapacity()) {
            // count mules spawned
            const mules = Object.values(Game.creeps).filter(({ memory: { role } }) => role === ROLE.mule).length

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
        if (this.creep.store.getFreeCapacity() > 0) {
            const dropped_energy = this.creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                filter: ({ resourceType }) => resourceType === RESOURCE_ENERGY
            })
            if (dropped_energy) {
                this.transfer_code = this.creep.pickup(dropped_energy)
            }
        }
    }
}
