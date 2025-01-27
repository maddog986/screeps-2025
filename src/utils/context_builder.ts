import Debuggable from './debugger'
import utils from './utils'

export default class ContextBuilder extends Debuggable {
    room: Room
    memoizationCache: Record<string, any>
    proxy: Record<string, any>

    constructor(room: Room, prefix: string) {
        super(prefix)
        this.room = room
        this.memoizationCache = {} // Cache storage

        // Base context definitions
        const baseContext: Record<string, any> = {
            // Base constants
            RESOURCE_ENERGY: RESOURCE_ENERGY,

            room: room,
            controller: this.room?.controller,

            // Find functions
            creeps: () => room?.find(FIND_MY_CREEPS),
            enemies: () => room?.find(FIND_HOSTILE_CREEPS),
            spawns: () => room?.find(FIND_MY_SPAWNS),
            activeSources: () => room?.find(FIND_SOURCES_ACTIVE),
            sources: () => room?.find(FIND_SOURCES),
            constructionSites: () => room?.find(FIND_CONSTRUCTION_SITES),
            controllerLevel: () =>
                room?.controller
                    ? room.controller.level +
                    room.controller.progress / room.controller.progressTotal
                    : undefined,
            structures: () => room?.find(FIND_STRUCTURES),
            containers: () =>
                room?.find(FIND_STRUCTURES, {
                    filter: (s) => s.structureType === STRUCTURE_CONTAINER,
                }),

            // Helper functions
            assignedCreeps: this.assignedCreeps.bind(this),
            freeCapacity: this.getFreeCapacity.bind(this),
            usedCapacity: this.getUsedCapacity.bind(this),
            notOverAssignedSource: this.isNotOverAssignedSource.bind(this),
            notOverAssigned: this.isNotOverAssigned.bind(this),
            walkablePositions: this.walkablePositions.bind(this),
            creepsByRole: this.creepsByRole.bind(this),
        }

        // Memoize all functions in the base context
        for (const key in baseContext) {
            if (typeof baseContext[key] === 'function') {
                baseContext[key] = this.memoize(baseContext[key])
            }
        }

        // Use Proxy for lazy evaluation of context properties
        this.proxy = new Proxy(baseContext, {
            get: (target: any, prop: string) => {
                if (prop in target) {
                    return target[prop] // need to return values and functions as-is
                }
                return undefined
            },
            set: (target: any, prop: string, value: any) => {
                target[prop] = value
                return true
            },
        })
    }

    memoize(fn: Function): (...args: any[]) => any {
        return (...args: any[]) => {
            const key = `${Game.time}-${fn.name}-${JSON.stringify(args)}`
            if (this.memoizationCache[key] === undefined) {
                console.log(`[${Game.time}]**memoize:** saved: ${fn.name}(${args})`)
                this.memoizationCache[key] = fn(...args)
            } else {
                console.log(`[${Game.time}]**memoize:** used: ${fn.name}(${args})`)
            }
            return this.memoizationCache[key]
        }
    }

    contextKeys() {
        return Object.keys(this.proxy)
    }

    contextValues() {
        return Object.values(this.proxy)
    }

    setContext(key: string, value: any): void {
        this.proxy[key] = value
    }

    getContext(key: string): any {
        return typeof this.proxy[key] === 'function' ? this.proxy[key]() : this.proxy[key]
    }

    evaluateExpression(expression: string): any {
        console.log('evaluateExpression:', expression)
        // Object.keys(this.proxy).forEach((key) => {
        //     console.log(`<strong>key:</strong> ${key} <strong>value:</strong> ${this.proxy[key]}`)
        // })
        return new Function(...this.contextKeys(), `return ${expression};`).bind(this)(...this.contextValues())
    }

    getFreeCapacity(target: TargetTypes & { store: StoreDefinition } | TargetTypes & { energy: number, energyCapacity: number } | undefined): number {
        if (!target) return 0

        if ('energy' in target && 'energyCapacity' in target) {
            return target.energyCapacity - target.energy
        }

        return target.store.getFreeCapacity(RESOURCE_ENERGY)
    }

    getUsedCapacity(target: { store: StoreDefinition } | { energy: number, energyCapacity: number } | undefined): number {
        if (!target) return 0

        if ('store' in target) {
            return target.store.getUsedCapacity(RESOURCE_ENERGY)
        }

        return target.energy
    }

    isNotOverAssignedSource(target: TargetTypes | undefined): boolean {
        if (!target) return false

        const assigned_creeps = this.assignedCreeps(target, 'harvest')
        const walkablePositions = this.walkablePositions(target)
        const assignedCreepsEnergy = assigned_creeps.reduce((total, c) => total + this.getUsedCapacity(c), 0)
        const stored = this.getUsedCapacity(target as any)

        this.log(
            `**notOverAssignedSource** target: ${target} room: ${this.room} assigned_creeps: ${assigned_creeps.length} walkablePositions: ${walkablePositions} assignedCreepsEnergy: ${assignedCreepsEnergy} stored: ${stored}`,
            'informative'
        )

        return walkablePositions > assigned_creeps.length && stored > assignedCreepsEnergy
    }

    isNotOverAssigned(target: TargetTypes | undefined): boolean {
        if (!target) return false

        const free_energy = this.getFreeCapacity(target as any)
        if (free_energy === 0) return false

        const walkablePositions = this.walkablePositions(target)
        if (walkablePositions === 0) return false

        const assigned_creeps = this.assignedCreeps(target, 'transfer')
        if (assigned_creeps.length === 0) return true

        const assignedCreepsEnergy = assigned_creeps.reduce((total, c) => total + this.getFreeCapacity(c), 0)

        this.log(
            `**notOverAssigned** target: ${target} room: ${this.room} assigned_creeps: ${assigned_creeps.length} walkablePositions: ${walkablePositions} assignedCreepsEnergy: ${assignedCreepsEnergy} stored: ${free_energy}`,
            'informative'
        )

        return walkablePositions > assigned_creeps.length && free_energy > assignedCreepsEnergy
    }

    assignedCreeps(target: TargetTypes | undefined, action: string | undefined = undefined): Creep[] {
        if (!target) return []

        const creepContext = this.getContext('creep')
        const creeps: Creep[] = this.getContext('creeps')

        return creeps.filter(
            (creep) =>
                creep.memory.tasks &&
                creep.memory.tasks.some(
                    (task) => 'id' in task && task.id === target.id && (!action || task.action === action)
                ) &&
                (!creepContext || creep.id !== creepContext.id && creep.pos.getRangeTo(target) <= creepContext.pos.getRangeTo(target))
        )
    }

    walkablePositions(target: TargetTypes | undefined): number {
        if (!target) return 0
        return utils.walkablePositions(target.pos)
    }

    creepsByRole(role: string): Creep[] {
        return this.getContext('creeps').filter((creep: Creep) => creep.memory.role === role)
    }
}
