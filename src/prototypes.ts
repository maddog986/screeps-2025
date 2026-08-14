import CreepManager from 'creep_manager'
import RoomHivemind from 'room_hivemind'

const rangeCache: { [key: string]: number } = {}
const nearCache: { [key: string]: boolean } = {}
const equalCache: { [key: string]: boolean } = {}

declare global {
    interface RoomPosition {
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
        _manager: CreepManager
        manager: CreepManager
        workPower: (action: string) => number
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
        _manager: RoomHivemind
        manager: RoomHivemind
    }
}

export { }

// manager
Object.defineProperty(Room.prototype, 'manager', {
    get: function () {
        if (!this._manager) this._manager = new RoomHivemind(this)
        return this._manager
    }
})

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
    const cacheKey = `${this.x},${this.y}-${target.x},${target.y}-${target.roomName}`
    if (rangeCache[cacheKey] === undefined) {
        rangeCache[cacheKey] = this.getRangeTo(target)
    }
    return rangeCache[cacheKey]
}

// Add RoomPosition.isNearToCached to include caching
RoomPosition.prototype.isNearToCached = function (target: RoomPosition): boolean {
    const cacheKey = `${this.x},${this.y}-${target.x},${target.y}-${target.roomName}`
    if (nearCache[cacheKey] === undefined) {
        nearCache[cacheKey] = this.isNearTo(target)
    }
    return nearCache[cacheKey]
}

// Add RoomPosition.isEqualToCached to include caching
RoomPosition.prototype.isEqualToCached = function (target: RoomPosition): boolean {
    const cacheKey = `${this.x},${this.y}-${target.x},${target.y}-${target.roomName}`
    if (equalCache[cacheKey] === undefined) {
        equalCache[cacheKey] = this.isEqualTo(target)
    }
    return equalCache[cacheKey]
}

RoomPosition.prototype.inRangeToCached = function (target: RoomPosition, range: number): boolean {
    return this.getRangeToCached(target) <= range
}

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

Object.defineProperty(Creep.prototype, 'manager', {
    get: function () {
        this._manager ??= new CreepManager(this)
        return this._manager
    }
})

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

    this.room.manager.creepsByTask[task.action].push(this)

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

Creep.prototype.workPower = function (action: string) {
    return this.manager.workPower(action)
}
