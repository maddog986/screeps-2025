import CreepManager from 'creep/creep_manager'

const creepActions: Record<string, (base: CreepManager, target: TargetTypes | RoomPosition) => ActionResult> = {
    move: ({ creep, completed }, target) => {
        if (creep.pos.isEqualTo(target)) {
            return { success: ERR_INVALID_TARGET }
        }

        if (completed.has("move")) return { success: ERR_BUSY }

        const result = creep.manager.move(target, { range: 0 })

        return { success: result, persistent: true, actions: { move: result } }
    },
    harvest: ({ creep, completed }, target) => {
        if (target instanceof Source === false) {
            return { success: ERR_INVALID_TARGET }
        }

        if (completed.has("work")) return { success: ERR_BUSY }

        const result = creep.harvest(target)

        // how many work parts?
        const workParts = creep.body.filter(part => part.type === WORK).length
        const energyPerTick = workParts * HARVEST_POWER

        if (energyPerTick >= creep.store.getFreeCapacity(RESOURCE_ENERGY)) {
            return { success: OK, actions: { work: result } }
        }

        return { success: ERR_BUSY, actions: { work: result } }
    },
    transfer: ({ creep, completed }, target) => {
        if ('store' in target === false || target instanceof Tombstone) {
            return { success: ERR_INVALID_TARGET }
        }

        if (target instanceof Creep) {
            let targetMoving = false

            // is target creep moving to a target?
            if (target.manager.completed.has("move")) targetMoving = true
            else if (target.memory.travel && target.memory.travel.distance > 3) targetMoving = true

            if (targetMoving) {
                // inform creep we are on the way
                target.manager.addTask({
                    action: 'move',
                    id: creep.id
                }, true)
            }
        }

        const store = creep.store as StoreDefinition
        const targetStore = target.store as StoreDefinition

        if (completed.has("transfer")) return { success: ERR_BUSY }

        const result = creep.transfer(target, RESOURCE_ENERGY)

        return { success: result, actions: { transfer: result } }
    },
    upgrade: ({ creep, completed }, target) => {
        if (target instanceof StructureController === false) {
            return { success: ERR_INVALID_TARGET }
        }

        if (completed.has("work")) return { success: ERR_BUSY, persistent: true }

        const result = creep.upgradeController(target)

        // how many work parts?
        const workParts = creep.body.filter(part => part.type === WORK).length
        const energyPerTick = workParts * HARVEST_POWER

        if (energyPerTick >= creep.store.getUsedCapacity(RESOURCE_ENERGY)) {
            return { success: OK, actions: { work: result } }
        }

        return { success: ERR_BUSY, actions: { work: result } }
    },
    build: ({ creep, completed }, target) => {
        if (target instanceof ConstructionSite === false) {
            return { success: ERR_INVALID_TARGET }
        }

        if (completed.has("work")) return { success: ERR_BUSY }

        const result = creep.build(target)

        // how many work parts?
        const workParts = creep.body.filter(part => part.type === WORK).length
        const energyPerTick = workParts * HARVEST_POWER

        if (energyPerTick >= creep.store.getUsedCapacity(RESOURCE_ENERGY)) {
            return { success: OK, actions: { work: result } }
        }

        return { success: ERR_BUSY, actions: { work: result } }
    },
    withdraw: ({ creep, completed }, target) => {
        if (!target || 'store' in target === false) {
            return { success: ERR_INVALID_TARGET }
        }

        if (target instanceof Creep) {
            if (target.manager.completed.has("transfer")) return { success: ERR_BUSY }

            const result = target.transfer(creep, RESOURCE_ENERGY)

            return { success: OK, actions: { transfer: result } }
        }

        if (completed.has("transfer")) return { success: ERR_BUSY }

        const result = creep.withdraw(target, RESOURCE_ENERGY)

        return { success: result, actions: { transfer: result } }
    },
    attack({ creep, completed }, target) {
        if (target instanceof Creep === false) {
            return { success: ERR_INVALID_TARGET }
        }

        if (completed.has("attack")) return { success: ERR_BUSY }

        const result = creep.attack(target)

        return { success: result, actions: { attack: result } }
    },
    renew({ creep, completed }, target) {
        if (target instanceof StructureSpawn === false) {
            return { success: ERR_INVALID_TARGET }
        }

        const result = target.renewCreep(creep)

        return { success: result }
    }
}

export default creepActions
