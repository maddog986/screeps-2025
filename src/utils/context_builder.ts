import Debuggable from './debugger'
import utils from './utils'

export default class ContextBuilder extends Debuggable {
    room: Room | undefined
    baseContext: Record<string, any>
    proxy: any

    constructor(room: Room | undefined = undefined) {
        super('ContextBuilder')

        this.room = room

        // Base context definitions
        this.baseContext = {

            // base constants
            RESOURCE_ENERGY: RESOURCE_ENERGY,

            room: room,
            controller: this.room?.controller,

            // find functions
            creeps: () => room?.find(FIND_MY_CREEPS),
            enemies: () => room?.find(FIND_HOSTILE_CREEPS),
            spawns: () => room?.find(FIND_MY_SPAWNS),
            activeSources: () => room?.find(FIND_SOURCES_ACTIVE),
            sources: () => room?.find(FIND_SOURCES),
            constructionSites: () => room?.find(FIND_CONSTRUCTION_SITES),
            controllerLevel: () => room && room.controller && (room?.controller?.level + (room?.controller.progress / room.controller.progressTotal)),
            structures: () => room?.find(FIND_STRUCTURES),
            containers: () => room?.find(FIND_STRUCTURES, {
                filter: (s) => s.structureType === STRUCTURE_CONTAINER
            }),

            // helper functions
            freeCapacity: this.getFreeCapacity.bind(this),
            usedCapacity: this.getUsedCapacity.bind(this),
            notOverAssignedSource: this.isNotOverAssignedSource.bind(this),
            notOverAssigned: this.isNotOverAssigned.bind(this),
        }

        const context: Record<string, any> = {}

        Object.keys(this.baseContext).forEach(key => (context[key] = undefined))

        // Use a Proxy for lazy evaluation of context properties
        this.proxy = new Proxy(context, {
            get: (target: any, prop: string) => {
                if (target[prop] === undefined) {
                    // Evaluate the function dynamically
                    return this.baseContext[prop]
                }
                return target[prop]
            },
            set: (target: any, prop: string, value: any) => {
                target[prop] = value
                return true
            }
        })
    }

    keys() {
        return Object.keys(this.proxy)
    }

    values() {
        return Object.values(this.proxy)
    }

    setContext(key: string, value: any): void {
        this.proxy[key] = value
    }

    getContext(key: string): any {
        // TODO: cache this?
        return typeof this.proxy[key] === 'function' ? this.proxy[key].bind(this)() : this.proxy[key]
    }

    evaluateExpression(expression: string): any {
        return new Function(...this.keys(), `return ${expression};`).bind(this)(...this.values())
    }

    getFreeCapacity(target: TargetTypes & { store: StoreDefinition } | TargetTypes & { energy: number, energyCapacity: number } | undefined): number {
        console.log('target:', target)

        if (!target) return 0

        // if (target instanceof Creep) {
        //     return target.getRealTimeFreeCapacity(RESOURCE_ENERGY)
        // }

        // if (target instanceof StructureSpawn) {
        //     return target.getRealTimeFreeCapacity()
        // }

        if ('energy' in target && 'energyCapacity' in target) {
            return target.energyCapacity - target.energy
        }

        return target.store.getFreeCapacity(RESOURCE_ENERGY)
    }

    getUsedCapacity(target: { store: StoreDefinition } | { energy: number, energyCapacity: number } | undefined): number {
        if (!target) return 0

        // if (target instanceof Creep) {
        //     return target.getRealTimeUsedCapacity(RESOURCE_ENERGY)
        // }
        // if (target instanceof StructureSpawn) {
        //     return target.getRealTimeUsedCapacity()
        // }

        if ('store' in target) {
            return target.store.getUsedCapacity(RESOURCE_ENERGY)
        }

        return target.energy
    }

    isNotOverAssignedSource(target: TargetTypes | undefined): boolean {
        // Your existing implementation for notOverAssignedSource
        if (!target) return false

        const creepContext = this.getContext('creep')

        const assigned_creeps = Object.values(Game.creeps)
            .filter(creep =>
                (!creepContext || creep.id !== creepContext.id) &&
                creep.memory.tasks &&
                creep.memory.tasks.some(task => 'id' in task && task.id === target.id && task.action === 'harvest') &&
                (!creepContext || creep.pos.getRangeTo(target) < creepContext.pos.getRangeTo(target))
            )

        const walkablePositions = utils.walkablePositions(target.pos)
        const assignedCreepsEnergy = assigned_creeps.reduce((total, c) => total + this.getUsedCapacity(c), 0)
        const stored = this.getUsedCapacity(target as any)

        this.log(`**notOverAssignedSource** target: ${target} creep: ${creepContext} room: ${this.room} assigned_creeps: ${assigned_creeps.length} walkablePositions: ${walkablePositions} assignedCreepsEnergy: ${assignedCreepsEnergy} stored: ${stored}`, 'informative')

        return walkablePositions > assigned_creeps.length && stored > assignedCreepsEnergy
    }

    isNotOverAssigned(target: TargetTypes | undefined): boolean {
        // Your existing implementation for notOverAssigned
        if (!target) return false

        const creepContext = this.getContext('creep')

        const assigned_creeps = Object.values(Game.creeps)
            .filter(creep =>
                creep.memory.tasks &&
                creep.memory.tasks.some(task => 'id' in task && task.id === target.id && task.action === 'transfer') &&
                (!creepContext || (creep.id !== creepContext.id && creep.pos.getRangeTo(target) < creepContext.pos.getRangeTo(target)))
            )

        const walkablePositions = utils.walkablePositions(target.pos)
        const assignedCreepsEnergy = assigned_creeps.reduce((total, c) => total + this.getUsedCapacity(c), 0)
        const stored = this.getFreeCapacity(target as any)

        this.log(`**notOverAssigned** target: ${target} creep: ${creepContext} room: ${this.room} assigned_creeps: ${assigned_creeps.length} walkablePositions: ${walkablePositions} assignedCreepsEnergy: ${assignedCreepsEnergy} stored: ${stored}`, 'informative')

        return walkablePositions > assigned_creeps.length && stored > assignedCreepsEnergy
    }
}
