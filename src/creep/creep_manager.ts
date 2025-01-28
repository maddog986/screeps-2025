import { CONFIG } from 'config'
import creepActions from 'creep/creep_actions'
import 'creep/creep_traveler'
import CreepMovement from 'creep/creep_traveler'
import utils from 'utils/utils'

declare global { // using global declaration to extend the existing types
    interface TaskPosition {
        pos: RoomPosition
        action: string
        completed?: boolean
        persistent?: boolean
    }

    interface TaskObject {
        id: string
        action: string
        object?: TargetTypes
        completed?: boolean
        persistent?: boolean
    }

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
        persistent?: boolean 			// If true, the task will not be removed from the list until it is completed
    }

    interface CreepMemory {
        tasks?: TaskType[] // Optional list of tasks assigned to the creep
    }

    interface Creep {
        _manager?: CreepManager
        manager: CreepManager
    }
}

// // extend Creep prototype
Object.defineProperty(Creep.prototype, 'manager', {
    get: function (): CreepManager {
        if (!this._manager) {
            this._manager = new CreepManager(this)
        }
        return this._manager
    },
})

export default class CreepManager extends CreepMovement {
    completed: Set<ActionTypes>
    assignedTasks: TaskConfig[]

    constructor(creep: Creep) {
        // debugger
        super(creep)

        this.completed = new Set()

        this.assignedTasks = CONFIG.rooms[this.creep.room.name]?.creeps[this.creep.memory.role]?.tasks || []

        // make sure tasks is set
        this.creep.memory.tasks ??= []

        this.log(`**constructor:** loaded data:`, {
            tasks: this.assignedTasks.length,
            context: {
                creep: this.creep.id,
            },
            storage: this.creep.store,
        }, 'detailed')

        // if not tasks found, find some
        if (this.creep.memory.tasks.length === 0) {
            this.processTasks()
        }

        this.setupContext()
    }

    setupContext() {
        // set some extra context
        this.setContext('creep', this.creep)
        this.setContext('closestSpawn', () => this.creep.pos.findClosestByPath(FIND_MY_SPAWNS))
        this.setContext('closestSource', () => this.creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE, {
            filter: this.isNotOverAssignedSource.bind(this),
        }))
        this.setContext('closestByPath', (type: FindConstant) => this.creep.pos.findClosestByPath(type))
        this.setContext('closestByRange', (type: FindConstant) => this.creep.pos.findClosestByRange(type))
        this.setContext('closestConstructionSite', () => (this.getContext('constructionSites') as ConstructionSite[])
            // sort by most done first
            .sort((a, b) => b.progress - a.progress)
        // first one
        [0]
        )
    }

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

    private processTasks() {
        // make sure context is setup
        this.setupContext()

        // Iterate through the configuration to find a matching condition
        for (const assignedTask of this.assignedTasks) {
            this.log('**processTasks:** assigned task config:', assignedTask)

            // // Resolve the target dynamically
            const resolvedTarget: TargetTypes | RoomPosition | undefined = this.evaluateExpression(assignedTask.target)
            if (!resolvedTarget || typeof resolvedTarget === 'function') {
                this.log(`**processTasks:** #FFA2A2[**target not found:**]`, { target: assignedTask.target, resolved: resolvedTarget })
                continue
            }

            // save target
            this.setContext('target', resolvedTarget)
            this.setContext('creep', this.creep)

            this.log(`**processTasks:** resolvedTarget`, resolvedTarget)

            // check conditions
            if (assignedTask.conditions && !assignedTask.conditions.every((cond: string) => this.evaluateExpression(cond))) {
                this.log(`**processTasks:** #FFA2A2[**condition failed:**] conditions:`, assignedTask.conditions)
                continue
            }

            this.log(`**processTasks:** #BCFFA2[**condition passed:**] conditions:`, assignedTask.conditions)

            // check validates of the task
            if (assignedTask.validates && !assignedTask.validates.every((cond: string) => this.evaluateExpression(cond))) {
                this.log(`**processTasks:** #FFA2A2[**validate failed:**] validates:`, assignedTask.validates)
                continue
            }

            // Add the task
            if ('id' in resolvedTarget) {
                this.addTask({
                    id: resolvedTarget.id,
                    action: assignedTask.action,
                })
            } else if ('pos' in resolvedTarget) {
                this.addTask({
                    pos: resolvedTarget.pos as RoomPosition,
                    action: assignedTask.action,
                })
            }

            break // Stop processing after assigning a task
        }
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
    private addTask(task: TaskType): void {
        task.completed = undefined
        task.persistent = undefined

        this.log(`**addTask:** add new task:`, task)

        this.creep.memory.tasks ??= []
        this.creep.memory.tasks.push(task)
    }

    // perform action on creep
    private performAction(task: TaskType): ActionResult {
        // make sure task is valid
        if ('id' in task === false && 'pos' in task === false) {
            this.log('**performAction:** task is invalid. Task:', task)
            return { success: OK }
        }

        const unserialized = this.unserializeTask(task) as TaskPosition | TaskObject
        if (!unserialized) {
            this.log('**performAction:** "unserialized" is invalid. Task:', task)
            return { success: OK }
        }

        this.log('**performAction:** unserialized:', unserialized)

        // console.log('workTask:', JSON.stringify(workTask))
        const { action, ...rest } = unserialized

        const target = 'pos' in rest ? rest.pos : rest.object
        if (!target) {
            this.log('**performAction:** "target" invalid. Task:', action, 'rest:', rest)
            return { success: OK }
        }

        // make sure context is setup
        this.setupContext()

        // set target in context
        this.setContext('target', target)
        this.setContext('creep', this.creep)

        const taskConfig = this.assignedTasks.find(entry => entry.action === action)

        this.log(`**performAction:** target: ${target} taskConfig:`, taskConfig)

        if (taskConfig?.validates) {
            this.log(`**task revalidation.** Task[${taskConfig.action}]:`, taskConfig)

            const conditionsMet = taskConfig.validates.every((cond: string) => this.evaluateExpression(cond))
            if (conditionsMet) {
                this.log(`**performAction:** #BCFFA2[**validation passed.**]`)
            } else {
                this.log(`**performAction:** #FFA2A2[**task validation failed.**]`)
                return { success: OK }
            }
        }

        const result = creepActions[action] && creepActions[action](this, target)

        // auto move to target if not in range
        if (result.success === ERR_NOT_IN_RANGE) {
            let range = 1

            if (target instanceof StructureController || target instanceof ConstructionSite) {
                range = 3
            }

            const result = this.creep.manager.move(target instanceof RoomPosition ? target : target.pos, {
                range
            })

            this.log(`**performAction:** autoMove. result: ${result}`)

            if (result === OK) {
                this.log('**performAction:** completed: move')
                this.completed.add("move")
            }
        }

        return result
    }

    // execute all tasks in memory
    executeTasks(): void {
        // make sure context is setup
        this.setupContext()

        // get tasks from creep memory
        const tasks = [...this.creep.memory.tasks ?? []]

        this.log(`**executeTasks:** all tasks assigned to memory:`, tasks)

        // loop through all tasks
        while (tasks.length > 0) {
            // find a task that is not completed
            const task = tasks.find(task => !task.completed)
            if (!task) {
                this.log('**executeTasks:** Tasks loop completed.')
                break
            }

            // make sure task is valid
            if ('id' in task === false && 'pos' in task === false) {
                this.log('**executeTasks:** "task" is invalid. Task:', task)
                tasks.shift()
                continue
            }

            this.log(`**executeTasks:** perform task '${task.action}'. details:`, task)

            // if (this.test) return

            // perform the task action
            const result = this.performAction(task)

            this.log(`**executeTasks:** performAction task result:`, result)

            // mark as run this tick
            task.completed = true
            task.persistent = result.persistent

            // loop through actions to make as completed if result is OK
            Object.keys(result.actions || {}).forEach(action => {
                if (result.actions![action as ActionTypes] === OK) {
                    this.log(`**completed action:** ${action}`)
                    this.completed.add(action as ActionTypes)
                }
            })

            // remove the task from the list if it was successful and not permanent
            if (result.success === OK && !result.persistent) {
                this.log(`**executeTasks:** removing task ${task.action}.`)

                // this.debug('task completed', task)
                tasks.shift() // removes task from memory
            }
        }

        // update creep memory
        this.creep.memory.tasks = tasks
            .filter(task => task.persistent)
            .map(task => {
                task.completed = undefined
                task.persistent = undefined
                return task
            })

        this.log('**executeTasks** completed actions:', Array.from(this.completed))

        if (tasks.length > 0) return

        const spawn = this.room.manager.spawn
        // console.log(this.creep.name, 'spawn:', spawn)
        // console.log(this.creep.name, 'dist to spawn:', this.creep.pos.getRangeTo(spawn))

        if (spawn && this.creep.pos.getRangeTo(spawn) < 3) {
            const directionToSpawn = this.creep.pos.getDirectionTo(spawn)
            // reverse direction
            const reverseDirection = utils.reverseDirection(directionToSpawn)
            // randomize direction
            const randomDirection = utils.getRandomAdjacentDirection(reverseDirection)

            // console.log('directionToSpawn:', directionToSpawn, 'reverseDirection:', reverseDirection, 'randomDirection:', randomDirection)

            if (!this.completed.has('move')) {
                const move = this.creep.move(randomDirection)
                if (move === OK) {
                    this.completed.add('move')
                }
            }
        }
    }
}
