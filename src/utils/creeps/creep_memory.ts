import { JOB } from './CreepBaseClass'

export type TargetTypes = Creep | Structure | Source | ConstructionSite | Resource

export type TargetType = {
    type: 'position' | 'object' | 'none'
    pos?: RoomPosition // For position targets (runtime)
    id?: string // For object targets (memory and runtime)
    object?: TargetTypes // For object targets (runtime)
    addedAt?: number // When the target was added
    startedAt?: number // When the job started
    expireAt?: number // Optional expiration time
    priority?: number // Target priority
    job?: JOB // Assigned job
}

Object.defineProperty(Creep.prototype, 'target', {
    get: function () {
        if (!this._target) {
            this._target = new TargetManager(this)
        }
        return this._target
    },
})

export class TargetManager {
    targets: TargetType[] = [];
    creep: Creep

    private debugLevel: 'off' | 'minimal' | 'detailed' = 'minimal';

    constructor(creep: Creep) {
        this.creep = creep
        this.loadFromMemory()
    }

    private loadFromMemory(): void {
        const memoryTargets = this.creep.memory._targets ?? []
        this.targets = memoryTargets
            .map((memoryTarget) => this.unserialize(memoryTarget))
            .filter((t): t is TargetType => t !== null) // Exclude invalid or null targets
    }

    private saveToMemory(): void {
        this.creep.memory._targets = this.targets.map((target) => this.serialize(target))
    }

    private serialize(target: TargetType | TargetTypes | RoomPosition | string): TargetType {
        const defaultFields = {
            addedAt: Game.time,
            priority: 100,
            job: undefined,
        }

        if (typeof target === 'string') {
            const gameObject = Game.getObjectById<TargetTypes>(target)
            return gameObject
                ? { type: 'object', id: target, object: gameObject, ...defaultFields }
                : { type: 'none', ...defaultFields }
        }

        if (target instanceof RoomPosition) {
            return { type: 'position', pos: target, ...defaultFields }
        }

        if (this.isGameObject(target)) {
            return { type: 'object', id: target.id, object: target, ...defaultFields }
        }

        if ('type' in target) {
            const { type, pos, id, ...rest } = target

            if (type === 'position' && pos instanceof RoomPosition) {
                return { type: 'position', pos, ...defaultFields, ...rest }
            }

            if (type === 'object' && id) {
                const gameObject = Game.getObjectById<TargetTypes>(id)
                return { type: 'object', id, object: gameObject ?? undefined, ...defaultFields, ...rest }
            }

            if (type === 'none') {
                return { type: 'none', ...defaultFields, ...rest }
            }
        }

        throw new Error(`Unexpected target type during serialization: ${JSON.stringify(target)}`)
    }

    private unserialize(memoryTarget: TargetType): TargetType {
        const { type, pos, id, ...rest } = memoryTarget

        if (type === 'position' && pos) {
            return { type: 'position', pos: new RoomPosition(pos.x, pos.y, pos.roomName), ...rest }
        }

        if (type === 'object' && id) {
            const object = Game.getObjectById<TargetTypes>(id)
            return object ? { type: 'object', object, id, ...rest } : { type: 'none', ...rest }
        }

        if (type === 'none') {
            return { type: 'none', ...rest }
        }

        throw new Error(`Unexpected target type during unserialization: ${JSON.stringify(memoryTarget)}`)
    }

    add(target: TargetTypes | RoomPosition | string, job: JOB, options: { expireAt?: number; priority?: number } = { expireAt: Infinity, priority: 100 }): void {
        const { expireAt, priority } = options

        const wrappedTarget = this.serialize(target)

        if (!this.isValid(wrappedTarget) || this.isDuplicate(wrappedTarget)) {
            this.logDebug(`Skipping invalid or duplicate target: ${JSON.stringify(wrappedTarget)}`, 'minimal')
            return
        }

        if (wrappedTarget.type !== 'none') {
            wrappedTarget.startedAt = Game.time
            wrappedTarget.job = job
            wrappedTarget.priority = wrappedTarget.priority ?? priority
            wrappedTarget.expireAt = wrappedTarget.expireAt ?? expireAt
        }

        this.targets.push(wrappedTarget)
        this.saveToMemory()

        this.logDebug(
            `Added target: ${JSON.stringify(wrappedTarget)} with job: ${job} (ExpireAt: ${expireAt ?? 'None'})`,
            'detailed'
        )
    }

    remove(target: TargetTypes | RoomPosition | string): void {
        const wrappedTarget = this.serialize(target)

        if (!this.isValid(wrappedTarget)) {
            this.logDebug(`Invalid target passed to remove: ${JSON.stringify(target)}`, 'minimal')
            return
        }

        const targetToRemove = this.targets.find((t) => this.isSame(t, wrappedTarget))
        if (targetToRemove) {
            this.creep.memory._lastTarget = wrappedTarget
            this.targets = this.targets.filter((t) => !this.isSame(t, wrappedTarget))
            this.saveToMemory()
        }
    }

    get(): TargetTypes | RoomPosition | null {
        if (this.targets.length === 0) {
            return null // No targets available
        }

        const target = this.targets[0]

        switch (target.type) {
            case 'position':
                return target.pos || null // Return position if available
            case 'object':
                return target.object || null // Return object if available
            case 'none':
            default:
                return null // Handle unexpected types gracefully
        }
    }

    getAll(): TargetType[] {
        return this.targets
    }

    hasTargets(): boolean {
        return this.targets.length > 0
    }

    clear(): void {
        this.targets = []
        this.saveToMemory()
    }

    last(): TargetType | RoomPosition | undefined {
        const lastTarget = this.creep.memory._lastTarget
        return lastTarget ? this.serialize(lastTarget) : undefined
    }

    lastId(): string | undefined {
        const lastTarget = this.last()
        if (!lastTarget) return

        return 'id' in lastTarget ? lastTarget.id : undefined
    }

    isSame(targetA: TargetType, targetB: TargetType | TargetTypes | RoomPosition | string): boolean {
        if (targetA.type === 'none') return false

        const wrappedTargetB = typeof targetB === 'object' && 'type' in targetB ? targetB : this.serialize(targetB)
        if (!wrappedTargetB || wrappedTargetB.type === 'none') return false

        if (targetA.type === 'position' && wrappedTargetB.type === 'position') {
            return (
                targetA.pos?.x === wrappedTargetB.pos?.x &&
                targetA.pos?.y === wrappedTargetB.pos?.y &&
                targetA.pos?.roomName === wrappedTargetB.pos?.roomName
            )
        }

        if (targetA.type === 'object' && wrappedTargetB.type === 'object') {
            return targetA.object?.id === wrappedTargetB.object?.id
        }

        return false
    }

    hasJob(job: JOB, target?: TargetTypes | RoomPosition | string): boolean {
        return this.targets.some((t) => {
            if (t.type === 'none' || t.job !== job) return false
            return target ? this.isSame(t, target) : true
        })
    }

    private isValid(target: TargetType): boolean {
        if (!target || !target.type) return false

        if (target.type === 'none') {
            return false
        }

        if (target.type === 'position') {
            return true
        }

        if (target.type === 'object') {
            return Game.getObjectById(target.object?.id ?? '') !== null
        }

        return false
    }

    private isGameObject(target: unknown): target is TargetTypes {
        if (typeof target !== 'object' || target === null) return false
        return 'id' in target || ('pos' in target && target.pos instanceof RoomPosition)
    }

    private isExpired(memoryTarget: TargetType): boolean {
        return memoryTarget.expireAt !== undefined && Game.time >= memoryTarget.expireAt
    }

    private isDuplicate(newTarget: TargetType): boolean {
        if (newTarget.type === 'none') return false

        return this.targets.some((existingTarget) => this.isSame(existingTarget, newTarget))
    }

    private logDebug(message: string, level: 'minimal' | 'detailed'): void {
        if (this.debugLevel !== 'off' && (this.debugLevel === level || this.debugLevel === 'detailed')) {
            console.log(`Creep [${this.creep.name}] - ${message}`)
        }
    }
}
