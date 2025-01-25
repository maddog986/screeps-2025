import CreepManager from 'creep_manager'

const creepActions: Record<string, (base: CreepManager, target: TargetTypes | RoomPosition, params: TaskParams) => ActionResult> = {
    move: ({ creep, completed }, target, params) => {
        if (creep.pos.isEqualTo(target)) {
            return { success: OK }
        }

        if (completed.has("move")) return { success: ERR_BUSY, permanent: true }

        const result = creep.moveTo(target)

        if (creep.pos.isEqualTo(target)) {
            return { success: OK }
        }

        return { success: OK, actions: { move: result } }
    },
    harvest: ({ creep, completed }, target, params) => {
        if (!(target instanceof Source)) {
            return { success: OK }
        }

        if (!creep.pos.isNearTo(target)) {
            return { success: ERR_NOT_IN_RANGE, permanent: true } // signal move to target
        }

        if (completed.has("work")) return { success: ERR_BUSY, permanent: true }

        const result = creep.harvest(target)

        // how many work parts?
        const workParts = creep.body.filter(part => part.type === WORK).length
        const energyPerTick = workParts * HARVEST_POWER

        if (energyPerTick >= creep.store.getFreeCapacity(RESOURCE_ENERGY)) {
            return { success: OK, actions: { work: result } }
        }

        if (!params.ignoreCapacity && creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            return { success: OK }
        }

        return { success: result, actions: { work: result }, permanent: true }
    },
    transfer: ({ creep, completed }, target, params) => {
        if (!(target instanceof Structure) || 'store' in target === false) {
            return { success: OK }
        }

        if (!creep.pos.isNearTo(target)) {
            return { success: ERR_NOT_IN_RANGE, permanent: true } // signal move to target
        }

        const store = target.store as StoreDefinition
        const targetStore = target.store as StoreDefinition

        if (store.getFreeCapacity(RESOURCE_ENERGY) === 0 || targetStore.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            return { success: OK }
        }

        if (completed.has("transfer")) return { success: ERR_BUSY, permanent: true }

        const result = creep.transfer(target, RESOURCE_ENERGY)

        if (result === ERR_FULL) {
            return { success: OK }
        }

        return { success: result, actions: { transfer: result } }
    },
    upgrade: ({ creep, completed }, target, params) => {
        if (!(target instanceof StructureController)) {
            return { success: OK }
        }

        if (creep.pos.getRangeTo(target) > 3) {
            return { success: ERR_NOT_IN_RANGE, permanent: true } // signal move to target
        }

        if (completed.has("work")) return { success: ERR_BUSY, permanent: true }

        const result = creep.upgradeController(target)

        if (result === ERR_NOT_ENOUGH_RESOURCES || creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            return { success: OK, actions: { work: result } }
        }

        // how many work parts?
        const workParts = creep.body.filter(part => part.type === WORK).length
        const energyPerTick = workParts * HARVEST_POWER

        if (energyPerTick >= creep.store.getUsedCapacity(RESOURCE_ENERGY)) {
            return { success: OK, actions: { work: result } }
        }

        return { success: ERR_BUSY, permanent: true, actions: { work: result } }
    }
}

export default creepActions
