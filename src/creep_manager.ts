import { CONFIG } from 'config'
import creepActions from 'creep_actions'
import 'creep_traveler'
import utils from 'utils/utils'
import './utils/debugger'
import Debuggable from './utils/debugger'

declare global { // using global declaration to extend the existing types
    interface TaskPosition {
        pos: RoomPosition
        task: string
        params?: TaskParams
        completed?: boolean
        permanent?: boolean
    }

    interface TaskObject {
        id: string
        task: string
        object?: TargetTypes
        params?: TaskParams
        completed?: boolean
        permanent?: boolean
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

export default class CreepManager extends Debuggable {
    private customActions: Record<string, (base: CreepManager, target: TargetTypes | RoomPosition, params: TaskParams) => ActionResult> = {};

    creep: Creep
    completed: Set<ActionTypes>
    assignedTasks: { condition: string; validate?: string; task: { type: string; target: string } }[]

    // how many attempts have been used to find tasks
    private attempts = 0
    cpuStart: number

    constructor(creep: Creep) {
        // debugger
        super(true, `CreepMamanger[${creep.name}]`)

        this.cpuStart = Game.cpu.getUsed()
        this.creep = creep
        this.completed = new Set()
        this.assignedTasks = CONFIG.rooms[this.creep.room.name]?.creeps[this.creep.memory.role]?.tasks || []

        this.debug(`**tasks assigned to role:** ${this.assignedTasks.length}`)

        this.creep.memory.tasks = this.creep.memory.tasks || []

        // make sure tasks are not completed
        this.creep.memory.tasks.forEach(task => {
            delete task.completed
            delete task.permanent
        })

        // if not tasks found, find some
        if (this.creep.memory.tasks.length === 0) {
            this.processTasks()
        }

        // console.log("\n\n--------")
        // const spawns: StructureSpawn[] = this.resolveContextValue('spawns')()
        // const freeCapacity: (target: AnyStructure) => boolean = this.resolveContextValue('freeCapacity')
        // const notOverAssigned = this.resolveContextValue('notOverAssigned')
        // const spawns_free = spawns.filter(freeCapacity)
        // const spawns_not_over_assigned = spawns_free.filter((s: any) => notOverAssigned(s)).length > 0
        // console.log(this.creep.name, 'spawns:', spawns, 'spawns_free:', spawns_free.length, 'spawns_not_over_assigned:', spawns_not_over_assigned)
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
        // console.log(this.creep.name, 'added task', JSON.stringify(task))
        this.creep.memory.tasks = this.creep.memory.tasks || []
        this.creep.memory.tasks.push(task)
    }

    private getFreeCapacity(target: TargetTypes & { store: StoreDefinition } | TargetTypes & { energy: number, energyCapacity: number } | undefined): number {
        if (!target) return 0

        if ('energy' in target && 'energyCapacity' in target) {
            return target.energyCapacity - target.energy
        }

        return target.store.getFreeCapacity(RESOURCE_ENERGY)
    }

    private getUsedCapacity(target: { store: StoreDefinition } | { energy: number, energyCapacity: number } | undefined): number {
        if (!target) return 0

        if ('energy' in target) {
            return target.energy
        }

        return target.store.getUsedCapacity(RESOURCE_ENERGY)
    }

    // Define all potential keys that might be accessed in conditions
    private keys = [
        'creep',
        'closestSpawn',
        'closestSource',
        'controller',
        'enemies',
        'findClosestByPath',
        'spawns',
        'activeSources',
        'sources',
        'freeCapacity',
        'usedCapacity',
        'notOverAssigned',
        'notOverAssignedSource',
    ];

    private resolveContextValue(key: string): any {
        switch (key) {
            // multiple targets
            case 'enemies':
                return () => this.creep.room.find(FIND_HOSTILE_CREEPS)
            case 'spawns':
                return () => this.creep.room.find(FIND_MY_SPAWNS)
            case 'activeSources':
                return () => this.creep.room.find(FIND_SOURCES_ACTIVE)
            case 'sources':
                return () => this.creep.room.find(FIND_SOURCES)

            // single targets
            case 'closestSpawn':
                return this.creep.pos.findClosestByPath(FIND_MY_SPAWNS)
            case 'closestSource':
                return this.creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE, {
                    filter: (s) => this.resolveContextValue("notOverAssignedSource")(s)
                })
            case 'creep':
                return this.creep
            case 'controller':
                return this.creep.room.controller

            // find closest by path, single target
            case 'findClosestByPath':
                return (type: FindConstant) => this.creep.pos.findClosestByPath(type)

            // helper function to check if a target is not over assigned
            case 'freeCapacity':
                return (target: AnyStructure & { store: StoreDefinition } | undefined) => {
                    if (!target) return 0

                    const result = this.getFreeCapacity(target)
                    this.debug(`**freeCapacity:** ${target}: result: ${result}`, 'informative')
                    return result
                }

            case 'usedCapacity':
                return (target: { store: StoreDefinition } | undefined) => {
                    if (!target) return false

                    const result = this.getUsedCapacity(target) > 0
                    this.debug(`**usedCapacity:** ${target}: result: ${result}`, 'informative')
                    return result
                }

            case 'notOverAssignedSource':
                return (target: TargetTypes | undefined) => {
                    if (!target) return false

                    this.debug(`**notOverAssignedSource** target: ${target}`, 'informative')

                    const assigned_creeps = Object.values(Game.creeps)
                        // creeps assigned to this source
                        .filter(creep =>
                            // not this creep
                            creep.id !== this.creep.id &&
                            // creep has tasks
                            creep.memory.tasks &&
                            // find tasks assigned to this target
                            creep.memory.tasks.some(task => 'id' in task && task.id === target.id && task.task === 'harvest') &&
                            // extend creeps further away
                            creep.pos.getRangeTo(target) < this.creep.pos.getRangeTo(target)
                        )

                    this.debug(`**notOverAssignedSource** assigned_creeps: total: ${assigned_creeps.length}`, 'informative')

                    const walkablePositions = utils.walkablePositions(target.pos)
                    this.debug(`**notOverAssignedSource** walkablePositions: ${walkablePositions}`, 'informative')

                    const assigned_creeps_stored_energy = assigned_creeps
                        // total up the energy assigned to this target
                        .reduce((total, c) => total + this.getUsedCapacity(c), 0)
                    this.debug(`**notOverAssignedSource** assigned_creeps_stored_energy: ${assigned_creeps_stored_energy}`, 'informative')

                    const stored = this.getUsedCapacity(target as any)
                    this.debug(`**notOverAssignedSource** stored: ${stored}`, 'informative')

                    // console.log(`${this.creep.name} assigned_creeps: ${assigned_creeps.length} assigned_creeps_stored_energy: ${assigned_creeps_stored_energy} stored: ${stored}`)
                    // console.log(this.creep.name, 'target:', target, 'assigned_creeps:', assigned_creeps.length, 'assigned_creeps_stored_energy:', assigned_creeps_stored_energy)

                    const result = walkablePositions > assigned_creeps.length && stored > assigned_creeps_stored_energy
                    this.debug(`**notOverAssignedSource** result: ${result}`, 'informative')

                    // not over assigned
                    return result
                }

            case 'notOverAssigned':
                return (target: TargetTypes | undefined) => {
                    if (!target) return false

                    this.debug(`**notOverAssigned** target: ${target}`, 'informative')

                    const assigned_creeps = Object.values(Game.creeps)
                        // creeps assigned to this source
                        .filter(creep =>
                            // not this creep
                            creep.id !== this.creep.id &&
                            // creep has tasks
                            creep.memory.tasks &&
                            // find tasks assigned to this target
                            creep.memory.tasks.some(task => 'id' in task && task.id === target.id && task.task === 'transfer') &&
                            // extend creeps further away
                            creep.pos.getRangeTo(target) < this.creep.pos.getRangeTo(target)
                        )

                    this.debug(`**notOverAssigned** assigned_creeps: total: ${assigned_creeps.length}`, 'informative')

                    const walkablePositions = utils.walkablePositions(target.pos)
                    this.debug(`**notOverAssigned** walkablePositions: ${walkablePositions}`, 'informative')

                    const assigned_creeps_stored_energy = assigned_creeps
                        // total up the energy assigned to this target
                        .reduce((total, c) => total + this.getUsedCapacity(c), 0)
                    this.debug(`**notOverAssigned** assigned_creeps_stored_energy: ${assigned_creeps_stored_energy}`, 'informative')

                    const stored = this.getFreeCapacity(target as any)
                    this.debug(`**notOverAssigned** stored: ${stored}`, 'informative')

                    // console.log(`${this.creep.name} assigned_creeps: ${assigned_creeps.length} assigned_creeps_stored_energy: ${assigned_creeps_stored_energy} stored: ${stored}`)
                    // console.log(this.creep.name, 'target:', target, 'assigned_creeps:', assigned_creeps.length, 'assigned_creeps_stored_energy:', assigned_creeps_stored_energy)

                    const result = walkablePositions > assigned_creeps.length && stored > assigned_creeps_stored_energy
                    this.debug(`**notOverAssigned** result: ${result}`, 'informative')

                    // not over assigned
                    return result
                }

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

    processTasks() {
        this.debug(`**processTasks.** tasks to evaludate: ${this.assignedTasks.length}`, 'detailed')

        const context = this.context()

        // Iterate through the configuration to find a matching condition
        for (const entry of this.assignedTasks) {
            const keys = Object.keys(context)
            const values = Object.values(context)

            this.debug('**processTasks:** task config:', entry, 'detailed')

            // Evaluate the condition dynamically using the context
            const condition = new Function(...keys, `return ${entry.condition}`).bind(this)

            if (condition(...values)) {
                this.debug(`#BCFFA2[**condition passed:**] entry.condition: ${entry.condition}`)

                // Resolve the target dynamically
                const target = entry.task.target
                const resolvedTarget = target in context ? context[target] : target

                // Add the task
                if (resolvedTarget) {
                    this.debug(`**found target:** target: ${resolvedTarget.id ?? resolvedTarget.pos}`, 'detailed')

                    this.addTask({
                        id: resolvedTarget.id,
                        task: entry.task.type,
                    })
                }
                break // Stop processing after assigning a task
            } else {
                this.debug(`#FFA2A2[**condition failed:**] ${entry.condition}`)
            }
        }
    }

    // execute all tasks in memory
    executeTasks(): void {
        this.attempts++

        // get tasks from creep memory
        const tasks = this.creep.memory.tasks || []
        if (tasks.length === 0) return

        this.debug(`**executeTasks:** attempt: ${this.attempts} Tasks:`, tasks)

        // this.debug('tasks:', tasks)

        // loop through all tasks
        while (tasks.length > 0) {
            // find a task that is not completed
            const task = tasks.find(task => !task.completed)
            if (!task) {
                this.debug('**executeTasks:** Tasks loop completed.', 'detailed')
                break
            }

            // make sure task is valid
            if ('id' in task === false && 'pos' in task === false) {
                this.debug('**executeTasks:** "task" is invalid. Task:', task, 'detailed')
                tasks.shift()
                continue
            }

            this.debug('**executeTasks:** performAction. Task:', task, 'informative')

            // perform the task action
            const result = this.performAction(task)

            this.debug(`**executeTasks:** performAction result:`, result, 'detailed')

            // mark as run this tick
            task.completed = true
            task.permanent = result.permanent

            // loop through actions to make as completed if result is OK
            Object.keys(result.actions || {}).forEach(action => {
                if (result.actions![action as ActionTypes] === OK) {
                    this.debug(`**completed action:** ${action}`, 'informative')
                    this.completed.add(action as ActionTypes)
                }
            })

            // console.log(this.creep.name, 'executed task', JSON.stringify(task), 'result', JSON.stringify(result))

            // remove the task from the list if it was successful and not permanent
            if (result.success === OK && !result.permanent) {
                this.debug(`**executeTasks:** removing task.`, 'detailed')

                // this.debug('task completed', task)
                tasks.shift() // removes task from memory
            }

            // task has additional actions, add them to the list
            if (result.additionalActions) {
                tasks.unshift(...result.additionalActions)

                // restart the loop to execute the additional actions
                this.executeTasks()
                return
            }

            // task is blocking, stop the loop
            if (result.blocking) {
                this.debug('**executeTasks:** task is blocking.')
                break
            }
        }

        // unmap tasks as completed for next tick
        tasks.forEach(task => {
            if (task.completed && !task.permanent) {
                this.debug('**executeTasks:** task completed, removing. Task:', task, 'detailed')
                delete task.completed
            }
        })

        // update creep memory
        this.creep.memory.tasks = tasks

        // tasks all done, try to find new ones.
        if (tasks.length === 0 && this.attempts < 3) {
            this.debug('**executeTasks:** tasks all done, try to find new ones.', 'detailed')

            this.processTasks()

            // found new tasks, try again
            if (tasks.length > 0) {
                this.debug('**executeTasks:** found new tasks, try again. Tasks:', tasks, 'detailed')

                this.executeTasks()
                return
            }
        }

        this.debug('**completed actions:**', Array.from(this.completed), 'detailed')
        this.debug(`**executeTasks:** completed in ${Game.cpu.getUsed() - this.cpuStart} CPU`, 'detailed')
    }

    // perform action on creep
    private performAction(workTask: TaskType): ActionResult {
        // make sure task is valid
        if ('id' in workTask === false && 'pos' in workTask === false) {
            this.debug('**performAction:** task is invalid. Task:', workTask)
            return { success: OK }
        }

        this.debug('**performAction:** workTask:', workTask, 'informative')

        const unserialized = this.unserialize(workTask) as TaskPosition | TaskObject

        this.debug('**performAction:** unserialized:', unserialized, 'informative')

        // console.log('workTask:', JSON.stringify(workTask))
        const { task, params = { autoMove: false, ignoreCapacity: false }, ...rest } = unserialized

        const target = 'pos' in rest ? rest.pos : rest.object
        if (!target) {
            this.debug('**performAction:** "target" invalid. Task:', task, 'params:', params, 'rest:', rest)
            return { success: OK }
        }

        const taskConfig = this.assignedTasks.find(entry => entry.task.type === task)

        this.debug('**performAction:** taskConfig:', taskConfig, 'informative')

        if (taskConfig?.validate) {
            const context = this.context()
            context.target = target
            const validate = new Function(...Object.keys(context), `return ${taskConfig.validate}`)

            this.debug('**task revalidation.** Task:', taskConfig.task, 'informative')

            if (!validate(...Object.values(context))) {
                this.debug(`**performAction:** #FFA2A2[**task validation failed.**] validation: ${taskConfig.validate}`, 'detailed')
                return { success: OK }
            } else {
                this.debug(`**performAction:** #BCFFA2[**validation passed.**] validation: ${taskConfig.validate}`, 'detailed')
            }
        }

        const result = creepActions[task] && creepActions[task](this, target, params) || this.customActions[task] && this.customActions[task](this, target, params)

        // auto move to target if not in range
        if (result.success === ERR_NOT_IN_RANGE) {
            const result = this.creep.travel(target instanceof RoomPosition ? target : target.pos, {
                range: target instanceof StructureController ? 3 : 1
            })

            this.debug(`**performAction:** autoMove. result: ${result}`)

            if (result === OK) {
                this.debug('**performAction:** move OK', 'informative')
                this.completed.add("move")
            }
        }

        return result
    }
}
