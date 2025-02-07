declare global {
    interface RoomPosition {
        _rangeCache: { [key: string]: number }
        _nearCache: { [key: string]: boolean }
        _equalCache: { [key: string]: boolean }

        getRangeToCached: (target: RoomPosition) => number
        isNearToCached: (target: RoomPosition) => boolean
        isEqualToCached: (target: RoomPosition) => boolean
        inRangeToCached: (target: RoomPosition, range: number) => boolean
    }

    interface Creep {
        addTask: (task: TaskObject | TaskPosition, atFront?: boolean) => boolean
        hasTasks: () => boolean
        hasTaskByAction: (action: string) => boolean
        hasTaskById: (id: string) => boolean
        hasTask: (action: string, targetId: string) => boolean
        removeTask: (number: number) => void
        clearTasks: () => void
        getTask: (number: number) => TaskObject | TaskPosition | undefined
        getTaskCount: () => number
        tasks: (TaskObject | TaskPosition)[]
        role: string
        workPower: number
    }

    interface Source {
        walkablePositions: number
    }

    interface RoomMemory {
        walkablePositions: { [key: string]: number }
        repairThreshold: number
    }

    interface Room {
        repairThreshold: number
    }
}

export { }

Object.defineProperty(Room.prototype, 'repairThreshold', {
    get: function () {
        this.memory.repairThreshold ??= 0.3

        return this.memory.repairThreshold
    },
    set: function (value: number) {
        this.memory.repairThreshold = value
    }
})

// Add RoomPosition.getRangeToCached to include caching
RoomPosition.prototype.getRangeToCached = function (target: RoomPosition): number {
    if (!this._rangeCache) {
        this._rangeCache = {}
    }

    const cacheKey = `${this.x},${this.y}-${target.x},${target.y}`
    if (this._rangeCache[cacheKey] === undefined) {
        this._rangeCache[cacheKey] = this.getRangeTo(target)
    }
    return this._rangeCache[cacheKey]
}

// Add RoomPosition.isNearToCached to include caching
RoomPosition.prototype.isNearToCached = function (target: RoomPosition): boolean {
    if (!this._nearCache) {
        this._nearCache = {}
    }

    const cacheKey = `${this.x},${this.y}-${target.x},${target.y}`
    if (this._nearCache[cacheKey] === undefined) {
        this._nearCache[cacheKey] = this.isNearTo(target)
    }
    return this._nearCache[cacheKey]
}

// Add RoomPosition.isEqualToCached to include caching
RoomPosition.prototype.isEqualToCached = function (target: RoomPosition): boolean {
    if (!this._equalCache) {
        this._equalCache = {}
    }

    const cacheKey = `${this.x},${this.y}-${target.x},${target.y}`
    if (this._equalCache[cacheKey] === undefined) {
        this._equalCache[cacheKey] = this.isEqualTo(target)
    }
    return this._equalCache[cacheKey]
}

RoomPosition.prototype.inRangeToCached = function (target: RoomPosition, range: number): boolean {
    return this.getRangeToCached(target) <= range
}

Creep.prototype.addTask = function (task: TaskObject | TaskPosition, atFront?: boolean) {
    if (this.tasks.some(t => {
        if ('id' in task && 'id' in t) {
            return t.id === task.id && t.action === task.action
        }
        if ('pos' in task && 'pos' in t) {
            return t.pos.x === task.pos.x && t.pos.y === task.pos.y && t.action === task.action
        }
        return false
    })) return false

    if (atFront) {
        this.tasks.unshift(task)
    } else {
        this.tasks.push(task)
    }

    return true
}

Creep.prototype.hasTask = function (action: string, targetId: string) {
    return this.tasks.some(t => t.action === action && 'id' in t && t.id === targetId)
}

Creep.prototype.hasTaskByAction = function (action: string) {
    return this.tasks.some(t => t.action === action)
}

Creep.prototype.hasTaskById = function (id: string) {
    return this.tasks.some(t => 'id' in t && t.id === id)
}

Creep.prototype.removeTask = function (number: number) {
    this.tasks.splice(number, 1)
}

Creep.prototype.hasTasks = function (): boolean {
    return this.tasks.length > 0
}

Creep.prototype.clearTasks = function () {
    this.tasks = []
}

Creep.prototype.getTask = function (number: number): TaskObject | TaskPosition | undefined {
    return this.tasks[number]
}

Creep.prototype.getTaskCount = function () {
    return this.tasks.length
}

Object.defineProperty(Creep.prototype, 'tasks', {
    get: function () {
        this.memory.tasks ??= []
        return this.memory.tasks
    },
    set: function (value: (TaskObject | TaskPosition)[]) {
        this.memory.tasks = value
    }
})

Object.defineProperty(Creep.prototype, 'role', {
    get: function () {
        return this.memory.role
    }
})

Object.defineProperty(Creep.prototype, 'workPower', {
    get: function () {
        const workParts = this.body.filter((b: BodyPartDefinition) => b.type === WORK).length

        if (this.role === 'harvester') return workParts * HARVEST_POWER
        if (this.role === 'upgrader') return workParts * UPGRADE_CONTROLLER_POWER
        if (this.role === 'builder') return workParts * BUILD_POWER
        if (this.role === 'repairer') return workParts * REPAIR_POWER
        if (this.role === 'attacker') return workParts * ATTACK_POWER
        if (this.role === 'ranger') return workParts * RANGED_ATTACK_POWER

        return workParts
    }
})

Object.defineProperty(Source.prototype, 'walkablePositions', {
    get: function () {
        this.room.memory.walkablePositions ??= {}

        if (this.room.memory.walkablePositions[this.id] === undefined) {
            this.room.memory.walkablePositions[this.id] = this.room
                .lookAtArea(this.pos.y - 1, this.pos.x - 1, this.pos.y + 1, this.pos.x + 1, true)
                .filter((result: LookAtResult) => result.terrain === 'swamp' || result.terrain === 'plain')
                .length
        }

        return this.room.memory.walkablePositions[this.id]
    }
})
