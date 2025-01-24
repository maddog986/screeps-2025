import { CONFIG } from 'config'
import creepActions from 'creep_actions'
import 'creep_traveler'
import utils from 'utils/utils'
import './utils/debugger'
import Debugger from './utils/debugger'

declare global { // using global declaration to extend the existing types
    interface TaskPosition {
        pos: RoomPosition
        task: string
        params?: TaskParams
        completed?: boolean
        added?: number
        started?: number
    }

    interface TaskObject {
        id: string
        task: string
        object?: TargetTypes
        params?: TaskParams
        completed?: boolean
        added?: number
        started?: number
    }

    type TaskParams = Record<string, any>

    // types of tasks
    type TaskType = TaskPosition | TaskObject

    // types of objects that can be targeted
    type TargetTypes = Creep | Structure | Source | ConstructionSite | Resource

    // types of actions that can be executed only once per tick
    type ActionTypes = 'move' | 'work' | 'transfer' | 'pickup' | 'build' | 'upgrade' | 'repair'

    interface ActionResult {
        success: ScreepsReturnCode		// The result of the action
        actions?: {						// The categories of actions that were executed
            [key in ActionTypes]?: ScreepsReturnCode
        }
        blocking?: boolean 				// If true, the task will stop the execution of the task list
        permanent?: boolean 			// If true, the task will not be removed from the list until it is completed
        additionalActions?: TaskType[] 	// Follow-up actions
    }

    interface CreepMemory {
        tasks?: TaskType[] // Optional list of tasks assigned to the creep
    }

    interface Creep {
        _manager?: CreepManager
        manager: CreepManager
    }
}

export default class CreepManager extends Debugger {
    private customActions: Record<string, (base: CreepManager, target: TargetTypes | RoomPosition, params: TaskParams) => ActionResult> = {};

    creep: Creep
    completed: Set<ActionTypes>
    tasks: { condition: string; validate?: string; task: { type: string; target: string } }[]

    // how many attempts have been used to find tasks
    private attempts = 0

    constructor(creep: Creep) {
        // debugger
        super(false, 'creep_manager', 'basic')

        this.creep = creep
        this.creep.memory.tasks = this.creep.memory.tasks || []
        this.completed = new Set()
        this.tasks = CONFIG.rooms[this.creep.room.name]?.creeps[this.creep.memory.role]?.tasks || []

        if (this.creep.memory.tasks.length === 0) {
            this.processTasks(this.tasks)
        }
    }

    // convert memory task to object
    private unserialize(work: TaskType): TaskType | undefined {
        if ('pos' in work) {
            const { pos } = work as TaskPosition
            return { ...work, pos: new RoomPosition(pos.x, pos.y, pos.roomName) } as TaskPosition
        }

        if ('id' in work) {
            const { id } = work as TaskObject
            const object = Game.getObjectById<TargetTypes>(id)
            return object ? { ...work, id, object } as TaskObject : undefined
        }

        return
    }

    // register custom action
    registerAction(actionName: string, handler: (base: CreepManager, target: TargetTypes | RoomPosition, params: TaskParams) => ActionResult): void {
        this.customActions[actionName] = handler
    }

    // add task to creep memory
    addTask(task: TaskType): void {
        task.added = Game.time

        // console.log(this.creep.name, 'added task', JSON.stringify(task))
        this.creep.memory.tasks = this.creep.memory.tasks || []
        this.creep.memory.tasks.push(task)
    }

    // Define all potential keys that might be accessed in conditions
    private keys = [
        'creep',
        'closestSpawn',
        'closestSource',
        'controller',
        'enemies',
        'freeCapacity',
        'usedCapacity',
        'findClosestByPath',
        'spawns',
        'sources',
        'notOverAssigned'
    ];

    private resolveContextValue(key: typeof this.keys[number]): any {
        switch (key) {
            case 'creep':
                return this.creep
            case 'closestSpawn':
                return this.creep.pos.findClosestByPath(FIND_MY_SPAWNS)
            case 'closestSource':
                return this.creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE, {
                    filter: (source) =>
                        // not over assigned
                        utils.walkablePositions(source.pos) > Object.values(Game.creeps)
                            // creeps assigned to this source
                            .filter(creep => creep.memory.tasks && creep.memory.tasks.find(task => 'id' in task && task.id === source.id)).length
                })
            case 'controller':
                return this.creep.room.controller
            case 'enemies':
                return this.creep.room.find(FIND_HOSTILE_CREEPS)
            case 'freeCapacity':
                return (target: { store: StoreDefinition }, resource = RESOURCE_ENERGY) => target.store && target.store.getFreeCapacity(resource)
            case 'usedCapacity':
                return (target: { store: StoreDefinition }, resource = RESOURCE_ENERGY) => target.store && target.store.getUsedCapacity(resource)
            case 'findClosestByPath':
                return (type: FindConstant) => this.creep.pos.findClosestByPath(type)
            case 'notOverAssigned':
                return (target: TargetTypes, type: 'transfer' | 'withdraw' | undefined) => {
                    const assigned_creeps = Object.values(Game.creeps)
                        // creeps assigned to this source
                        .filter(creep => creep.memory.tasks && creep.memory.tasks.find(task => 'id' in task && task.id === target.id && task.task === type))

                    // not over assigned
                    return utils.walkablePositions(target.pos) > assigned_creeps.length &&

                        // not over assigned to transfer
                        (!type || (
                            type === 'transfer' &&

                            // free capacity of target
                            (target as Structure & { store: StoreDefinition }).store.getFreeCapacity(RESOURCE_ENERGY) >=

                            // total energy assigned to this target
                            assigned_creeps
                                // closer to
                                .filter(c => c.pos.getRangeTo(target) < this.creep.pos.getRangeTo(target))
                                // total up the energy assigned to this target
                                .reduce((total, c) => total + c.store.getUsedCapacity(RESOURCE_ENERGY), 0)
                        )
                        )
                }
            case 'spawns':
                return this.creep.room.find(FIND_MY_SPAWNS)
            case 'sources':
                return this.creep.room.find(FIND_SOURCES_ACTIVE)
            default:
                throw new Error(`Unknown context key: ${key}`)
        }
    }

    private context(): Record<string, any> {
        const lazyContext: Record<string, any> = {
            "RESOURCE_ENERGY": RESOURCE_ENERGY,
        }

        this.keys.forEach(key => (lazyContext[key] = undefined))

        // Define getters for lazy evaluation
        return new Proxy(lazyContext, {
            get: (target, prop: string) => {
                if (target[prop] === undefined) {
                    target[prop] = this.resolveContextValue(prop)
                }

                return target[prop]
            },
        })
    }

    processTasks(config: any) {
        const context = this.context()

        // Iterate through the configuration to find a matching condition
        for (const entry of this.tasks) {
            // Evaluate the condition dynamically using the context
            const condition = new Function(...Object.keys(context), `return ${entry.condition}`).bind(this)
            if (condition(...Object.values(context))) {
                // Resolve the target dynamically
                const target = entry.task.target
                const resolvedTarget = target in context ? context[target] : target

                // Add the task
                if (resolvedTarget) {
                    this.addTask({
                        id: resolvedTarget.id,
                        task: entry.task.type,
                    })
                }
                break // Stop processing after assigning a task
            }
        }
    }

    // execute all tasks in memory
    executeTasks(): void {
        this.attempts++

        // get tasks from creep memory
        const tasks = this.creep.memory.tasks || []

        // this.debug('tasks:', tasks)

        // loop through all tasks
        while (tasks.length > 0) {
            // find a task that is not completed
            const task = tasks.find(task => !task.completed)
            if (!task) break

            // make sure task is valid
            if ('id' in task === false && 'pos' in task === false) {
                // this.debug('task is invalid', task)
                tasks.shift()
                continue
            }

            if (!task.started) {
                task.started = Game.time
            }

            // perform the task action
            const result = this.performAction(task)

            // mark as run this tick
            task.completed = true

            // loop through actions to make as completed if result is OK
            Object.keys(result.actions || {}).forEach(action => {
                if (result.actions![action as ActionTypes] === OK) {
                    this.completed.add(action as ActionTypes)
                }
            })

            // console.log(this.creep.name, 'executed task', JSON.stringify(task), 'result', JSON.stringify(result))

            // remove the task from the list if it was successful and not permanent
            if (result.success === OK && !result.permanent) {
                // this.debug('task completed', task)
                tasks.shift() // removes task from memory
            }

            // task has additional actions, add them to the list
            if (result.additionalActions) {
                tasks.unshift(...result.additionalActions)

                // restart the loop to execute the additional actions
                return this.executeTasks()
            }

            // task is blocking, stop the loop
            if (result.blocking) break
        }

        // unmap tasks as completed for next tick
        tasks.forEach(task => {
            if (task.completed) delete task.completed
        })

        // tasks all done, try to find new ones.
        if (tasks.length === 0 && this.attempts < 3) {
            this.processTasks(this.tasks)

            // found new tasks, try again
            if (tasks.length === 0) {
                this.executeTasks()
                return
            }
        }

        // update creep memory
        this.creep.memory.tasks = tasks
    }

    // perform action on creep
    private performAction(workTask: TaskType): ActionResult {
        // make sure task is valid
        if ('id' in workTask === false && 'pos' in workTask === false) return { success: OK }

        // console.log('workTask:', JSON.stringify(workTask))
        const { task, params = { autoMove: false, ignoreCapacity: false }, ...rest } = this.unserialize(workTask) as TaskPosition | TaskObject

        const target = 'pos' in rest ? rest.pos : rest.object
        if (!target) return { success: OK }

        const taskConfig = this.tasks.find(entry => entry.task.type === task)
        if (taskConfig?.validate) {
            const context = this.context()
            context.target = target
            const validate = new Function(...Object.keys(context), `return ${taskConfig.validate}`)
            if (!validate(...Object.values(context))) {
                // this.debug('task validation failed', taskConfig.task, taskConfig.validate)
                return { success: OK }
            }
        }

        const result = creepActions[task] && creepActions[task](this, target, params) || this.customActions[task] && this.customActions[task](this, target, params)

        // auto move to target if not in range
        if (result.success === ERR_NOT_IN_RANGE) {
            const result = this.creep.travel(target instanceof RoomPosition ? target : target.pos, {
                range: target instanceof StructureController ? 3 : 1
            })
            if (result === OK) {
                this.completed.add("move")
            }
        }

        return result
    }
}
