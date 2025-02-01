import creepActions from 'creep/creep_actions'
import 'creep/creep_traveler'
import CreepMovement from 'creep/creep_traveler'
import { cpuLog } from 'utils/cache'
import utils from 'utils/utils'

declare global { // using global declaration to extend the existing types
    interface TaskPosition {
        pos: RoomPosition
        action: string
        blocking?: boolean
        completed?: boolean
        persistent?: boolean
    }

    interface TaskObject {
        id: string
        action: string
        object?: TargetTypes
        blocking?: boolean
        completed?: boolean
        persistent?: boolean
    }

    // types of tasks
    type TaskType = TaskPosition | TaskObject

    // types of objects that can be targeted
    type TargetTypes = Creep | Structure | Source | ConstructionSite | Resource | StructureContainer | StructureController | Tombstone

    // types of actions that can be executed only once per tick
    type ActionTypes = 'move' | 'work' | 'transfer' | 'pickup' | 'build' | 'upgrade' | 'repair' | 'withdraw' | 'attack'

    interface ActionResult {
        success: ScreepsReturnCode		// The result of the action
        actions?: {						// The categories of actions that were executed
            [key in ActionTypes]?: ScreepsReturnCode
        }
        blocking?: boolean				// If true, the task will not be removed from the list until it is completed
        persistent?: boolean 			// If true, the task will not be removed from the list until it is completed
    }

    interface CreepMemory {
        tasks?: TaskType[] // Optional list of tasks assigned to the creep
        idle: number
        direction?: DirectionConstant
    }

    interface Creep {
        _manager?: CreepManager
        manager: CreepManager
    }

    interface Memory {
        territory: {
            avoid: string[]
        }
    }
}

// // extend Creep prototype
if (!Creep.prototype._manager) {
    Object.defineProperty(Creep.prototype, 'manager', {
        get: function (): CreepManager {
            if (!this._manager) {
                this._manager = new CreepManager(this)
            }
            return this._manager
        },
    })
}

export default class CreepManager<TContext extends Record<string, any> = {}> extends CreepMovement<TContext> {
    completed: Set<ActionTypes>
    assignedTasks: TaskConfig[]

    constructor(creep: Creep) {
        // debugger
        super(creep)

        this.completed = new Set()
        this.assignedTasks = this.config?.creeps[creep.memory.role]?.tasks || []

        // make sure tasks is set
        this.creep.memory.tasks ??= []

        this.log(`**CreepManager.constructor:** ${creep.name} loaded data:`, {
            tasks_assigned: this.assignedTasks.length,
            tasks_in_memory: [...this.creep.memory.tasks],
        })


        if (creep.ticksToLive && creep.ticksToLive < 100) {
            creep.manager.addTask({
                action: 'renew',
                id: this.creep.room.manager.spawn.id,
            })
        }
    }

    setupContext() {
        // set some extra context
        this.setContext('creep', this.creep)
        this.setContext('closestSpawn', () => this.creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: (s) => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        }))
        this.setContext('closestSource', () => this.creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE, {
            filter: this.isNotOverAssignedTo('harvest').bind(this),
        }))
        this.setContext('closestByPath', (type: FindConstant) => this.creep.pos.findClosestByPath(type))
        this.setContext('closestByRange', (type: FindConstant) => this.creep.pos.findClosestByRange(type))
        this.setContext('closestConstructionSite', () => (this.getContext('constructionSites', true) as ConstructionSite[])
            // sort by most done first
            .sort((a, b) => b.progress - a.progress)
        // first one
        [0]
        )
        this.setContext('closestHostile', (type: FindConstant) => this.creep.pos.findClosestByPath(this.getContext('enemies', true)))
    }

    @cpuLog
    run() {
        // clear out empty travels
        if (this.creep.memory.travel) {
            const { destination, lastPos } = this.creep.memory.travel

            const targetPos = new RoomPosition(destination.x, destination.y, destination.roomName)
            if (this.creep.pos.isEqualTo(targetPos)) {
                this.log(`**traveler:** at target position. clearing data:`, this.creep.memory.travel)
                delete this.creep.memory.travel
            }
        }

        this.executeTasks()
    }

    private creepPassesChecks(action: string): boolean {
        // creep pre-checks
        if (['transfer', 'build', 'repair', 'upgrade'].includes(action) && this.getUsedCapacity(this.creep) === 0) {
            this.log(`**performAction:** pre-check creep for **${action}**. no storage capacity. cleared task.`)
            return false
        } else if (['withdraw', 'harvest'].includes(action) && this.getFreeCapacity(this.creep) === 0) {
            this.log(`**performAction:** pre-check creep for **${action}**. no free capacity (${this.getFreeCapacity(this.creep)}). cleared task.`)
            return false
        } else if (['renew'].includes(action) && this.creep.ticksToLive && this.creep.ticksToLive > 1450) {
            return false
        } else if (['heal'].includes(action) && this.creep.hits === this.creep.hitsMax) {
            return false
        }

        return true
    }

    private targetPassesChecks(action: string, target: TargetTypes | RoomPosition): boolean {
        if (target instanceof RoomPosition) return true

        // target pre-checks
        if (['transfer'].includes(action) && this.getFreeCapacity(target) === 0) {
            this.log(`**performAction:** pre-check target ${action}. no free capacity. cleared task.`)
            return false
        } else if (['withdraw', 'harvest', 'renew'].includes(action) && this.getUsedCapacity(target) === 0) {
            this.log(`**performAction:** pre-check target ${action}. no used capacity. cleared task.`)
            return false
        } else if (['renew'].includes(action) && target instanceof StructureSpawn && target.spawning) {
            return false
        }

        if (action === 'transfer' && target instanceof StructureSpawn) {
            const creep = this.getContext('creep')
            if (creep) {
                const distance = creep.pos.getRangeTo(target)
                const freeCapacity = target.store.getFreeCapacity() || 0
                if (distance > freeCapacity) return false
            }
        }

        return true
    }

    // convert memory task to object
    private unserializeTask(memoryTask: TaskType): TaskType | undefined {
        if ('pos' in memoryTask) {
            const { pos } = memoryTask as TaskPosition
            return { ...memoryTask, pos: new RoomPosition(pos.x, pos.y, pos.roomName) } as TaskPosition
        }

        if ('id' in memoryTask) {
            const { id } = memoryTask as TaskObject
            const object = Game.getObjectById<TargetTypes>(id)
            return object ? { ...memoryTask, id, object } as TaskObject : undefined
        }

        return
    }

    // add task to creep memory
    public addTask(task: TaskType, priorty: boolean = false): void {
        task.completed = undefined
        task.persistent = undefined

        this.creep.memory.tasks ??= []

        if (this.creep.memory.tasks.some(t => JSON.stringify(t) === JSON.stringify(task))) {
            this.log(`**addTask:** task already exists:`, task)
            return
        }

        this.log(`**addTask:** add new task:`, { ...task })

        if (priorty) {
            this.creep.memory.tasks.unshift(task)
        } else {
            this.creep.memory.tasks.push(task)
        }
    }

    public hasTask(action: string): boolean {
        this.creep.memory.tasks ??= []

        return this.creep.memory.tasks.some(task => task.action === action)
    }

    @cpuLog
    private processTasks() {
        // make sure context is setup
        this.setupContext()

        // Iterate through the configuration to find a matching condition
        for (const assignedTask of this.assignedTasks) {
            this.log(`**processTasks:** assignedTask check:`, assignedTask)

            const { action } = assignedTask

            // creep pre-checks
            if (!this.creepPassesChecks(action)) continue

            // Resolve the target dynamically
            const target: TargetTypes | RoomPosition | undefined = this.evaluateExpression(assignedTask.target)
            if (!target || typeof target === 'function') {
                this.log(`**processTasks:** #FFA2A2[**target not found:**]`, { target: assignedTask.target, resolved: target })
                continue
            }

            // target pre-checks
            if (!this.targetPassesChecks(action, target)) continue

            // save target
            this.setContext('target', target)
            this.setContext('creep', this.creep)

            // check conditions
            if (assignedTask.conditions) {
                if (!assignedTask.conditions.every((cond: string) => this.evaluateExpression(cond))) {
                    this.log(`**processTasks:** #FFA2A2[**condition failed:**] conditions:`, assignedTask.conditions)
                    continue
                }

                this.log(`**processTasks:** #BCFFA2[**condition passed:**] conditions:`, assignedTask.conditions)
            }

            // check validates of the task
            if (assignedTask.validates && !assignedTask.validates.every((cond: string) => this.evaluateExpression(cond))) {
                this.log(`**processTasks:** #FFA2A2[**validate failed:**] validates:`, assignedTask.validates)
                continue
            }

            // Add the task
            if ('id' in target) {
                this.addTask({
                    id: target.id,
                    action,
                })
            } else if (target instanceof RoomPosition) {
                this.addTask({
                    pos: target,
                    action,
                })
            }


            break // Stop processing after assigning a task
        }
    }

    // execute all tasks in memory
    @cpuLog
    executeTasks(): void {
        this.creep.memory.tasks ??= []

        // if not tasks found, find some
        if (this.creep.memory.tasks.length === 0) {
            this.log(`**CreepManager.executeTasks:** no tasks found. processing tasks.`)
            this.processTasks()
        }

        // make sure context is setup
        this.setupContext()

        this.log(`**executeTasks:** all tasks assigned to memory:`, [...this.creep.memory.tasks])

        // task result types:
        // completed: ran during this tick
        // blocking: task is blocking and other tasks should not follow
        // persistent: task will not be removed from memory until completed

        // loop through all tasks
        while (this.creep.memory.tasks.length > 0) {
            // find a task that is not completed
            const task = this.creep.memory.tasks.find(task => !task.completed)
            if (!task) {
                this.log('**executeTasks:** Tasks loop completed.')
                break
            }

            // mark as run this tick
            task.completed = true

            this.log(`**executeTasks:** perform task '${task.action}'. details:`, { ...task })

            const unserialized = this.unserializeTask(task) as TaskPosition | TaskObject
            if (!unserialized) {
                this.log(`**executeTasks:** "unserialized" is invalid for task.`)
                this.creep.memory.tasks.shift()
                continue
            }

            const { action, ...rest } = unserialized

            const target = 'pos' in rest ? rest.pos : rest.object
            if (!target) {
                this.log(`**executeTasks:** "target" invalid for task **${action}**`)
                this.creep.memory.tasks.shift()
                continue
            }

            this.log(`**executeTasks:** target: ${target}`)

            // creep and target pre-checks
            if (!this.creepPassesChecks(action) || !this.targetPassesChecks(action, target)) {
                this.creep.memory.tasks.shift()
                continue
            }

            // creep is fatigued and cannot perform actions
            if (this.creep.fatigue > 0 && ["harvest", "upgrade", "build", "repair"].includes(action)) {
                continue
            }

            // make sure context is setup
            this.setupContext()
            this.setContext('target', target)
            this.setContext('creep', this.creep)

            const taskConfig = this.assignedTasks.find(entry => entry.action === action)

            if (taskConfig && taskConfig?.validates?.length) {
                this.log(`**executeTasks** task revalidation for **${action}**:`, taskConfig)

                const conditionsMet = taskConfig.validates.every((cond: string) => this.evaluateExpression(cond))
                if (conditionsMet) {
                    this.log(`**executeTasks:** #BCFFA2[**validation passed.**]`)
                } else {
                    this.log(`**executeTasks:** #FFA2A2[**task validation failed.**]`)
                    this.creep.memory.tasks.shift()
                    continue
                }
            }

            if (action !== 'move') {
                const range = (target instanceof StructureController || target instanceof ConstructionSite) ? 3 : 1
                if (range < this.creep.pos.getRangeTo(target)) {
                    const moveResult = this.creep.manager.move(target, { range })
                    this.log(`**executeTasks:** not within range for **${action}**. move result: ${moveResult}`)

                    if (moveResult === OK) {
                        this.log('**executeTasks:** completed: move')
                        this.completed.add("move")
                    }

                    task.persistent = true // persist the task for another tick

                    if (task.blocking) {
                        break
                    } else {
                        continue
                    }
                }
            }

            // run the action to get the result
            const result = creepActions[action] && creepActions[action](this, target)
            this.log(`**executeTasks:** action **${action}** result:`, result)

            // loop through actions to make as completed if result is OK
            Object.keys(result.actions || {}).forEach(action => {
                if (result.actions![action as ActionTypes] === OK) {
                    this.log(`**executeTasks** completed action: ${action}`)
                    this.completed.add(action as ActionTypes)
                }
            })

            // remove the task from the list if it was successful and not permanent
            if ([OK, ERR_NOT_OWNER, ERR_NOT_FOUND, ERR_NOT_ENOUGH_RESOURCES, ERR_INVALID_TARGET].includes(result.success as any) && !result.persistent) {
                this.log(`**executeTasks:** removing task ${action}.`)
                this.creep.memory.tasks.shift() // removes task from memory
                continue
            }

            // dont run anymore tasks after a blocking task
            if (task.blocking) {
                this.log(`**executeTasks:** task is blocking. not processing anymore tasks.`)
                break
            }
        }

        this.log(`**executeTasks:** completed actions. Memory:`, [...this.creep.memory.tasks])

        // update creep memory
        this.creep.memory.tasks = this.creep.memory.tasks
            //.filter(task => !task.completed && !task.persistent) // tasks to keep around for next time
            .map(task => {
                task.completed = undefined
                task.persistent = undefined
                return task
            })

        this.log('**executeTasks** completed:', {
            completed_actions: Array.from(this.completed),
            updated_memory_tasks: [...this.creep.memory.tasks],
        })

        this.creep.memory.idle ??= 0

        if (this.creep.memory.tasks.length === 0) {
            // reset travel if no tasks are left
            this.creep.memory.travel = undefined

            // increase idle timer
            this.creep.memory.idle++
        } else {
            this.creep.memory.idle = 0
        }


        // only continue if CPU is tammed
        if (this.creep.room.manager.getCurrentCpu() > 10) {
            this.log(`**executeTasks:** CPU limit reached: ${this.creep.room.manager.getCurrentCpu()}`)
            return
        }

        if (!this.creep.memory.travel && this.creep.memory.role !== 'mule') {
            const spawns = this.room.manager.spawns
            spawns.forEach((s) => {
                if (this.completed.has('move') || this.creep.pos.getRangeTo(s) > 1) return
                const directionTo = this.creep.pos.getDirectionTo(s)
                // reverse direction
                const reverseDirection = utils.reverseDirection(directionTo)
                // randomize direction
                const randomDirection = utils.getRandomAdjacentDirection(reverseDirection)
                this.log(`**move:** directionTo: ${directionTo}, reverseDirection: ${reverseDirection}, randomDirection: ${randomDirection}`)
                const move = this.creep.move(randomDirection)
                if (move === OK) {
                    this.completed.add('move')
                }
            })
        }
    }
}
