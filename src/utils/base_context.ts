import { CONFIG } from 'config'
import BaseDebugger from './base_debugger'
import { cpuLog } from './cache'
import utils from './utils'

type AssignedActions = 'transfer' | 'withdraw' | 'harvest' | 'build' | 'repair' | 'renew'

type ContextType = {
    RESOURCE_ENERGY: typeof RESOURCE_ENERGY
    room: Room
    roomName: string
    controller?: StructureController
    controllerLevel: number
    energyAvailable: number
    energyCapacityAvailable: number
    creeps: () => Creep[]
    enemies: () => Creep[]
    spawns: () => StructureSpawn[]
    activeSources: () => Source[]
    sources: () => Source[]
    constructionSites: () => ConstructionSite[]
    structures: () => AnyStructure[]
    containers: () => StructureContainer[]
    towers: () => StructureTower[]
    assignedCreeps: (target: TargetTypes, action?: string) => Creep[]
    freeCapacity: (target: TargetTypes) => number
    usedCapacity: (target: TargetTypes) => number
    notOverAssignedTo: (action: AssignedActions) => (target: TargetTypes | undefined) => boolean
    walkablePositions: (target: TargetTypes | undefined) => number
    creepsByRole: (role: string) => Creep[]
    // findRandomRoomToExit: (roomName: string) => RoomPosition | undefined
    droppedResources: () => Resource[]
    tombstones: () => Tombstone[]
}

// memoize walkable positions
const _walkablePositions: { [key: string]: number } = {}

export default class BaseContext<TContext extends Record<string, any> = {}> extends BaseDebugger {
    protected room: Room

    private memoizationCache: Record<string, any>
    private proxy: TContext & ContextType // Extendable proxy

    public config: RoomConfig

    constructor(room: Room, prefix: string) {
        super(prefix)

        this.room = room
        this.config = CONFIG?.rooms[room.name] ?? CONFIG.rooms.default
        this.memoizationCache = {} // Cache storage

        // Base context definitions
        const baseContext: ContextType = {
            // Base constants
            RESOURCE_ENERGY: RESOURCE_ENERGY,

            controller: room.controller,
            controllerLevel: room.controller ? (room.controller.level + room.controller.progress / room.controller.progressTotal) : 0,

            energyAvailable: room.energyAvailable,
            energyCapacityAvailable: room.energyCapacityAvailable,

            room: room,
            roomName: room.name,

            // Find functions
            activeSources: () => (this.getContext('sources') as Source[]).filter(s => s.energy > 0),
            constructionSites: () => room.find(FIND_MY_CONSTRUCTION_SITES),
            containers: () => this.getContext('structures').filter(this.filterByStructureType([STRUCTURE_CONTAINER])),
            creeps: () => room.find(FIND_MY_CREEPS),
            droppedResources: () => room.find(FIND_DROPPED_RESOURCES),
            enemies: () => room.find(FIND_HOSTILE_CREEPS),
            sources: () => room.find(FIND_SOURCES),
            spawns: () => room.find(FIND_MY_SPAWNS),
            structures: () => room.find(FIND_STRUCTURES),
            tombstones: () => room.find(FIND_TOMBSTONES),
            towers: () => this.getContext('structures').filter(this.filterByStructureType([STRUCTURE_TOWER])),

            // Helper functions
            assignedCreeps: this.assignedCreeps.bind(this),
            creepsByRole: this.creepsByRole.bind(this),
            // findRandomRoomToExit: this.findRandomRoomToExit.bind(this),
            freeCapacity: this.getFreeCapacity.bind(this),
            notOverAssignedTo: this.isNotOverAssignedTo.bind(this),
            usedCapacity: this.getUsedCapacity.bind(this),
            walkablePositions: this.walkablePositions.bind(this),
        }

        // Use Proxy for lazy evaluation of context properties
        this.proxy = new Proxy(baseContext as TContext & ContextType, {
            get: (target: any, prop: string) => (prop in target ? target[prop] : undefined),
            set: (target: any, prop: string, value: any) => {
                target[prop] = value
                return true
            },
        })
    }

    protected contextKeys() {
        return Object.keys(this.proxy)
    }

    protected contextValues() {
        return Object.values(this.proxy)
    }

    protected setContext<K extends string, V>(key: K, value: V): asserts this is BaseContext<TContext & Record<K, V>> {
        (this.proxy as Record<K, V>)[key] = value
    }

    protected getContext<K extends keyof (TContext & ContextType)>(
        key: K,
        cache?: boolean
    ): (TContext & ContextType)[K] {
        const cacheKey = key as string

        this.logCpu()

        if (["enemies", "structures", "sources", "spawns", "constructionSites", "containers", "towers", "droppedResources"].includes(String(key))) cache = true

        if (cache && cacheKey in this.memoizationCache) {
            this.log(`#8cc16e[**getContext**] ${String(key)} cpu used: ${this.getLogCpu()}`)

            return this.memoizationCache[cacheKey] as (TContext & ContextType)[K]
        }

        const value = this.proxy[cacheKey]
        const result = typeof value === 'function' ? value() : value

        this.log(`#e1554e[**getContext**] ${String(key)} cpu used: ${this.getLogCpu()}`)

        if (cache) {
            this.memoizationCache[cacheKey] = result
        }

        return result
    }

    @cpuLog
    protected evaluateExpression(expression: string): any {
        return new Function(...this.contextKeys(), `return ${expression};`).bind(this)(...this.contextValues())
    }

    getFreeCapacity(target: TargetTypes): number {
        if (!target) return 0

        if ('store' in target) {
            return Math.max(target.store.getFreeCapacity(), target.store.getFreeCapacity(RESOURCE_ENERGY), 0)
        }

        if ('energy' in target && 'energyCapacity' in target) {
            return target.energyCapacity - target.energy
        }

        return 0
    }

    getUsedCapacity(target: TargetTypes): number {
        if (!target) return 0

        if ('store' in target) {
            return Math.max(target.store.getUsedCapacity(RESOURCE_ENERGY), target.store.getUsedCapacity(), 0)
        }

        if ('energy' in target) {
            return target.energy
        }

        return 0
    }

    @cpuLog
    isNotOverAssignedTo(action: AssignedActions) {
        return (target: TargetTypes | undefined): boolean => {
            if (!target) return false

            // console.log("\n------------", `isNotOverAssignedTo ${action} target:`, target)

            const freeCapacity = this.getFreeCapacity(target)
            // console.log('freeCapacity:', freeCapacity)

            const usedCapacity = this.getUsedCapacity(target)
            // console.log('usedCapacity:', usedCapacity)

            if (action === 'transfer' && freeCapacity === 0) {
                return false
            } else if (action === 'withdraw' && usedCapacity === 0) {
                return false
            }

            const assignedCreeps = this.assignedCreeps(target, action)
            // console.log('assignedCreeps:', assignedCreeps)
            if (assignedCreeps.length === 0) return true

            // limit number of creeps assigned to a target during transfer
            if (action === 'transfer' && assignedCreeps.length > 3) return false

            // limit number of creeps assigned to a target during renew
            if (action === 'renew' && assignedCreeps.length > 1) return false

            if (action === 'harvest' || target instanceof Source) {
                const walkablePositions = this.walkablePositions(target)
                // console.log('walkablePositions:', walkablePositions)
                if (walkablePositions === 0) return false

                // no positions left
                if (walkablePositions <= assignedCreeps.length) return false
            }

            // if target is spawn, will it be full before creep can get to it
            if (action === 'transfer' && target instanceof StructureSpawn) {
                const creep = this.getContext('creep')
                if (creep) {
                    const distance = creep.pos.getRangeTo(target)
                    const freeCapacity = target.store.getFreeCapacity() || 0
                    // spawn regens 1 energy per tick
                    if (distance > freeCapacity) return false
                }
            }

            if (action === 'transfer') {
                const assignedCreepsUsedCapacity = assignedCreeps.reduce((total, c) => total + this.getUsedCapacity(c), 0)
                return freeCapacity > assignedCreepsUsedCapacity
            } else if (action === 'withdraw') {
                const assignedCreepsFreeCapacity = assignedCreeps.reduce((total, c) => total + this.getFreeCapacity(c), 0)
                return usedCapacity > assignedCreepsFreeCapacity
            }

            return true
        }
    }

    @cpuLog
    assignedCreeps(target: TargetTypes | undefined, action: string | undefined = undefined): Creep[] {
        if (!target) return []

        const creepContext = this.getContext('creep')
        const creeps: Creep[] = this.getContext('creeps', true)

        // console.log(`assignedCreeps: target: ${target} action: ${action} creepContext: ${creepContext} creeps: ${creeps}`)

        const ROLE_PRIORITY: Record<string, number> = {
            mule: 1,
            builder: 2,
            harvester: 3,
        }

        return creeps
            .filter((creep) => {
                if (!creepContext) return true
                return ROLE_PRIORITY[creep.memory.role] >= ROLE_PRIORITY[creepContext.memory.role]
            })
            .filter((creep) =>
                creep.memory.tasks &&
                creep.memory.tasks.some((task) => 'id' in task && task.id === target.id && (!action || task.action === action)) &&
                (!creepContext || creep.id !== creepContext.id && creep.pos.getRangeTo(target) <= creepContext.pos.getRangeTo(target))
            )
    }

    @cpuLog
    walkablePositions(target: TargetTypes | undefined): number {
        if (!target) return 0

        if (target.id in _walkablePositions) {
            return _walkablePositions[target.id]
        }

        const positions = utils.walkablePositions(target.pos)

        _walkablePositions[target.id] = positions

        return positions
    }

    creepsByRole(role: string): Creep[] {
        return this.getContext('creeps', true).filter((creep: Creep) => creep.memory.role === role)
    }

    // sort by shortcuts
    sortByFreeCapacity(a: TargetTypes, b: TargetTypes): number {
        return this.getFreeCapacity(a) - this.getFreeCapacity(b)
    }
    sortByUsedCapacity(a: TargetTypes, b: TargetTypes): number {
        return this.getUsedCapacity(a) - this.getUsedCapacity(b)
    }

    @cpuLog
    sortByRange(a: TargetTypes, b: TargetTypes): number {
        return a.pos.getRangeTo(a) - b.pos.getRangeTo(b)
    }

    @cpuLog
    sortByCreepRange(a: TargetTypes, b: TargetTypes): number {
        return a.pos.getRangeTo(this.getContext('creep')) - b.pos.getRangeTo(this.getContext('creep'))
    }

    // filter by free capacity
    filterByHasFreeCapacity(target: TargetTypes): boolean {
        return this.getFreeCapacity(target) > 0
    }
    // filter by used capacity
    filterByHasUsedCapacity(target: TargetTypes): boolean {
        return this.getUsedCapacity(target) > 0
    }

    // filter by structure type
    filterByStructureType<T extends StructureConstant[]>(types: readonly [...T]) {
        return (structure: AnyStructure): structure is Extract<AnyStructure, { structureType: T[number] }> =>
            types.includes(structure.structureType)
    }

    // filter by near something
    @cpuLog
    filterByNear<T extends _HasRoomPosition>(targets: T[], range: number = 1) {
        return <S extends _HasRoomPosition>(structure: S): boolean =>
            targets.some(target => structure.pos.inRangeTo(target.pos, range))
    }

    // findRandomRoomToExit(roomName: string): RoomPosition | undefined {
    //     const nextRoomName = utils.getNextScoutRoom(roomName)
    //     if (!nextRoomName) return

    //     return new RoomPosition(25, 25, nextRoomName)
    // }
}
