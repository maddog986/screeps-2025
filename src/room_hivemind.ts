import { CONFIG } from 'config'
import { get } from 'http'

const TASK_ACTIONS = ['harvest', 'transfer', 'upgrade', 'renew', 'recycle', 'build', 'withdraw', 'pickup', 'repair', 'attack', 'move', 'scout', 'claim'] as const
const CREEP_ROLES = ['harvester', 'upgrader', 'mule', 'defender', 'builder', 'scout', 'claimer'] as const

declare global { // using global declaration to extend the existing types
    type TaskAction = (typeof TASK_ACTIONS)[number]
    type CreepRole = (typeof CREEP_ROLES)[number]

    interface TaskPosition {
        pos: { x: number, y: number, roomName: string, range?: number }
        action: TaskAction
        blocking?: boolean // if true, creep wont move to target and will be removed from list if not completed
        completed?: boolean
        persistent?: boolean // if true, task wont be removed from list until completed
        waiting?: boolean // if true, task wont execute until next tick
        deleted?: boolean // if true, task will be removed from list
    }

    interface TaskObject {
        id: string
        action: TaskAction
        blocking?: boolean // if true, creep wont move to target and will be removed from list if not completed
        completed?: boolean
        persistent?: boolean // if true, task wont be removed from list until completed
        waiting?: boolean // if true, task wont execute until next tick
        deleted?: boolean // if true, task will be removed from list
        amount?: number // transfer amount
    }

    // types of tasks
    type TaskType = TaskPosition | TaskObject

    // types of objects that can be targeted
    type TargetTypes = Creep | Structure | Source | ConstructionSite | Resource | StructureContainer | StructureController | Tombstone

    // types of actions that can be executed only once per tick
    type ActionTypes = 'move' | 'work' | 'transfer' | 'pickup' | 'build' | 'upgrade' | 'repair' | 'withdraw' | 'attack'

    interface StructurePosition {
        x: number
        y: number
        structure: string
        level: number
    }

    interface CreepMemory {
        tasks?: TaskType[]
        role: CreepRole
        room: string
    }

    interface RoomMemory {
        buildables: StructurePosition[]
        lastVisited: number
        sources: string[]
        enemies: {
            id: string
            owner: string
            lastSeen: number
            body: BodyPartConstant[]
        }[]
        sourceWalkablePositionsTotal: number
        owner: string
    }
}

class RoomHivemind {
    config: RoomConfig = CONFIG.rooms.default
    containers: StructureContainer[] = []
    containersNearController: StructureContainer[] = []
    containersNearSources: StructureContainer[] = []
    containersNearSpawns: StructureContainer[] = []
    constructionSites: ConstructionSite[] = []
    controller: StructureController | undefined
    controllerLevel: number = 0
    creepCompletedActions: Record<string, Set<ActionTypes>> = {}
    creeps: Creep[] = []
    creepsByRole: Record<string, Creep[]> = {}
    creepsByTask: Record<TaskAction, Creep[]> = {
        harvest: [],
        build: [],
        repair: [],
        upgrade: [],
        transfer: [],
        withdraw: [],
        pickup: [],
        recycle: [],
        renew: [],
        attack: [],
        move: [],
        scout: [],
        claim: [],
    }
    creepsSetup: Record<CreepRole, {
        body: BodyPartConstant[]
        max: number
    }> = {
            defender: {
                body: [],
                max: 0,
            },
            harvester: {
                body: [],
                max: 0,
            },
            upgrader: {
                body: [],
                max: 0,
            },
            mule: {
                body: [],
                max: 0,
            },
            builder: {
                body: [],
                max: 0,
            },
            scout: {
                body: [],
                max: 0,
            },
            claimer: {
                body: [],
                max: 0,
            }
        }
    droppedResources: Resource[] = []
    enemies: Creep[] = []
    energyAvailable: number = 0
    energyCapacityAvailable: number = 0
    extensions: StructureExtension[] = []
    myStructures: AnyStructure[] = []
    needsRepair: AnyStructure[] = []
    refillables: (StructureTower | StructureExtension | StructureSpawn | StructureContainer)[] = []
    reservedContainers: StructureContainer[] = []
    sourceWalkablePositionsTotal: number = 0
    sources: Source[] = []
    sourcesActive: Source[] = []
    spawns: StructureSpawn[] = []
    structures: AnyStructure[] = []
    tombstones: Tombstone[] = []
    towers: StructureTower[] = []
    transfers: Record<string, number> = {}
    flags: Flag[] = []
    refillableHistory: number[] = []
    spawn: StructureSpawn | undefined
    containersUsedCapacity: number = 0
    containersFreeCapacity: number = 0
    containersCapacity: number = 0
    roomEnergyPercentage: number = 0

    constructor(public room: Room) {
        this.room = room
        this.config = CONFIG?.rooms[room.name] ?? CONFIG.rooms.default

        // base information
        this.controller = room.controller as StructureController
        this.controllerLevel = this.controller ? (this.controller.level + this.controller.progress / this.controller.progressTotal) : 0
        this.creeps = Object.values(Game.creeps).filter(c => c.memory.room === room.name)
        this.energyAvailable = room.energyAvailable
        this.energyCapacityAvailable = room.energyCapacityAvailable
        this.enemies = room.find(FIND_HOSTILE_CREEPS)
        this.flags = room.find(FIND_FLAGS)
        this.structures = room.find(FIND_STRUCTURES)
        this.sources = room.find(FIND_SOURCES)
        this.sourcesActive = this.sources.filter((source) => source.energy > 0)
        this.sourceWalkablePositionsTotal = this.sourcesActive.reduce((acc, source) => acc + Math.min(3, source.walkablePositions), 0)



        // room memory
        room.memory.lastVisited = Game.time
        room.memory.sources = this.sources.map(s => s.id)
        room.memory.enemies = this.enemies.map(e => ({
            id: e.id,
            owner: e.owner.username,
            lastSeen: Game.time,
            body: e.body.map(b => b.type)
        }))
        room.memory.sourceWalkablePositionsTotal = this.sourceWalkablePositionsTotal
        room.memory.owner = this.room.controller?.owner?.username ?? ''



        // creeps
        this.creepsByRole = CREEP_ROLES.reduce((acc, role) => {
            acc[role] = this.creeps.filter((c) => c.role === role)
            return acc
        }, {} as Record<string, Creep[]>)
        this.creepsByTask = TASK_ACTIONS.reduce((acc, task) => {
            acc[task] = this.creeps.filter(c => c.hasTaskByAction(task))
            return acc
        }, {} as Record<TaskAction, Creep[]>)

        // owned room data
        if (this.controller && this.controller.my) {
            this.constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES)

            // containers
            this.containers = this.structures.filter((structure) => structure.structureType === STRUCTURE_CONTAINER)
            this.containersNearSources = this.containers.filter((container) => this.sources.some((source) => source.pos.isNearToCached(container.pos)))

            this.containersUsedCapacity = this.containers.reduce((acc, container) => acc + this.usedCapacity(container), 0)
            this.containersFreeCapacity = this.containers.reduce((acc, container) => acc + this.freeCapacity(container), 0)
            this.containersCapacity = this.containers.reduce((acc, container) => acc + this.getCapacity(container), 0)

            this.roomEnergyPercentage = (this.energyAvailable + this.containersUsedCapacity) / (this.energyCapacityAvailable + this.containersCapacity)

            this.tombstones = room.find(FIND_TOMBSTONES)
            this.droppedResources = room.find(FIND_DROPPED_RESOURCES)

            // structures
            this.myStructures = this.structures.filter((structure) => 'my' in structure)
            this.spawns = this.myStructures.filter((structure) => structure.structureType === STRUCTURE_SPAWN)
            this.spawn = this.spawns[0]
            this.extensions = this.myStructures.filter((structure) => structure.structureType === STRUCTURE_EXTENSION)
            this.towers = this.myStructures.filter((structure) => structure.structureType === STRUCTURE_TOWER)
            this.needsRepair = this.structures
                .filter((structure) => structure.hits / structure.hitsMax < this.room.repairThreshold || structure.hitsMax <= 5000 && structure.hits !== structure.hitsMax)
                .sort((a, b) => a.hits - b.hits)

            // containers
            this.containersNearSpawns = this.containers.filter((container) => this.spawns.some((spawn) => spawn.pos.isNearToCached(container.pos)))
            this.containersNearController = this.containers.filter((container) => this.controller!.pos.getRangeToCached(container.pos) <= 6)
            this.reservedContainers = this.energyAvailable === this.energyCapacityAvailable ? this.containersNearSpawns : [] // only reserve containers if energy is full

            this.refillables = [
                ...this.spawns,
                ...this.extensions,
                ...this.towers,
                ...this.containersNearSpawns,
                ...this.containersNearController
            ]

            this.manageSpawns()             // spawn creeps
            this.manageTowers()             // attack enemies
            this.manageBuilding()           // calculate buildables
            this.manageRepairThreshold()    // adjust repair threshold
            this.manageVisuals()                // visualize

            // find lost creeps
            Object.values(Game.creeps).forEach(creep => {
                if (creep.room.name !== this.room.name && creep.memory.room === this.room.name && (!creep.memory.tasks || !creep.memory.tasks.length)) {
                    creep.memory.tasks = []
                    creep.addTask({
                        action: 'move',
                        pos: {
                            x: 25,
                            y: 25,
                            roomName: this.room.name,
                            range: 48
                        }
                    } as TaskPosition)
                }
            })

            if (this.enemies.length || this.room.name === 'W7N3') {
                this.manageDefenders()
            }

            // start of new room
            if (this.constructionSites.some(cs => cs.structureType === STRUCTURE_SPAWN) && !this.enemies.length) {
                const constructionSpawn = this.constructionSites.find(cs => cs.structureType === STRUCTURE_SPAWN)

                if (this.creeps.length < 4 && constructionSpawn) {
                    this.log('manageCreeps', `  - **new room:** ${this.room.name}`)

                    // lets steal a creep from another room
                    const harvesterWithMostLife = Object.values(Game.creeps)
                        .filter(c => c.role === 'harvester' && c.memory.room !== this.room.name)
                        .sort((a, b) => a.hits - b.hits)
                        .shift()

                    if (harvesterWithMostLife) {
                        this.log('manageCreeps', `  - **stealing creep:** ${harvesterWithMostLife.name} from ${harvesterWithMostLife.memory.room}`)
                        harvesterWithMostLife.memory.room = this.room.name
                        harvesterWithMostLife.say('🔄')

                        harvesterWithMostLife.tasks = []
                        harvesterWithMostLife.addTask({
                            action: 'move',
                            pos: {
                                x: constructionSpawn.pos.x,
                                y: constructionSpawn.pos.y,
                                roomName: this.room.name,
                                range: 48
                            }
                        } as TaskPosition)
                    }
                }
            }
        }

        this.manageCreeps()                 // manage creeps
        this.flushLogs()                    // flush logs
    }

    private usedCapacity(target: TargetTypes | undefined) {
        if (!target) return 0

        this.transfers[target.id] ??= 0

        if ('store' in target) {
            return (target.store.getUsedCapacity(RESOURCE_ENERGY) ?? target.store.getUsedCapacity()) + this.transfers[target.id]
        }

        if ('energy' in target) {
            return Math.min(target.energyCapacity, target.energy + this.transfers[target.id])
        }

        if ('amount' in target) {
            return Math.min(0, target.amount + this.transfers[target.id])
        }

        return 0
    }

    private freeCapacity(target: TargetTypes | undefined) {
        if (!target) return 0

        this.transfers[target.id] ??= 0

        if ('store' in target) {
            return Math.max(0, (target.store.getFreeCapacity(RESOURCE_ENERGY) ?? target.store.getFreeCapacity() ?? 0) - this.transfers[target.id])
        }

        if ('energy' in target && 'energyCapacity' in target) {
            const amount = Math.max(0, (target.energyCapacity - target.energy) - this.transfers[target.id])
            // console.log('freeCapacity:', target, 'transfers:', this.transfers[target.id], 'amount:', amount)
            return amount
        }

        if ('amount' in target) {
            return Math.max(0, target.amount - this.transfers[target.id])
        }

        return 0
    }

    private getCapacity(target: TargetTypes | undefined): number {
        if (!target) return 0

        if ('store' in target) {
            return target.store.getCapacity(RESOURCE_ENERGY) ?? target.store.getCapacity() ?? 0
        }

        if ('energyCapacity' in target) {
            return target.energyCapacity
        }

        if ('amount' in target) {
            return target.amount
        }

        return 0
    }

    workPower(creep: Creep): number {
        const workParts = creep.body.filter(b => b.type === WORK).length
        if (!workParts) return 0

        const buildEnergyPerTick = workParts * BUILD_POWER
        const upgradeEnergyPerTick = workParts * UPGRADE_CONTROLLER_POWER

        if (creep.role === 'harvester') return buildEnergyPerTick
        if (creep.role === 'upgrader') return upgradeEnergyPerTick
        if (creep.role === 'builder') return buildEnergyPerTick

        return 0
    }

    private manageDefenders() {
        if (!this.enemies.length) return

        const allMyDefenders = Object.values(Game.creeps)
            .filter(c => c.role === 'defender' && !c.room.memory.enemies.length && (c.room.name !== this.room.name || c.room.name !== this.room.name))

        allMyDefenders.forEach(defender => {
            defender.tasks = []
            defender.addTask({
                action: 'move',
                pos: {
                    x: 25,
                    y: 25,
                    roomName: this.room.name,
                    range: 48
                }
            } as TaskPosition)
        })
    }







    private debugName = 'Mdd1'
    findBestTask(creep: Creep): { task: 'harvest' | 'build' | 'upgrade' | 'withdraw' | 'transfer' | 'attack', target: TargetTypes, score: number }[] {
        const maxPossibleDistance = 50
        const isHarvester = creep.role === 'harvester'
        const isBuilder = creep.role === 'builder'
        const isUpgrader = creep.role === 'upgrader'
        const isMule = creep.role === 'mule'
        const isDefender = creep.role === 'defender'

        // Task options
        const constructionSites = this.constructionSites
        const controller = this.controller as StructureController
        const roomEnergyFull = this.energyAvailable >= this.energyCapacityAvailable

        // Predict movement efficiency
        const moveParts = creep.body.filter(b => b.type === MOVE).length
        const nonMoveParts = creep.body.length - moveParts
        const effectiveMove = (moveParts * 2) - nonMoveParts
        const isSlowMover = effectiveMove < 1

        // Check role limits
        const buildersAssigned = this.creepsByTask.build
        const upgradersAssigned = this.creepsByTask.upgrade
        const harvestersAssigned = this.creepsByTask.harvest
        const buildersLimitReached = buildersAssigned.length >= this.config.maxBuilders
        const upgradersLimitReached = upgradersAssigned.length >= this.config.maxUpgraders
        const harvestersLimitReached = harvestersAssigned.length >= this.sourceWalkablePositionsTotal

        // Dynamic Energy Calculation (Using WORK Parts)
        const workParts = creep.body.filter(b => b.type === WORK).length
        const buildEnergyPerTick = workParts * BUILD_POWER
        const upgradeEnergyPerTick = workParts * UPGRADE_CONTROLLER_POWER

        // **Ensure at least multiple cycles of actions before assigning work**
        const freeCapacity = this.freeCapacity(creep)
        const usedCapacity = this.usedCapacity(creep)
        const roomEnergyLow = this.roomEnergyPercentage < 0.25 // room energy below 25% capacity
        const cyclesRequired = roomEnergyLow ? 3 : 7
        const hasEnoughForBuild = usedCapacity > Math.min(50, buildEnergyPerTick * cyclesRequired)
        const hasEnoughForUpgrade = usedCapacity > Math.min(50, upgradeEnergyPerTick * cyclesRequired)



        this.log('manageCreeps', `  -#ffb300[**findBestTask:**] ${creep.name} isHarvester: ${isHarvester ? 'yes' : 'no'} isBuilder: ${isBuilder ? 'yes' : 'no'} isUpgrader: ${isUpgrader ? 'yes' : 'no'} isMule: ${isMule ? 'yes' : 'no'}`)
        if (creep.name === this.debugName) console.log(creep.name, 'usedCapacity:', usedCapacity, 'freeCapacity:', freeCapacity, 'buildEnergyPerTick:', buildEnergyPerTick, 'upgradeEnergyPerTick:', upgradeEnergyPerTick, 'hasEnoughForBuild:', hasEnoughForBuild, 'hasEnoughForUpgrade:', hasEnoughForUpgrade)

        // Determine valid targets based on task type
        let validTargets: TargetTypes[] = []

        if (isHarvester) {
            validTargets = []

            if (freeCapacity > 0) validTargets.push(...this.sourcesActive)
            if (usedCapacity > 0) validTargets.push(...this.refillables)

            if (hasEnoughForBuild) validTargets.push(...constructionSites)
            if (hasEnoughForUpgrade) validTargets.push(controller)
        }
        if (isBuilder) {
            validTargets = constructionSites.length > 0 ? constructionSites : this.sourcesActive
            validTargets.push(controller)
        }
        if (isUpgrader) {
            validTargets = hasEnoughForUpgrade && controller ? [controller] : this.sourcesActive
        }
        if (isMule) {
            validTargets = [
                ...this.refillables,
                ...this.creeps
                    .filter(c => c.id !== creep.id
                        && this.freeCapacity(c) >= this.workPower(c) * (c.pos.getRangeToCached(creep.pos) + 2)
                        && this.usedCapacity(c) <= 100
                        && (c.hasTaskByAction('build') || c.hasTaskByAction('upgrade'))
                        && c.pos.getRangeToCached(creep.pos) < 11
                    )]
        }

        if (freeCapacity > 0 || isMule) {
            validTargets.push(...this.containers)
        }

        if (isDefender) {
            validTargets = this.enemies
        }

        this.log('manageCreeps', `    - valid targets:`, validTargets.length)

        // remove duplicates
        validTargets = validTargets.filter((target, index, self) =>
            index === self.findIndex((t) => t.id === target.id)
        )

        // Scoring system for valid targets
        const scores = validTargets.map(target => {
            const distance = creep.pos.getRangeToCached(target.pos)
            const distanceFactor = (isSlowMover ? 0.5 : 1) - (distance / maxPossibleDistance) * 2
            let priorityFactor = 0
            let task: 'harvest' | 'build' | 'upgrade' | 'withdraw' | 'transfer' | 'attack' = 'harvest'

            // Calculate assigned creeps based on determined task type
            const getAssignedCreeps = (taskType: typeof task) =>
                this.creepsByTask[taskType].filter(c =>
                    c.id !== creep.id
                    && c.hasTask(taskType, target.id)
                    && c.pos.getRangeToCached(target.pos) < creep.pos.getRangeToCached(target.pos)
                )

            // console.log(creep.name, target, 'assignedCreeps:', assignedCreeps.length, assignedCreeps.map(c => c.name))

            // sources
            if (target instanceof Source) {
                task = 'harvest'
                priorityFactor = harvestersLimitReached ? -10 : 1.5

                const powerFactor = (target.energy / target.energyCapacity) * 0.05            // power factor
                const walkablePositionsFactor = (target.walkablePositions - getAssignedCreeps(task).length) * 0.25   // walkable positions factor
                const ticksToRegenerationFactor = target.ticksToRegeneration > 0 ? (target.ticksToRegeneration / 100) * -0.25 : 0                 // ticks to regeneration factor

                priorityFactor += powerFactor
                priorityFactor += walkablePositionsFactor
                priorityFactor += ticksToRegenerationFactor

                if (isHarvester) priorityFactor += 1
                if (isSlowMover) priorityFactor += 1

                const ticksToRegeneration = target.ticksToRegeneration
                if (target.energy < 100) {           // Adjust the threshold as needed
                    priorityFactor -= 2                     // Deprioritize nearly exhausted sources
                }

                if (getAssignedCreeps(task).length >= target.walkablePositions) {
                    priorityFactor = -100
                }
            }

            // construction sites
            else if (target instanceof ConstructionSite) {
                task = 'build'
                priorityFactor = buildersLimitReached ? -10 : 1.0

                if (isBuilder) priorityFactor += 1
                if (isSlowMover) priorityFactor -= 1

                // Assign structure priority
                if (target.structureType === STRUCTURE_SPAWN) priorityFactor += 200
                else if (target.structureType === STRUCTURE_EXTENSION) priorityFactor += 1.5
                else if (target.structureType === STRUCTURE_TOWER) priorityFactor += 1
                else if (target.structureType === STRUCTURE_WALL) priorityFactor -= 0.5 // Walls last
                else if (target.structureType === STRUCTURE_CONTAINER) priorityFactor += 4

                priorityFactor += (target.progress / target.progressTotal) * 2

                // factor for progress
                if (target.progress === 0) priorityFactor -= 1

                if (this.creepsByTask.upgrade.length > 0) { // only if upgraders are assigned
                    priorityFactor += getAssignedCreeps(task).length * 0.2 // increase to speed it up
                }

                if (freeCapacity > 0) {
                    priorityFactor -= 1
                }
            }

            // controller
            else if (target instanceof StructureController) {
                task = 'upgrade'
                priorityFactor = upgradersLimitReached ? -5 : 0.6

                if (isUpgrader) priorityFactor += 1
                if (isSlowMover) priorityFactor += 1
                if (roomEnergyFull) priorityFactor += 1.5

                priorityFactor -= upgradersAssigned.length * 0.2 // Reduce if too many upgraders
            }

            // spawns
            else if (target instanceof StructureSpawn || target instanceof StructureExtension || target instanceof StructureTower) {
                task = 'transfer'
                priorityFactor = 10

                if (isMule) priorityFactor += 1
                if (roomEnergyFull) priorityFactor -= 1.5
            }

            // containers
            else if (target instanceof StructureContainer) {
                task = freeCapacity > 0 ? 'withdraw' : 'transfer'
                priorityFactor = this.freeCapacity(target) > 0 ? 1.0 : -10

                if (!roomEnergyFull && freeCapacity > 0 && task === 'withdraw' && (!this.creepsByRole.mule.length || isMule)) priorityFactor += 10

                if (isMule) priorityFactor += 1
                if (roomEnergyFull) priorityFactor -= 1.5

                if (isMule) {
                    const isNearSpawn = this.containersNearSpawns.some(c => c.id === target.id)
                    const isNearSource = this.containersNearSources.some(c => c.id === target.id)
                    const isNearController = this.containersNearController.some(c => c.id === target.id)
                    if (task === 'transfer') {
                        if (isNearSpawn) priorityFactor += 3
                        if (isNearSource) priorityFactor = -100 // avoid sources
                        if (isNearController) priorityFactor += 1
                    } else if (task === 'withdraw') {
                        if (isNearSpawn) priorityFactor += (roomEnergyFull ? -100 : 0)
                        if (isNearController) priorityFactor -= -10
                    }
                }
            }
            else if (target instanceof Creep && !target.my) {
                task = 'attack'
                priorityFactor = 100
            }
            // creep to transfer energy
            else if (target instanceof Creep) {
                task = 'transfer'
                priorityFactor = 0

                if (!roomEnergyFull) priorityFactor -= 100
            }


            // check withdraw
            if (task === 'withdraw' && (!freeCapacity || !this.usedCapacity(target))) {
                priorityFactor = -100

            } else if (task === 'withdraw' || task === 'harvest') {
                const assignedWithdrawersFreeCapacity = getAssignedCreeps(task)
                    .reduce((acc, c) => acc + this.freeCapacity(c), 0)
                const targetUsedCapacity = this.usedCapacity(target)

                if (targetUsedCapacity > 0 && assignedWithdrawersFreeCapacity > targetUsedCapacity) {
                    priorityFactor -= (targetUsedCapacity / assignedWithdrawersFreeCapacity) * 0.45
                }
            }
            // check transfer
            else if (task === 'transfer' && (!usedCapacity || !this.freeCapacity(target))) {
                priorityFactor = -100

            } else if (task === 'transfer') {
                const assignedTransferCarryTotal = getAssignedCreeps(task)
                    .reduce((acc, c) => acc + this.usedCapacity(c), 0)
                const targetFreeCapacity = this.freeCapacity(target)

                if (targetFreeCapacity > 0 && assignedTransferCarryTotal > targetFreeCapacity) {
                    priorityFactor -= (assignedTransferCarryTotal / targetFreeCapacity) * 0.45
                }
            }

            // check if the target can fulfill the withdraw task
            if (task === 'withdraw' && this.usedCapacity(target) < freeCapacity) {
                priorityFactor -= 10
            }


            const assignmentFactor = 1 / (1 + getAssignedCreeps(task).length) // assignment factor

            if (creep.name === this.debugName) console.log(creep.name, target, 'priorityFactor:', priorityFactor, 'distanceFactor:', distanceFactor, 'assignmentFactor:', assignmentFactor)

            const score =
                (priorityFactor * 0.35) +       // priority factor
                (distanceFactor * 0.40) +       // distance factor
                (assignmentFactor * -0.3) +     // assignment factor
                (Math.random() * 0.05)          // random factor to break ties

            return { task, target, score: parseFloat(score.toFixed(2)) }
        })

        const bestTasks = scores
            .filter(t => t.score > -20)
            .sort((a, b) => b.score - a.score)

        this.log('manageCreeps', `  - #00fff4[**findBestTask:**] final scores for ${creep.name}`, bestTasks.map(t => ({ task: t.task, target: String(t.target), score: t.score })))
        if (creep.name === this.debugName) console.log(creep.name, 'bestTask:', JSON.stringify(bestTasks.map(t => ({ task: t.task, target: String(t.target), score: t.score })), null, 2))

        return bestTasks
    }





    private creepFindTasks(creep: Creep): void {
        if (creep.hasTasks()) return

        if (creep.role === 'scout') {
            this.executeScout(creep, new RoomPosition(25, 25, creep.room.name))
            return
        }

        if (creep.role === 'claimer') {
            this.executeClaim(creep, new RoomPosition(25, 25, creep.room.name))
            return
        }

        const bestTasks = this.findBestTask(creep)

        if (bestTasks.length > 0) {
            const bestTask = bestTasks.shift()

            if (bestTask) {
                creep.addTask({
                    action: bestTask.task,
                    id: bestTask.target.id,
                })
                this.creepsByTask[bestTask.task].push(creep)
            }
        }
    }

    private removeTaskByIndex(creep: Creep, index: number, findNew: boolean = true) {
        const task = creep.tasks[index]
        task.deleted = true
        this.log('manageCreeps', `#00ffcd[**task completed:**] action: ${task.action}`)

        creep.tasks.splice(index, 1)

        creep.tasks.forEach(task => {
            this.creepsByTask[task.action] = this.creepsByTask[task.action].filter(c => c.id !== creep.id && c.hasTaskByAction(task.action))
        })

        if (findNew) {
            this.creepFindTasks(creep)
        }
    }

    private executeTask(creep: Creep, task: TaskObject | TaskPosition, target: TargetTypes | RoomPosition): ScreepsReturnCode {
        this.log('manageCreeps', `\n**Execute Task:** ${task.action}\n  - **target:** ${target}`)

        const workPower = creep.body.filter(b => b.type === WORK).length
        switch (task.action) {
            case 'harvest': return this.executeHarvest(creep, target as Source, workPower)
            case 'build': return this.executeBuild(creep, target as ConstructionSite, workPower)
            case 'repair': return this.executeRepair(creep, target as Structure, workPower)
            case 'transfer': return this.executeTransfer(creep, target as Structure<StructureConstant>, 'amount' in task ? task.amount : undefined)
            case 'withdraw': return this.executeWithdraw(creep, target as StructureContainer)
            case 'pickup': return this.executePickup(creep, target as Resource)
            case 'upgrade': return this.executeUpgrade(creep, target as StructureController, workPower)
            case 'renew': return this.executeRenew(creep, target as StructureSpawn)
            case 'recycle': return (target as StructureSpawn).recycleCreep(creep)
            case 'attack': return this.executeAttack(creep, target as Creep)
            case 'move': return this.executeMove(creep, target as RoomPosition, task as TaskPosition)
            case 'scout': return this.executeScout(creep, target as RoomPosition)
            case 'claim': return this.executeClaim(creep, target as RoomPosition, task as TaskPosition)
            default: this.log('manageCreeps', '**executeTask:** action not found', task.action, 'target:', target); return ERR_NOT_FOUND
        }
    }

    private handleTaskResult(creep: Creep, task: TaskObject | TaskPosition, target: TargetTypes | RoomPosition, result: ScreepsReturnCode, taskId: number): void {
        const resultToText = (result: ScreepsReturnCode): string => {
            switch (result) {
                case OK: return 'OK'
                case ERR_NOT_IN_RANGE: return 'ERR_NOT_IN_RANGE'
                case ERR_BUSY: return 'ERR_BUSY'
                case ERR_FULL: return 'ERR_FULL'
                case ERR_INVALID_TARGET: return 'ERR_INVALID_TARGET'
                case ERR_NOT_ENOUGH_RESOURCES: return 'ERR_NOT_ENOUGH_RESOURCES'
                case ERR_NOT_FOUND: return 'ERR_NOT_FOUND'
                case ERR_NOT_OWNER: return 'ERR_NOT_OWNER'
                case ERR_NOT_IN_RANGE: return 'ERR_NOT_IN_RANGE'
                case ERR_NO_BODYPART: return 'ERR_NO_BODYPART'
                case ERR_NO_PATH: return 'ERR_NO_PATH'
                case ERR_NO_BODYPART: return 'ERR_NO_BODYPART'
                default: return result.toString()
            }
        }
        this.log('manageCreeps', `  - **task result:** ${resultToText(result)}`)

        if (result === ERR_NOT_IN_RANGE) {
            if (task.blocking === true) {
                this.log('manageCreeps', `  - **not in range** task will be removed from list as its blocking`)
                this.removeTaskByIndex(creep, taskId)
                return
            }

            if (this.creepCompletedActions[creep.id].has('move')) return

            if ((target instanceof RoomPosition && target.roomName !== creep.room.name) || ('roomName' in target && target.roomName !== creep.room.name)) {
                // Move towards target room
                const exitDir = creep.room.findExitTo(target.roomName)

                if (exitDir !== ERR_NO_PATH && exitDir !== ERR_INVALID_ARGS) {
                    const exitPos = creep.pos.findClosestByPath(exitDir)

                    if (exitPos) {
                        const result = creep.moveTo(exitPos)
                        if (result === OK) {
                            this.creepCompletedActions[creep.id].add('move')
                        }
                    }
                }
            } else if (OK === creep.moveTo(target)) {
                this.creepCompletedActions[creep.id].add('move')
            }
        }
        else if (result === OK || result === ERR_NOT_ENOUGH_RESOURCES || result === ERR_FULL || result === ERR_INVALID_TARGET) { // easy way to complete task
            this.removeTaskByIndex(creep, taskId)
        }
        else if (result === ERR_BUSY) { // wait until next tick
            task.waiting = true
        }
        else {
            this.log('manageCreeps', `#ff6969[**untracked task result:**] ${result}`, `**target:** ${target}`, '**task:**', { ...task })
        }
    }

    private manageCreepTasks(creep: Creep) {
        this.creepCompletedActions[creep.id] = new Set<ActionTypes>()

        this.log('manageCreeps', `\n#5aff6f[##${creep.name} processing tasks:##] `, creep.tasks.map(t => t.action).join(', '))

        const myFlag = this.flags.find(f => f.name === creep.name)
        if (myFlag) {
            if (creep.pos.isEqualTo(myFlag.pos)) {
                this.log('manageCreeps', `  - **flag found:** ${myFlag.name}`)
                myFlag.remove()
            } else {
                this.log('manageCreeps', `  - **flag found:** moving to position ${myFlag.pos}`)
                creep.tasks = []
                creep.moveTo(myFlag.pos)
            }
            return
        }

        this.creepFindTasks(creep)

        const getTarget = (task: TaskObject): TargetTypes | RoomPosition | undefined => {
            // this.log('manageCreeps', `  - **getTarget:** ${task.action}`, { ...task })

            if (task.action === 'attack') {
                this.log('manageCreeps', `  - **getTarget:** attack`, { ...task }, this.enemies)
            }

            switch (task.action) {
                case 'harvest': return this.sources.find(source => source.id === task.id)
                case 'build': return this.constructionSites.find(site => site.id === task.id)
                case 'repair': return this.needsRepair.find(structure => structure.id === task.id)
                case 'transfer':
                case 'withdraw': return Game.getObjectById<TargetTypes>(task.id) as TargetTypes
                case 'upgrade': return this.controller
                case 'renew':
                case 'recycle': task.persistent = true; return this.spawns.find(spawn => spawn.id === task.id)
                case 'pickup': return this.droppedResources.find(resource => resource.id === task.id)
                case 'attack': return this.enemies.find(enemy => enemy.id === task.id) as Creep
                case 'claim':
                case 'scout':
                case 'move': return 'pos' in task && typeof task.pos === 'object' && task.pos !== null && 'x' in task.pos && 'y' in task.pos && 'roomName' in task.pos ? new RoomPosition(task.pos.x as number, task.pos.y as number, task.pos.roomName as string) : undefined

                default: this.log('manageCreeps', '#ff6969[**untracked task action:**]', task.action); return undefined
            }
        }

        let i = 0
        while (creep.tasks.length > 0) {
            i++
            if (i > 4) {
                this.log('manageCreeps', `<h1>**manageCreep:**</h1> infinite loop`)
                this.log('manageCreeps', '**local.usedCapacity:**', this.usedCapacity(creep))
                this.log('manageCreeps', '**local.freeCapacity:**', this.freeCapacity(creep))
                this.log('manageCreeps', '**store.usedCapacity:**', creep.store.getUsedCapacity(RESOURCE_ENERGY))
                this.log('manageCreeps', '**store.freeCapacity:**', creep.store.getFreeCapacity(RESOURCE_ENERGY))
                break
            }

            const taskId = creep.tasks.findIndex(t => !t.completed && !t.waiting && ('id' in t || 'pos' in t))
            if (taskId === -1) break

            const task = creep.tasks[taskId] as TaskObject

            task.completed = true

            const target = getTarget(task)
            if (!target) {
                this.log('manageCreeps', `**target not found:** clearing action: ${task.action}`)
                this.removeTaskByIndex(creep, taskId)
                continue
            }

            const result = this.executeTask(creep, task, target)
            this.handleTaskResult(creep, task, target, result, taskId)

            if (task.persistent && !task.deleted) {
                this.log('manageCreeps', `  - **persistent task:** ${task.action}`)
                break
            }
        }

        creep.tasks.forEach(t => {
            t.completed = undefined
            t.waiting = undefined
        })

        if (!creep.tasks.length) {
            this.log('manageCreeps', `  - **no tasks left:** ${creep.name}`)

            const nearestFlag = this.flags
                .sort((a, b) => creep.pos.getRangeToCached(a.pos) - creep.pos.getRangeToCached(b.pos))
                .shift()

            if (nearestFlag && creep.pos.getRangeToCached(nearestFlag.pos) > 2) {
                const result = creep.moveTo(nearestFlag.pos)
                if (result === OK) {
                    this.creepCompletedActions[creep.id].add('move')
                }
            }
        }

        this.log('manageCreeps',
            '\n#2badff[**tasks summary:**]',
            '\n  - **tasks left:** ', creep.tasks
                .map(t => {
                    if (t.action === 'harvest') {
                        const workPower = creep.body.filter(b => b.type === WORK).length
                        const ticksLeft = this.freeCapacity(creep) / (workPower * HARVEST_POWER)
                        return `${t.action} (ticks left: ${ticksLeft})`
                    } else if (t.action === 'build') {
                        const workPower = creep.body.filter(b => b.type === WORK).length
                        const ticksLeft = this.usedCapacity(creep) / (workPower * BUILD_POWER)
                        return `${t.action} (ticks left: ${ticksLeft})`
                    } else if (t.action === 'repair') {
                        const workPower = creep.body.filter(b => b.type === WORK).length
                        const ticksLeft = this.usedCapacity(creep) / (workPower * REPAIR_POWER)
                        return `${t.action} (ticks left: ${ticksLeft})`
                    } else if (t.action === 'upgrade') {
                        const workPower = creep.body.filter(b => b.type === WORK).length
                        const ticksLeft = this.usedCapacity(creep) / (workPower * UPGRADE_CONTROLLER_POWER)
                        return `${t.action} (ticks left: ${ticksLeft})`
                    }
                    return t.action
                })
                .join(', '),
            '\n  - **actions completed:** ', Array.from(this.creepCompletedActions[creep.id]).join(', '),
            `\n  - **freeCapacity:** ${this.freeCapacity(creep)}/${creep.store.getFreeCapacity(RESOURCE_ENERGY)}`,
            `\n  - **usedCapacity:** ${this.usedCapacity(creep)}/${creep.store.getUsedCapacity(RESOURCE_ENERGY)}`
        )
    }

    private executeClaim(creep: Creep, target: RoomPosition, task?: TaskPosition): ScreepsReturnCode {
        const findNewClaim = (): boolean => {
            const wantedRoom = Object.entries(CONFIG.rooms).filter(([roomName, room]) => {
                if (roomName === 'default') return false

                if (Game.rooms[roomName]?.controller?.my || Memory.rooms[roomName]?.owner) {
                    return false
                }

                return true
            })
                .map(([roomName]) => roomName)
                .shift()

            if (wantedRoom) {
                this.log('manageCreeps', `  - **new claim:** ${wantedRoom}`)

                creep.addTask({
                    action: 'claim',
                    pos: {
                        x: 25,
                        y: 25,
                        roomName: wantedRoom
                    }
                } as TaskPosition)

                return true
            }

            return false
        }

        if (creep.room.name === target.roomName) {
            const controller = creep.room.controller

            if (controller) {
                if (controller.my) {
                    if (findNewClaim()) return ERR_BUSY

                    this.log('manageCreeps', `  - **claim controller:** ${controller.id} (already claimed by ${controller.owner!.username})`)
                    return OK
                }

                if (task) {
                    task.pos.x = controller.pos.x
                    task.pos.y = controller.pos.y
                }

                const result = creep.claimController(controller)
                this.log('manageCreeps', `  - **claim result:** ${result}`)

                return result
            }

            this.log('manageCreeps', `  - **claim controller:** ${target.roomName} (no controller found)`)
            return OK
        } else {
            // Move towards target room
            const exitDir = creep.room.findExitTo(target.roomName)

            if (exitDir === ERR_NO_PATH || exitDir === ERR_INVALID_ARGS) {
                this.log('manageCreeps', `  - **claim:** no exit found to target room: ${target.roomName}`)
                return OK // clears the task, another random room will be selected
            }

            const exitPos = creep.pos.findClosestByPath(exitDir)

            if (!exitPos) {
                this.log('manageCreeps', `  - **claim:** no exit pos found to target room: ${target.roomName}`)
                return OK // clears the task, another random room will be selected
            }

            const result = creep.moveTo(target)
            if (result === OK) {
                this.creepCompletedActions[creep.id].add('move')
            }

            return ERR_BUSY
        }

        return ERR_BUSY
    }

    private executeScout(creep: Creep, target: RoomPosition): ScreepsReturnCode {
        if (creep.room.name === target.roomName) {
            this.log('manageCreeps', `  - **in target room:** ${target.roomName}`)

            const expiredRooms = Object.entries(Memory.rooms).filter(([roomName, room]) => {
                if (room.lastVisited && room.lastVisited > Game.time - 300) {
                    return false // room was visited in the last 300 ticks
                }

                if (Game.rooms[roomName]) {
                    return false // room exists
                }

                return true // room does not exist
            })
                .map(([roomName]) => roomName)
            this.log('manageCreeps', `  - **expired rooms:**`, expiredRooms.join(', '))

            let newRoomName = expiredRooms.shift()

            if (!newRoomName) {
                this.log('manageCreeps', `  - **no expired rooms, exploring unexplored rooms**`)

                const exits = Game.map.describeExits(creep.room.name)
                const unexplored = Object.values(exits)
                    .sort(() => Math.random() - 0.5)
                    .find(room => !(Memory.rooms?.[room]))

                if (unexplored) {
                    newRoomName = unexplored
                    this.log('manageCreeps', `  - **random unexplored room found:** ${newRoomName}`)
                }
            }

            if (newRoomName) {
                this.log('manageCreeps', `  - **tasking to unexplored room:** ${newRoomName}`)
                creep.addTask({
                    action: 'scout',
                    pos: {
                        x: 25,
                        y: 25,
                        roomName: newRoomName
                    }
                } as TaskPosition)
                this.creepsByTask.scout.push(creep)

                target = new RoomPosition(25, 25, newRoomName)
            }
        }

        if (creep.room.name !== target.roomName) {
            // Move towards target room
            const exitDir = creep.room.findExitTo(target.roomName)

            if (exitDir === ERR_NO_PATH || exitDir === ERR_INVALID_ARGS) {
                this.log('manageCreeps', `  - **no exit found to target room:** ${target.roomName}`)
                return OK // clears the task, another random room will be selected
            }

            const exitPos = creep.pos.findClosestByPath(exitDir)

            if (!exitPos) {
                this.log('manageCreeps', `  - **no exit pos found to target room:** ${target.roomName}`)
                return OK // clears the task, another random room will be selected
            }

            target = exitPos
        }

        const result = creep.moveTo(target)
        if (result === OK) {
            this.creepCompletedActions[creep.id].add('move')
        }

        return ERR_BUSY
    }

    private executeMove(creep: Creep, target: RoomPosition, task?: TaskPosition): ScreepsReturnCode {

        if (creep.room.name !== target.roomName) {
            // Move towards target room
            const exitDir = creep.room.findExitTo(target.roomName)

            if (exitDir === ERR_NO_PATH || exitDir === ERR_INVALID_ARGS) {
                this.log('manageCreeps', `  - **executeMove** no exit found to target room: ${target.roomName}`)
                return OK // clears the task, another random room will be selected
            }

            const exitPos = creep.pos.findClosestByPath(exitDir)

            if (!exitPos) {
                this.log('manageCreeps', `  - **executeMove** no exit pos found to target room: ${target.roomName}`)
                return OK
            }

            const result = creep.moveTo(exitPos)
            if (result === OK) {
                this.creepCompletedActions[creep.id].add('move')
                return ERR_BUSY
            }

            return result
        }

        if (creep.pos.getRangeToCached(target) <= (task?.pos.range ?? 0)) {
            this.log('manageCreeps', `  - **executeMove** creep is already at target: ${target.x}, ${target.y}, ${target.roomName}`)
            return OK
        }

        return ERR_NOT_IN_RANGE
    }

    private executePickup(creep: Creep, target: Resource): ScreepsReturnCode {
        this.log('manageCreeps', `**pickup target:** ${target.id}`)

        if (this.usedCapacity(target) === 0) {
            this.log('manageCreeps', `  - **target out of resources**`)
            return ERR_INVALID_TARGET
        }

        if (creep.pos.getRangeToCached(target.pos) > 1) {
            this.log('manageCreeps', `  - **not in range**`)
            return ERR_NOT_IN_RANGE
        }

        if (this.creepCompletedActions[creep.id].has('transfer')) {
            this.log('manageCreeps', `  - **transfer already completed. waiting until next tick**`)
            return ERR_BUSY
        }

        const result = creep.pickup(target)
        this.log('manageCreeps', `  - **result:** ${result}`)

        if (result === OK) {
            this.transfers[creep.id] ??= 0
            this.transfers[creep.id] += target.amount

            this.transfers[target.id] ??= 0
            this.transfers[target.id] -= target.amount

            this.creepCompletedActions[creep.id].add('transfer')
        }

        return result
    }

    private executeAttack(creep: Creep, target: Creep): ScreepsReturnCode {
        this.log('manageCreeps', `**attack target:** ${target.id}`)

        const hasRangedAttack = creep.body.some(part => part.type === RANGED_ATTACK)
        const hasHeal = creep.body.some(part => part.type === HEAL)

        if (hasHeal) {
            const healResult = creep.heal(target)
            this.log('manageCreeps', `  - **heal result:** ${healResult}`)
        }

        if (hasRangedAttack) {
            // Check if the target is within ranged attack range
            if (creep.pos.getRangeToCached(target.pos) > 4) {
                this.log('manageCreeps', `  - **not in ranged attack range, moving closer**`)
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ff0000' } })
                return ERR_BUSY
            }
        } else {
            // Check if the target is within ranged attack range
            if (!creep.pos.isNearToCached(target.pos)) {
                this.log('manageCreeps', `  - **not in ranged attack range, moving closer**`)
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ff0000' } })
                return ERR_BUSY
            }
        }

        if (hasRangedAttack) {
            // Execute the ranged attack
            const rangedAttackResult = creep.rangedAttack(target)
            this.log('manageCreeps', `  - **ranged attack result:** ${rangedAttackResult}`)

            const retreatDirection = creep.pos.getDirectionTo(target.pos)
            if (OK === creep.move(((retreatDirection + 4) % 8 + 1) as DirectionConstant)) { // Move in the opposite direction
                this.creepCompletedActions[creep.id].add('move')
            }

            return ERR_BUSY
        }

        // Execute the melee attack
        const attackResult = creep.attack(target)
        this.log('manageCreeps', `  - **attack result:** ${attackResult}`)

        return ERR_BUSY
    }

    private executeUpgrade(creep: Creep, target: StructureController, workPower: number): ScreepsReturnCode {
        const power = workPower * UPGRADE_CONTROLLER_POWER
        this.log('manageCreeps', `  - **power:** ${power}`)
        this.log('manageCreeps', `  - **freeCapacity:** ${this.freeCapacity(creep)}/${creep.store.getFreeCapacity(RESOURCE_ENERGY)}`, `\n  - **usedCapacity:** ${this.usedCapacity(creep)}/${creep.store.getUsedCapacity(RESOURCE_ENERGY)}`)

        // if a harvester, and more than 4 creeps are upgrading, and there are positions at a source, abort
        // we get in this situation when we have extra harvesters and a source was exhausted during assignment
        // if (creep.role === 'harvester' && this.creepsByTask.upgrade.length >= 4 && this.sourceWalkablePositionsTotal > this.creepsByTask.harvest.length) {
        //     this.log('manageCreeps', `  - **aborting upgrade task**`)
        //     return OK
        // }

        // if (creep.role === 'harvester' &&
        //     this.creepsByRole.mule.length &&
        //     this.creepsByRole.upgrader.length >= 2 &&
        //     this.creepsByRole.harvester.length < this.sourceWalkablePositionsTotal &&
        //     this.containers.length > 0 && this.containers.every(c => !this.freeCapacity(c))
        // ) {
        //     this.log('manageCreeps', `  - **aborting upgrade task** `)
        //     return OK
        // }

        // if there is no energy, wait until next tick for resources to be available
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) < power) {
            if (this.usedCapacity(creep) >= power) {
                this.log('manageCreeps', `  - **wait until next tick for resources to be available**`)
                return ERR_BUSY
            } else {
                this.log('manageCreeps', `  - **not enough resources**`)
                return ERR_NOT_ENOUGH_RESOURCES
            }
        }

        if (creep.pos.getRangeToCached(target.pos) > 4) {
            this.log('manageCreeps', `  - **not in range**`)
            return ERR_NOT_IN_RANGE
        }

        if (this.creepCompletedActions[creep.id].has('work')) {
            this.log('manageCreeps', `  - **work already completed. waiting until next tick**`)
            return ERR_BUSY
        }

        const result = creep.upgradeController(target)
        this.log('manageCreeps', `  - **result:** ${result}`)

        if (result === OK) {
            this.transfers[creep.id] ??= 0
            this.transfers[creep.id] -= power
            this.transfers[target.id] ??= 0
            this.transfers[target.id] += power

            this.creepCompletedActions[creep.id].add('work')

            if (this.usedCapacity(creep) >= power) {
                this.log('manageCreeps', `  - **enough energy to continue upgrading**`)
                return ERR_BUSY
            }
        }

        return result
    }

    private executeHarvest(creep: Creep, target: Source, workPower: number): ScreepsReturnCode {
        const power = workPower * HARVEST_POWER
        this.log('manageCreeps', `  - **power:** ${power}`)
        this.log('manageCreeps', `  - **freeCapacity:** ${this.freeCapacity(creep)}/${creep.store.getFreeCapacity(RESOURCE_ENERGY)}`, `\n  - **usedCapacity:** ${this.usedCapacity(creep)}/${creep.store.getUsedCapacity(RESOURCE_ENERGY)}`)
        this.log('manageCreeps', `  - **sourceWalkablePositions:** ${target.walkablePositions}`)

        // how many harvesters are at this source?
        const harvestersAtSource = this.creepsByTask.harvest.filter(c => c.id !== creep.id && c.pos.isNearToCached(target.pos)).length
        this.log('manageCreeps', `  - **harvesters at source:** ${harvestersAtSource}`)

        // is this sort over assigned?
        if (harvestersAtSource >= target.walkablePositions) {
            this.creepsByTask.harvest = this.creepsByTask.harvest.filter(c => c.id !== creep.id)
            this.log('manageCreeps', `  - **harvest over assigned**`)
            return ERR_INVALID_TARGET
        }

        if (this.usedCapacity(target) === 0) {
            this.log('manageCreeps', `  - **target out of resources**`)
            return ERR_INVALID_TARGET
        }

        if (!creep.pos.isNearToCached(target.pos)) {
            this.log('manageCreeps', `  - **not in range**`)
            return ERR_NOT_IN_RANGE
        }

        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) < power) { // not enough resources
            if (!this.freeCapacity(creep)) { // wait until next tick for resources to be available
                this.log('manageCreeps', `  - **full**`)
                return ERR_FULL
            }
        }

        if (this.creepCompletedActions[creep.id].has('work')) {
            this.log('manageCreeps', `  - **work already completed. waiting until next tick**`)
            return ERR_BUSY
        }

        const result = creep.harvest(target)
        this.log('manageCreeps', `  - **result:** ${result}`)

        if (result === OK) {
            this.transfers[creep.id] ??= 0
            this.transfers[creep.id] += workPower * HARVEST_POWER
            this.transfers[target.id] ??= 0
            this.transfers[target.id] -= workPower * HARVEST_POWER

            this.creepCompletedActions[creep.id].add('work')

            if (this.freeCapacity(creep) > 0) {
                return ERR_BUSY
            }
        }

        return result
    }

    private executeBuild(creep: Creep, target: ConstructionSite, workPower: number): ScreepsReturnCode {
        const power = workPower * BUILD_POWER
        this.log('manageCreeps', `  - **power:** ${power}`)
        this.log('manageCreeps', `  - **freeCapacity:** ${this.freeCapacity(creep)}/${creep.store.getFreeCapacity(RESOURCE_ENERGY)}`, `\n  - **usedCapacity:** ${this.usedCapacity(creep)}/${creep.store.getUsedCapacity(RESOURCE_ENERGY)}`)

        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) < power) { // not enough resources
            this.log('manageCreeps', `  - **usedCapacity:** ${this.usedCapacity(creep)}/${creep.store.getUsedCapacity(RESOURCE_ENERGY)}`)
            this.log('manageCreeps', `  - **freeCapacity:** ${this.freeCapacity(creep)}/${creep.store.getFreeCapacity(RESOURCE_ENERGY)}`)

            if (this.usedCapacity(creep) >= power) { // wait until next tick for resources to be available
                this.log('manageCreeps', `  - **wait until next tick for resources to be available**`)
                return ERR_BUSY
            } else {
                this.log('manageCreeps', `  - **not enough resources**`)
                return ERR_NOT_ENOUGH_RESOURCES
            }
        }

        const range = creep.pos.getRangeToCached(target.pos)
        this.log('manageCreeps', `  - **range:** ${range}`)
        if (range > 4) { // not in range
            return ERR_NOT_IN_RANGE
        }

        if (this.creepCompletedActions[creep.id].has('work')) {
            this.log('manageCreeps', `  - **work already completed** waiting until next tick`)
            return ERR_BUSY
        }

        const result = creep.build(target)
        this.log('manageCreeps', `  - **result:** ${result}`)

        if (result === OK && !this.creepCompletedActions[creep.id].has('move')) {
            const nearestFlag = this.flags.find(f => f.pos.getRangeToCached(target.pos) <= 4)
            if (nearestFlag) {
                const result = creep.moveTo(nearestFlag.pos)
                if (result === OK) {
                    this.creepCompletedActions[creep.id].add('move')
                }
            }
        }

        if (result === OK) {
            this.transfers[creep.id] ??= 0
            this.transfers[creep.id] -= power
            this.transfers[target.id] ??= 0
            this.transfers[target.id] += power

            this.creepCompletedActions[creep.id].add('work')

            if (this.usedCapacity(creep) >= power * 2) {
                return ERR_BUSY
            } else if (this.usedCapacity(creep) >= power) {
                this.log('manageCreeps', `  - **almost out of resources** looking for container near by`)

                const containerNearBy = this.containers
                    .filter(c => this.usedCapacity(c) > this.freeCapacity(creep) && creep.pos.isNearToCached(c.pos))
                    .shift()

                if (containerNearBy) {
                    this.log('manageCreeps', `  - **found container near by:** ${containerNearBy?.id}`)

                    creep.addTask({ id: containerNearBy.id, action: 'withdraw', blocking: true } as TaskObject, true)
                    this.creepsByTask.withdraw.push(creep)
                    return ERR_BUSY
                } else if (!this.creepCompletedActions[creep.id].has('move')) {

                    // is there a container closer by that we can use?
                    const containerNearBy = this.containers
                        .filter(c => this.usedCapacity(c) >= this.freeCapacity(creep) && creep.pos.getRangeToCached(c.pos) < 3)
                        .shift()

                    if (containerNearBy) {
                        const directionToContainer = creep.pos.getDirectionTo(containerNearBy.pos)

                        this.log('manageCreeps', `  - **found container near by:** ${containerNearBy?.id}. distance: ${creep.pos.getRangeToCached(containerNearBy.pos)} direction: ${directionToContainer}`)

                        if (OK === creep.move(directionToContainer)) {
                            this.creepCompletedActions[creep.id].add('move')
                        }

                        return ERR_BUSY
                    }
                }

                this.log('manageCreeps', `  - **out of resources** no container near by`)
                return ERR_NOT_ENOUGH_RESOURCES
            }
        }

        return result
    }

    private executeRepair(creep: Creep, target: Structure, workPower: number): ScreepsReturnCode {
        const power = workPower * REPAIR_POWER
        this.log('manageCreeps', `  - **power:** ${power}`)
        this.log('manageCreeps', `  - **freeCapacity:** ${this.freeCapacity(creep)}/${creep.store.getFreeCapacity(RESOURCE_ENERGY)}`, `\n  - **usedCapacity:** ${this.usedCapacity(creep)}/${creep.store.getUsedCapacity(RESOURCE_ENERGY)}`)

        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) < power) { // not enough resources
            this.log('manageCreeps', `  - **usedCapacity:** ${this.usedCapacity(creep)}/${creep.store.getUsedCapacity(RESOURCE_ENERGY)}`)
            this.log('manageCreeps', `  - **freeCapacity:** ${this.freeCapacity(creep)}/${creep.store.getFreeCapacity(RESOURCE_ENERGY)}`)

            if (this.usedCapacity(creep) >= power) { // wait until next tick for resources to be available
                this.log('manageCreeps', `  - **wait until next tick for resources to be available**`)
                return ERR_BUSY
            } else {
                this.log('manageCreeps', `  - **not enough resources**`)
                return ERR_NOT_ENOUGH_RESOURCES
            }
        }

        const range = creep.pos.getRangeToCached(target.pos)
        this.log('manageCreeps', `  - **range:** ${range}`)
        if (range > 4) { // not in range
            return ERR_NOT_IN_RANGE
        }

        if (this.creepCompletedActions[creep.id].has('work')) {
            this.log('manageCreeps', `  - **work already completed** waiting until next tick`)
            return ERR_BUSY
        }

        const result = creep.repair(target)
        this.log('manageCreeps', `  - **result:** ${result}`)

        if (result === OK && !this.creepCompletedActions[creep.id].has('move')) {
            const nearestFlag = this.flags.find(f => f.pos.getRangeToCached(target.pos) <= 4)
            if (nearestFlag) {
                const result = creep.moveTo(nearestFlag.pos)
                if (result === OK) {
                    this.creepCompletedActions[creep.id].add('move')
                }
            }
        }

        if (result === OK) {
            this.transfers[creep.id] ??= 0
            this.transfers[creep.id] -= power
            this.transfers[target.id] ??= 0
            this.transfers[target.id] += power

            this.creepCompletedActions[creep.id].add('work')

            if (this.usedCapacity(creep) >= power) {
                return ERR_BUSY
            } else if (this.usedCapacity(target) === 0) {

                const containerNearBy = this.containers
                    .filter(c => this.usedCapacity(c) > this.freeCapacity(creep))
                    .sort((a, b) => a.pos.getRangeToCached(target.pos) - b.pos.getRangeToCached(target.pos))
                    .shift()

                if (containerNearBy) {
                    creep.addTask({ id: containerNearBy.id, action: 'withdraw', waiting: true } as TaskObject, true)
                    this.creepsByTask.withdraw.push(creep)
                    return ERR_BUSY
                }

                this.log('manageCreeps', `  - **out of resources**`)
                return ERR_NOT_ENOUGH_RESOURCES
            }
        }

        return result
    }

    private executeTransfer(creep: Creep, target: Structure<StructureConstant>, amount: number | undefined = undefined): ScreepsReturnCode {
        this.log('manageCreeps', `  - **freeCapacity:** ${this.freeCapacity(creep)}/${creep.store.getFreeCapacity(RESOURCE_ENERGY)}`, `\n  - **usedCapacity:** ${this.usedCapacity(creep)}/${creep.store.getUsedCapacity(RESOURCE_ENERGY)}`)

        // if transfering to a container near spawn, and room not at full capacity, return
        // we got here because a creep was assigned to transfer to a container near spawn, but the room is not at full capacity since assigned to a refillable
        if (this.containersNearSpawns.some(c => c.id === target.id) && this.energyAvailable < this.energyCapacityAvailable) {
            return ERR_INVALID_TARGET
        }

        if (this.usedCapacity(creep) === 0) {
            this.log('manageCreeps', `  - **not enough resources**`)
            return ERR_NOT_ENOUGH_RESOURCES
        }

        if (this.freeCapacity(target) === 0) {
            this.log('manageCreeps', `  - **full**`)
            return ERR_FULL
        }

        if (!creep.pos.isNearToCached(target.pos)) { // not in range
            this.log('manageCreeps', `  - **not in range**`)
            return ERR_NOT_IN_RANGE
        }

        if (this.creepCompletedActions[creep.id].has('transfer')) {
            this.log('manageCreeps', `  - **transfer already completed** waiting until next tick`)
            return ERR_BUSY
        }

        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            if (this.usedCapacity(creep) > 0) {
                this.log('manageCreeps', `  - **wait until next tick for resources to be available**`)
                return ERR_BUSY // wait until next tick for resources to be available
            } else {
                this.log('manageCreeps', `  - **not enough resources**`)
                return ERR_NOT_ENOUGH_RESOURCES // done
            }
        }

        amount = amount ?? Math.min((target as StructureContainer).store.getFreeCapacity(RESOURCE_ENERGY), creep.store.getUsedCapacity(RESOURCE_ENERGY))

        const result = creep.transfer(target, RESOURCE_ENERGY, amount)

        if (result === OK) {
            this.log('manageCreeps', `  - **transferred:** amount: ${amount} target: ${target.id}`)

            this.transfers[creep.id] ??= 0
            this.transfers[creep.id] -= amount
            this.transfers[target.id] ??= 0
            this.transfers[target.id] += amount

            this.creepCompletedActions[creep.id].add('transfer')
        }

        return result
    }

    private executeWithdraw(creep: Creep, target: StructureContainer): ScreepsReturnCode {
        this.log('manageCreeps', `  - **freeCapacity:** ${this.freeCapacity(creep)}/${creep.store.getFreeCapacity(RESOURCE_ENERGY)}`, `\n  - **usedCapacity:** ${this.usedCapacity(creep)}/${creep.store.getUsedCapacity(RESOURCE_ENERGY)}`)

        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            if (this.freeCapacity(creep) > 0) {
                this.log('manageCreeps', `  - **wait until next tick for resources to be available**`)
                return ERR_BUSY // wait until next tick for resources to be available
            } else {
                this.log('manageCreeps', `  - **not enough resources**`)
                return ERR_NOT_ENOUGH_RESOURCES // done
            }
        }

        if (target.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            if (this.usedCapacity(target) > 0) {
                this.log('manageCreeps', `  - **wait until next tick for resources to be available**`)
                return ERR_BUSY // wait until next tick for resources to be available
            } else {
                this.log('manageCreeps', `  - **not enough resources**`)
                return ERR_NOT_ENOUGH_RESOURCES // done
            }
        }

        if (!creep.pos.isNearToCached(target.pos)) { // not in range
            this.log('manageCreeps', `  - **not in range**`)
            return ERR_NOT_IN_RANGE
        }

        if (this.creepCompletedActions[creep.id].has('transfer')) {
            this.log('manageCreeps', `  - **transfer already completed** waiting until next tick`)
            return ERR_BUSY
        }

        const amount = Math.min(target.store.getUsedCapacity(RESOURCE_ENERGY), creep.store.getFreeCapacity(RESOURCE_ENERGY))

        const result = creep.withdraw(target, RESOURCE_ENERGY)

        if (result === OK) {
            this.log('manageCreeps', `  - **withdrew:** ${target.id} amount: ${amount}`)

            this.transfers[creep.id] ??= 0
            this.transfers[creep.id] += amount
            this.transfers[target.id] ??= 0
            this.transfers[target.id] -= amount

            this.creepCompletedActions[creep.id].add('transfer')
        }

        return result
    }

    private executeRenew(creep: Creep, target: StructureSpawn): ScreepsReturnCode {
        if (creep.ticksToLive && creep.ticksToLive > 1400 || this.energyAvailable < this.energyCapacityAvailable) {
            return ERR_INVALID_TARGET
        }

        if (!creep.pos.isNearToCached(target.pos)) { // not in range
            this.log('manageCreeps', `  - **not in range**`)
            return ERR_NOT_IN_RANGE
        }

        const result = target.renewCreep(creep)

        if (result === ERR_NOT_ENOUGH_RESOURCES) {
            return ERR_BUSY
        }
        else if (result === OK) {
            const creepCost = creep.body.reduce((sum, part) => sum + BODYPART_COST[part.type], 0)
            const costToRenew = Math.ceil(creepCost / 2.5 / creep.body.length)

            this.log('manageCreeps', `  - **cost to renew:** ${costToRenew}`)

            this.transfers[target.id] ??= 0
            this.transfers[target.id] -= costToRenew

            if (this.usedCapacity(creep) > 0 && !creep.hasTaskByAction('transfer') && !creep.hasTaskByAction('withdraw')) {
                creep.addTask({
                    id: target.id,
                    action: 'transfer',
                    blocking: true,
                } as TaskObject, true)
                this.creepsByTask.transfer.push(creep)

                if (this.freeCapacity(creep) > 0) {
                    const containerNearBy = this.containersNearSpawns
                        .filter(c => this.usedCapacity(c) > 0 && c.pos.isNearToCached(creep.pos))
                        .shift()

                    if (containerNearBy) {
                        creep.addTask({
                            id: containerNearBy.id,
                            action: 'withdraw',
                            blocking: true,
                        } as TaskObject, true)
                        this.creepsByTask.withdraw.push(creep)
                    }
                }
            }

            // if (this.usedCapacity(target) < costToRenew) {
            //     return OK
            // }

            return ERR_BUSY
        }

        return result
    }

    private setupCreepRoles() {
        this.startLogs('manageRoles')

        const maxBodyParts = (bodyParts: BodyPartConstant[], limit: number = 800): BodyPartConstant[] => {
            const cost = (bodyParts: BodyPartConstant[]) => bodyParts.reduce((sum, part) => sum + BODYPART_COST[part], 0)
            let body = [...bodyParts]

            while (cost(body.concat(bodyParts)) <= Math.min(limit, this.energyCapacityAvailable)) {
                body = body.concat(bodyParts)
            }

            return body
        }

        const calculateDefender = (): { body: BodyPartConstant[], max: number } => {
            if (this.controllerLevel < 3) return { body: [], max: 0 }

            const energyAvailable = Math.min(1200, Math.min(300, this.energyCapacityAvailable))
            const body = buildCreepBody(1200, { tough: 1, move: 7, attack: 2, ranged_attack: 2, heal: 1 }, 0, 6)
                .sort((a, b) => {
                    if (a === TOUGH) return 1
                    if (b === TOUGH) return -1
                    if (a === RANGED_ATTACK) return 1
                    if (b === RANGED_ATTACK) return -1
                    if (a === ATTACK) return 1
                    if (b === ATTACK) return -1
                    if (a === MOVE) return 1
                    if (b === MOVE) return -1
                    if (a === HEAL) return 1
                    if (b === HEAL) return -1

                    return 0
                }).reverse()

            let maxDefenders = 0

            const myRooms = Object.values(Game.rooms).filter(r => r.controller?.my)

            const totalEnemiesAcrossAllRooms = myRooms.reduce((sum, room) => sum + (room.find(FIND_HOSTILE_CREEPS).length || 0), 0)

            if (totalEnemiesAcrossAllRooms > 0) {
                maxDefenders = Math.min(3, Math.floor(totalEnemiesAcrossAllRooms / 2))
            }

            return { body, max: maxDefenders }
        }

        const calculateHarvester = (): { body: BodyPartConstant[], max: number } => {
            const energyAvailable = Math.min(900, this.energyCapacityAvailable)
            const body = buildCreepBody(energyAvailable, { move: 1, work: 1.5, carry: 0.75 }, UPGRADE_CONTROLLER_POWER, 8)
            const workPower = body.filter(p => p === WORK).length * UPGRADE_CONTROLLER_POWER
            const maxHarvesters = Math.floor(((3000 / 250) * this.sourcesActive.length) / workPower) // max is based on workPower

            this.log('manageRoles', `  - **maxHarvesters:** ${maxHarvesters}`)

            let wantedHarvesters = this.sourceWalkablePositionsTotal
            this.log('manageRoles', `  - **sourceWalkablePositionsTotal:** ${this.sourceWalkablePositionsTotal}`)

            // this.creepsByRole.upgrader
            //     .filter(c => !this.usedCapacity(c))
            //     .forEach(() => maxUpgraders -= 2)

            // early game
            if (this.controllerLevel <= 2 && this.constructionSites.length > 0 && !this.creepsByRole.builder.length) {
                wantedHarvesters += 2
            }

            this.log('manageRoles', `  - **creepsByRole.harvester:** ${this.creepsByRole.harvester.length}`)

            if (this.creepsByRole.harvester.some(c => !c.memory.tasks || !c.memory.tasks.length)) {
                wantedHarvesters -= 1
            }

            if (this.containersNearSources.length && this.containersNearSources.every(c => this.usedCapacity(c) > 1800)) {
                wantedHarvesters -= Math.floor(maxHarvesters * 0.2)
            }

            this.log('manageRoles', `  - **wantedHarvesters:** ${wantedHarvesters}`)

            return { body, max: Math.max(1, Math.min(maxHarvesters, wantedHarvesters)) }
        }

        const calculateUpgrader = (): { body: BodyPartConstant[], max: number } => {
            if (!this.containersNearController.length) return { body: [], max: 0 }

            const energyAvailable = Math.min(800, this.energyCapacityAvailable)
            const body = buildCreepBody(energyAvailable, { move: 1, work: 1.5, carry: 0.75 }, UPGRADE_CONTROLLER_POWER, 6)
            const workPower = body.filter(p => p === WORK).length * UPGRADE_CONTROLLER_POWER
            const maxUpgraders = Math.floor(12 / workPower) // max is based on workPower being below 12

            let wantedUpgraders = this.controllerLevel >= 3 ? 1 : 0

            // this.creepsByRole.upgrader
            //     .filter(c => !this.usedCapacity(c))
            //     .forEach(() => maxUpgraders -= 2)
            if (this.energyAvailable === this.energyCapacityAvailable && !this.creepsByRole.builder.length && this.sourcesActive.length >= 2) {
                this.containersNearController
                    .filter(c => this.usedCapacity(c) > 1900)
                    .forEach(() => wantedUpgraders += 1)

                this.containersNearSources
                    .filter(c => this.usedCapacity(c) > 1500)
                    .forEach(() => wantedUpgraders += 1)

                if (this.containers.length >= 3 && this.containers.every(c => this.usedCapacity(c) > 1000)) {
                    wantedUpgraders += Math.floor(this.containers.length / 2)
                }
            }

            return { body, max: Math.min(maxUpgraders, wantedUpgraders) }
        }

        const calculateMule = (): { body: BodyPartConstant[], max: number } => {
            const energyAvailable = Math.min(800, Math.min(200, this.energyCapacityAvailable))
            const body = buildCreepBody(energyAvailable, { move: 1, carry: 1 }, 0, 6)
            const workPower = body.filter(p => p === WORK).length * UPGRADE_CONTROLLER_POWER

            let wantedMules = 0

            if (this.creepsByRole.harvester.length > 0 && this.sourcesActive.length >= 1) {
                // if there are containers near sources with more than 400 energy and there are refillables, add 1 mule
                if (this.containers.some(c => this.usedCapacity(c) > 400) && this.refillables.length > 0) {
                    wantedMules += 1
                }

                // if there are 2 containers near sources with more than 1000 energy and 1 container near spawns with more than 1000 free capacity, add 1 mule
                if (this.containersNearSources.length >= 2 && this.containersNearSources.every(c => this.usedCapacity(c) > 1000) && this.containersNearSpawns.length >= 1 && this.containersNearSpawns.some(c => this.freeCapacity(c) >= 1000)) {
                    wantedMules += 1
                }
            }

            if (this.creepsByRole.builder.length) {
                wantedMules += 1 // help cover the builders
            }

            return { body, max: wantedMules }
        }

        const calculateBuilder = (): { body: BodyPartConstant[], max: number } => {
            if (this.controllerLevel < 2.3 || !this.constructionSites.length) return { body: [], max: 0 }

            const energyAvailable = Math.min(500, this.energyCapacityAvailable)
            const body = buildCreepBody(energyAvailable, { move: 1, work: 1.5, carry: 0.75 }, UPGRADE_CONTROLLER_POWER, 6)
            const workPower = body.filter(p => p === WORK).length * UPGRADE_CONTROLLER_POWER
            const maxBuilders = Math.floor(12 / workPower) // max is based on workPower being below 12

            let wantedBuilders = 0

            if (
                this.energyAvailable === this.energyCapacityAvailable
                && this.constructionSites.length
                && (!this.creepsByRole.harvester || this.creepsByTask.harvest.length === this.creepsByRole.harvester.length)
                && this.sourcesActive.length >= 2
            ) {
                wantedBuilders += 1

                if (this.sourcesActive.length > 1 && this.constructionSites.length > 1 && this.creepsByTask.harvest.length < this.sourceWalkablePositionsTotal) {
                    wantedBuilders += 1
                }

                if (this.containersNearSources.filter(c => this.usedCapacity(c) > 1000).length) {
                    wantedBuilders += 1
                }
            }

            return { body, max: Math.min(maxBuilders, wantedBuilders) }
        }

        function buildCreepBody(
            energyAvailable: number,
            partsRatio: { [key in BodyPartConstant]?: number },
            workRatePerPart: number = 2,
            maxWorkRate?: number // Optional cap on WORK parts (max energy/tick)
        ): BodyPartConstant[] {
            const body: BodyPartConstant[] = []
            let remainingEnergy = energyAvailable

            // Convert ratio object into an array and filter valid parts
            const validParts = Object.entries(partsRatio) as [BodyPartConstant, number][]
            if (validParts.length === 0) return []

            // Normalize the ratios so the smallest value is 1
            const minRatio = Math.min(...validParts.map(([, ratio]) => ratio))
            const scaledRatios = validParts.map(([part, ratio]) => [part, ratio / minRatio] as [BodyPartConstant, number])

            // Calculate the cost of one full ratio set
            const unitCost = scaledRatios.reduce((sum, [part, ratio]) => sum + BODYPART_COST[part] * ratio, 0)

            // Determine how many full sets fit within available energy
            let maxFullSets = Math.floor(energyAvailable / unitCost)
            remainingEnergy -= maxFullSets * unitCost

            // Track WORK parts to respect `maxWorkRate`
            let totalWorkParts = 0
            const canAddWork = () => maxWorkRate === undefined || (totalWorkParts + 1) * workRatePerPart <= maxWorkRate

            // Add full sets while respecting max work rate
            for (let i = 0; i < maxFullSets; i++) {
                scaledRatios.forEach(([part, ratio]) => {
                    const partCount = Math.floor(ratio) // Ensure an integer amount
                    for (let j = 0; j < partCount; j++) {
                        if (part === WORK && !canAddWork()) continue // Respect maxWorkRate
                        body.push(part)
                        if (part === WORK) totalWorkParts++
                    }
                })
            }

            // Add extra parts dynamically to fill up remaining energy
            while (true) {
                let addedPart = false
                for (const [part, ratio] of scaledRatios) {
                    if (remainingEnergy >= BODYPART_COST[part] && (part !== WORK || canAddWork())) {
                        body.push(part)
                        remainingEnergy -= BODYPART_COST[part]
                        if (part === WORK) totalWorkParts++
                        addedPart = true
                    }
                }
                if (!addedPart) break // Stop if no more parts can be added
            }

            return body.sort()
        }

        const calculateClaimer = (): { body: BodyPartConstant[], max: number } => {
            if (this.controllerLevel < 3) return { body: [], max: 0 }

            const wantedRooms = Object.entries(CONFIG.rooms).filter(([roomName, room]) => {
                if (roomName === 'default') return false

                if (Game.rooms[roomName]?.controller?.my) {
                    return false
                }

                return true
            })

            if (wantedRooms.length === 0) return { body: [], max: 0 }

            this.log('manageRoles', `  - **claimer:** ${wantedRooms.map(([roomName]) => roomName).join(', ')}`)

            return {
                body: [CLAIM, MOVE, MOVE],
                max: 1
            }
        }



        this.creepsSetup.harvester = calculateHarvester()
        this.creepsSetup.upgrader = calculateUpgrader()
        this.creepsSetup.mule = calculateMule()
        this.creepsSetup.builder = calculateBuilder()
        this.creepsSetup.scout = {
            body: [MOVE, MOVE],
            max: this.controllerLevel > 3 ? 1 : 0
        }
        //this.creepsSetup.claimer = calculateClaimer()
        this.creepsSetup.defender = calculateDefender()



        this.log('manageRoles', `  - **creepsSetup:**${Object.entries(this.creepsSetup).map(([role, { body, max }]) => `\n    - **${role}** (${max}): ${body.join(', ')}`).join('')}`)
    }

    private manageCreeps() {
        this.startLogs('manageCreeps')
        this.log('manageCreeps', `#00fff4[**manageCreeps:**] total: ${this.creeps.length}`)

        this.creepCompletedActions = {}

        const spawn = this.spawns.find(s => !s.spawning && !this.freeCapacity(s))

        this.creeps.forEach(creep => {
            this.transfers[creep.id] ??= 0

            this.creepCompletedActions[creep.id] = new Set<ActionTypes>()

            // renew mules
            if (spawn && creep.role === 'mule' && creep.ticksToLive && creep.ticksToLive < 150 && !this.creeps.some(c => c.hasTaskByAction('renew')) && this.energyAvailable === this.energyCapacityAvailable) {
                const bodyParts = creep.body.map(b => b.type)
                const roleBodyParts = this.creepsSetup[creep.role as keyof typeof this.creepsSetup].body
                if (JSON.stringify(bodyParts) === JSON.stringify(roleBodyParts)) {
                    this.log('manageCreeps', `  - #00fff4[**renew:**] ${creep.name}`)
                    creep.tasks = [{
                        action: 'renew',
                        id: spawn.id,
                        persistent: true,
                    } as TaskObject]
                    return
                }
            }
        })

        // pickup resources
        this.droppedResources.forEach(resource => {
            const nearByCreeps = this.creeps
                .filter(c => this.freeCapacity(c) > 0 && c.pos.isNearToCached(resource.pos))

            for (const creep of nearByCreeps) {
                if (!this.freeCapacity(creep)) continue
                if (creep.hasTaskByAction('pickup')) continue

                this.log('manageCreeps', `  - #00fff4[**pickup:**] ${creep.name}`)

                creep.addTask({
                    id: resource.id,
                    action: 'pickup',
                    blocking: true,
                } as TaskObject, true)
                this.creepsByTask.pickup.push(creep)
            }
        })

        // harvesters transfer resources to containers near sources
        if (this.creepsByRole.mule.length > 0) {
            this.containersNearSources.forEach(container => {
                if (!this.freeCapacity(container)) return
                if (this.creepsByRole.upgrader.length === 0 && this.usedCapacity(container) >= 600) return

                const transferFactor = this.creepsByRole.mule.some(c => this.usedCapacity(c) === 0) ? 0 : 0.5

                const harvestersNearBy = this.creeps
                    .filter(c =>
                        c.role === 'harvester' &&
                        (this.usedCapacity(c) >= (c.store.getCapacity(RESOURCE_ENERGY) * transferFactor) || this.creepsByRole.mule.some(m => c.pos.getRangeToCached(m.pos) < 3)) &&
                        c.pos.isNearToCached(container.pos) &&
                        c.hasTaskByAction('harvest')
                    )

                for (const creep of harvestersNearBy) {
                    if (!this.usedCapacity(creep)) continue

                    this.log('manageCreeps', `  - #00fff4[**transfer:**] ${creep.name} to ${container.id}`)

                    creep.addTask({
                        id: container.id,
                        action: 'transfer',
                        blocking: true,
                    } as TaskObject, true)

                    this.creepsByTask.transfer.push(creep)
                }
            })
        }

        // Upgraders share resources among each other
        this.creepsByRole.upgrader.forEach(creep => {
            if (this.usedCapacity(creep) === 0 || creep.hasTaskByAction('transfer')) return

            this.log('manageCreeps', `  - **reviewing:** ${creep.name}`)

            // Find nearby upgraders
            const nearbyUpgraders = this.creepsByTask.upgrade.filter(other =>
                other.id !== creep.id && creep.pos.inRangeToCached(other.pos, 1)
            )

            this.log('manageCreeps', `  - **nearby upgraders:**`, nearbyUpgraders.map(u => u.name).join(', '))

            // Check if any nearby upgrader has excess resources
            const recipient = nearbyUpgraders.find(other => this.usedCapacity(other) > other.store.getCapacity(RESOURCE_ENERGY) * 0.5)

            if (recipient) {
                this.log('manageCreeps', `  - **donor:** ${recipient.name}`)

                recipient.tasks.push({
                    id: creep.id,
                    action: 'transfer',
                    blocking: true,
                    amount: Math.ceil(this.usedCapacity(recipient) * 0.5),
                } as TaskObject)
            }

            if (this.usedCapacity(creep) === 0 || !creep.hasTaskByAction('upgrade') || creep.hasTaskByAction('transfer') || creep.hasTaskByAction('withdraw')) return

            const containerNearBy = this.containersNearController
                .filter(c => this.usedCapacity(c) > 0 && c.pos.isNearToCached(creep.pos))
                .shift()

            if (containerNearBy) {
                this.log('manageCreeps', `    - #00ff84[**auto withdraw:**] ${containerNearBy}`)

                creep.addTask({
                    id: containerNearBy.id,
                    action: 'withdraw',
                    blocking: true,
                } as TaskObject, true)

                this.creepsByTask.withdraw.push(creep)
            }
        })

        // manage creeps
        this.creeps.forEach(creep => {
            // run the task manager
            this.manageCreepTasks(creep)
        })
    }

    private manageSpawns() {
        this.setupCreepRoles() // build the roles

        this.startLogs('manageSpawns')
        this.log('manageSpawns', `#00fff4[**manageSpawns:**] total: ${this.spawns.length}`)

        this.spawns.forEach(spawn => {
            this.log('manageSpawns', `**spawn**: ${spawn.name}`, `\n  - usedCapacity: ${spawn.store.getUsedCapacity(RESOURCE_ENERGY)}`, `\n  - spawning: ${!!spawn.spawning}`)

            if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                this.transfers[spawn.id] = 1 // spawn regens 1 energy per tick
            }

            if (spawn.spawning || this.energyAvailable < 200) {
                this.log('manageSpawns', `  - **spawning** or **usedCapacity** < 200`)
                return
            }

            const role = Object.keys(this.creepsSetup).find(role => {
                const creeps = this.creepsByRole[role]
                return creeps.length < this.creepsSetup[role as keyof typeof this.creepsSetup].max
            })

            if (role) {
                this.log('manageSpawns', `  - **role:** ${role}`)
            } else {
                this.log('manageSpawns', `  - **no roles to spawn**`)
            }

            if (!role) return

            const body = this.creepsSetup[role as keyof typeof this.creepsSetup].body
            const max = this.creepsSetup[role as keyof typeof this.creepsSetup].max

            let name = role.charAt(0).toUpperCase()
            let i = 1
            while (Game.creeps[`${name}${i}`]) {
                i++
            }

            name = `${name}${i}`

            this.log('manageSpawns', `  - **spawnCreep:** ${name}`, `\n    - **body:** ${body}`, `\n    - **max:** ${max}`)

            const result = spawn.spawnCreep(body, name, { memory: { role: role as CreepRole, room: this.room.name, tasks: [] } })

            if (result === OK) {
                const cost = body.reduce((acc, part) => acc + BODYPART_COST[part], 0)
                this.transfers[spawn.id] ??= 0
                this.transfers[spawn.id] -= cost
            } else {
                this.log('manageSpawns', `  - **spawnCreep failed:** ${result}`)
            }
        })
    }

    private manageTowers() {
        this.startLogs('manageTowers')
        this.log('manageTowers', `#00fff4[**manageTowers:**] total: ${this.towers.length}`)

        this.towers.forEach(tower => {
            if (this.usedCapacity(tower) === 0) {
                return
            }

            this.log('manageTowers', `  - **tower:** ${tower.id}`, `\n    - **freeCapacity:** ${this.freeCapacity(tower)}`, `\n    - **usedCapacity:** ${this.usedCapacity(tower)}`)

            if (this.enemies.length > 0) {
                const result = tower.attack(this.enemies[0])
                this.log('manageTowers', `  - **attack result:** ${result}`)
            } else {
                const creepsNeedHealing = this.creeps.filter(c => c.hits < c.hitsMax)
                if (creepsNeedHealing.length > 0) {
                    const result = tower.heal(creepsNeedHealing[0])
                    this.log('manageTowers', `  - **heal result:** ${result}`)
                } else if (this.usedCapacity(tower) > 800 && this.creepsByRole.mule.length > 1 && this.needsRepair.length > 0 && this.containersNearSpawns.every(c => this.usedCapacity(c) > 1900) && this.sourcesActive.length >= 2) {
                    const result = tower.repair(this.needsRepair[0])

                    if (result === OK) {
                        this.needsRepair.shift()
                    }

                    this.log('manageTowers', `  - **repair result:** ${result}`)
                }
            }
        })
    }

    private manageBuilding() {
        if (!this.config.build.enabled) return
        // if (this.room.memory.buildables && Game.time % 20 !== 0) return

        this.startLogs('manageConstruction')

        this.room.memory.buildables ??= []

        if (!this.spawn) return

        const isWalkable = (x: number, y: number): boolean => {
            // Check if coordinates are out of bounds
            if (x < 0 || x > 49 || y < 0 || y > 49) return false

            if (this.constructionSites.some(cs => cs.pos.x === x && cs.pos.y === y)) return false
            if (this.structures.some(cs => cs.pos.x === x && cs.pos.y === y)) return false

            // // Look at the specified position in the room
            // const lookResults = this.room.lookAt(x, y)

            // // Determine if the position is walkable
            // return !lookResults.some(({ type, terrain, structure, constructionSite }) => {
            //     // Check for impassable structures or terrain
            //     if (type === "structure" && structure!.structureType === STRUCTURE_RAMPART) return true
            //     if (type === "constructionSite" && constructionSite!.structureType !== 'road') return true
            //     if (type === "terrain" && terrain === "wall") return true
            //     return false
            // })

            return true
        }

        const adjacentPositions = (position: RoomPosition, distance: number = 1): RoomPosition[] => {
            const adjacentPositions: RoomPosition[] = []

            // Get all positions at exact distance
            for (let dx = -distance; dx <= distance; dx++) {
                for (let dy = -distance; dy <= distance; dy++) {
                    // filter out of bounds
                    if (position.x + dx < 0 || position.x + dx > 49 || position.y + dy < 0 || position.y + dy > 49) continue

                    // only include positions at exact distance
                    const range = Math.abs(dx) + Math.abs(dy)
                    if (range !== distance) continue

                    // filter out non-walkable positions
                    if (!isWalkable(position.x + dx, position.y + dy)) continue

                    adjacentPositions.push(new RoomPosition(position.x + dx, position.y + dy, position.roomName))
                }
            }

            return adjacentPositions
        }

        const findOptimalPosition = (position: RoomPosition, distance: number = 1): RoomPosition | undefined => {
            const optimalPosition = adjacentPositions(position, distance)
                .map((pos) => ({
                    pos,
                    visibleTiles: (() => {
                        let spots = 0

                        for (let dx = -distance; dx <= distance; dx++) {
                            for (let dy = -distance; dy <= distance; dy++) {
                                if (!isWalkable(pos.x + dx, pos.y + dy)) return 0
                                if (new RoomPosition(pos.x + dx, pos.y + dy, pos.roomName).isNearToCached(position)) {
                                    spots++
                                }
                            }
                        }

                        return spots
                    })()
                }))
                .sort((a, b) => a.visibleTiles - b.visibleTiles || position.getRangeToCached(a.pos) - position.getRangeToCached(b.pos))
                .shift()

            return optimalPosition?.pos // Return the optimal position or undefined if none found
        }

        const filterPositions = (buildable_structures: StructurePosition[]): StructurePosition[] => {
            // remove positions that are not clear
            return buildable_structures
                // remove duplicates with a higher level
                .filter((v, i, a) => a.findIndex(t => t.x === v.x && t.y === v.y && t.structure === v.structure && t.level < v.level) === -1)
                .filter((v, i, a) => a.findIndex(t => t.x === v.x && t.y === v.y && t.structure === v.structure) === i)

                // remove structures that are blocked
                .filter(({ x, y, structure }) => !this.structures.some(s => s.structureType === structure && s.pos.x === x && s.pos.y === y) || isWalkable(x, y))
        }

        const setBuildPositions = (layout: string[], center: RoomPosition, level: number): StructurePosition[] => {
            if (!layout.length) return []

            const height = layout.length
            const width = layout[0].length
            const centerY = Math.floor(height / 2)
            const centerX = Math.floor(width / 2)

            const buildable_structures: StructurePosition[] = []

            const STRUCTURE_KEY = {
                A: STRUCTURE_SPAWN,
                N: STRUCTURE_NUKER,
                K: STRUCTURE_LINK,
                L: STRUCTURE_LAB,
                E: STRUCTURE_EXTENSION,
                S: STRUCTURE_STORAGE,
                T: STRUCTURE_TOWER,
                O: STRUCTURE_OBSERVER,
                M: STRUCTURE_TERMINAL,
                P: STRUCTURE_POWER_SPAWN,
                ".": STRUCTURE_ROAD,
                C: STRUCTURE_CONTAINER,
                R: STRUCTURE_RAMPART,
                W: STRUCTURE_WALL
            }

            layout.forEach((row, y) => {
                row.split('').forEach((char, x) => {
                    const structure = STRUCTURE_KEY[char as keyof typeof STRUCTURE_KEY]
                    if (!structure || structure === STRUCTURE_SPAWN) return
                    buildable_structures.push({
                        x: center.x + (x - centerX),
                        y: center.y + (y - centerY),
                        structure,
                        level,
                    })
                })
            })

            return buildable_structures
        }

        const buildRoads = (startPos: { x: number, y: number }, endPos: { x: number, y: number }, range: number, buildableStructures: StructurePosition[]) => {
            // find a path to the source
            new RoomPosition(startPos.x, startPos.y, this.room.name)
                .findPathTo(new RoomPosition(endPos.x, endPos.y, this.room.name), {
                    range,
                    ignoreCreeps: true,
                    maxOps: 5000,
                    maxRooms: 1,
                    costCallback: (roomName, costMatrix) => {

                        for (const { x, y, structure } of buildableStructures) {
                            if (costMatrix.get(x, y) === 255) continue // skip blocked positions
                            else if (structure === STRUCTURE_ROAD) costMatrix.set(x, y, 1)
                            else if (structure === STRUCTURE_ROAD) costMatrix.set(x, y, 200) // try to avoid
                            else costMatrix.set(x, y, 255)
                        }

                        const distance = 1

                        for (const source of this.sources) {
                            for (let dx = -distance; dx <= distance; dx++) {
                                for (let dy = -distance; dy <= distance; dy++) {
                                    if (!isWalkable(source.pos.x + dx, source.pos.y + dy) || costMatrix.get(source.pos.x + dx, source.pos.y + dy) === 255) continue // skip blocked positions
                                    costMatrix.set(source.pos.x + dx, source.pos.y + dy, 100)
                                }
                            }
                        }

                        return costMatrix
                    },
                })

                .forEach(({ x, y }) => {
                    buildableStructures.push({ x: x, y, structure: STRUCTURE_ROAD, level: this.config.build.auto_build_roads_level })
                })
        }

        const findBuildables = (): StructurePosition[] => {

            const buildOrders = this.config.build.build_orders
            let buildableStructures: StructurePosition[] = []

            for (const level in buildOrders) {
                const buildPositions = setBuildPositions(buildOrders[level], this.spawn!.pos, parseFloat(level))
                this.log('manageConstruction', `#00fff4[**Buildables:**] level: ${level} buildPositions: ${buildPositions.length}`)
                buildableStructures.push(...buildPositions)
            }

            buildableStructures = filterPositions(buildableStructures)

            this.log('manageConstruction', `#00fff4[**Buildables:**] buildables: ${buildableStructures.length}`)

            if (this.config.build.auto_build_containers) {
                if (!this.constructionSites.some(cs => cs.pos.getRangeToCached(this.controller!.pos) < 6) && !this.containers.some(cs => cs.pos.getRangeToCached(this.controller!.pos) < 6)) {
                    const controllerContainerPosition = adjacentPositions(this.controller!.pos, 3)
                        .map(pos => ({
                            pos,
                            distance: (() => {
                                // find a path to the source
                                return new RoomPosition(this.spawn!.pos.x, this.spawn!.pos.y, this.room.name)
                                    .findPathTo(new RoomPosition(pos.x, pos.y, this.room.name), {
                                        range: 4,
                                        ignoreCreeps: true,
                                        maxOps: 5000,
                                        maxRooms: 1,
                                        costCallback: (roomName, costMatrix) => {
                                            this.structures
                                                .filter(s => s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER)
                                                .forEach(({ pos: { x, y } }) => {
                                                    if (costMatrix.get(x, y) === 255) return // skip blocked positions
                                                    costMatrix.set(x, y, 1)
                                                })

                                            for (const { x, y, structure } of buildableStructures) {
                                                if (costMatrix.get(x, y) === 255) return // skip blocked positions
                                                else if (structure === STRUCTURE_ROAD || structure === STRUCTURE_CONTAINER) costMatrix.set(x, y, 1)
                                                else costMatrix.set(x, y, 255)
                                            }

                                            return costMatrix
                                        },
                                    }).length
                            })()
                        }))
                        .sort((a, b) => a.distance - b.distance)
                        .shift()

                    if (controllerContainerPosition) {
                        buildableStructures.push({
                            x: controllerContainerPosition.pos.x,
                            y: controllerContainerPosition.pos.y,
                            structure: STRUCTURE_CONTAINER,
                            level: 2,
                        })

                    }
                }
            }

            // add a container near each source
            this.sources.forEach(source => {
                if (this.config.build.auto_build_containers) {
                    // look for existing containers
                    const container: StructurePosition | undefined = [
                        ...this.room
                            .lookForAtArea(LOOK_STRUCTURES, source.pos.x - 1, source.pos.y - 1, source.pos.x + 1, source.pos.y + 1, true)
                            .filter((structure) => structure.structure.structureType === STRUCTURE_CONTAINER)
                            .map(c => ({
                                x: c.x,
                                y: c.y,
                                structure: STRUCTURE_CONTAINER,
                                level: 2,
                            })),

                        ...this.containersNearSources
                            .map(c => ({
                                x: c.pos.x,
                                y: c.pos.y,
                                structure: STRUCTURE_CONTAINER,
                                level: 2,
                            })),

                        ...this.constructionSites
                            .filter((constructionSite) => constructionSite.pos.isNearToCached(source.pos))
                            .map(c => ({
                                x: c.pos.x,
                                y: c.pos.y,
                                structure: STRUCTURE_CONTAINER,
                                level: 2,
                            }))
                    ]
                        .shift()

                    if (!container) {
                        const optimalPosition = findOptimalPosition(source.pos, 1)

                        if (optimalPosition) {
                            buildableStructures.push({
                                x: optimalPosition.x,
                                y: optimalPosition.y,
                                structure: STRUCTURE_CONTAINER,
                                level: 2,
                            })
                        }
                    } else {
                        // path to spawn
                        buildRoads(source.pos, container, this.config.build.auto_build_roads_level, buildableStructures)
                    }
                }

                if (this.config.build.auto_build_roads_level > 0) {
                    buildRoads(source.pos, this.spawn!.pos, this.config.build.auto_build_roads_level, buildableStructures)

                    // find path to controller from source
                    buildRoads(source.pos, this.controller!.pos, this.config.build.auto_build_roads_level, buildableStructures)
                }
            })

            if (this.config.build.auto_build_roads_level > 0) {
                this.sources.forEach(source => {
                    const otherSources = this.sources.filter(s => s.id !== source.id)
                    otherSources.forEach(otherSource => {
                        // path to other source
                        buildRoads(source.pos, otherSource.pos, this.config.build.auto_build_roads_level, buildableStructures)
                    })
                })

                // find a path to controller
                buildRoads(this.spawn!.pos, this.controller!.pos, this.config.build.auto_build_roads_level, buildableStructures)
            }

            buildableStructures = filterPositions(buildableStructures)

            return buildableStructures
        }

        this.log('manageConstruction', `#00fff4[**Buildables:**] buildables: ${this.room.memory.buildables.length}`)

        // save to room memory
        if (!this.room.memory.buildables || Game.time % this.config.build.build_frequency === 0) {
            this.log('manageConstruction', `  - findBuildables`)

            this.room.memory.buildables = findBuildables()
                .sort((a, b) => a.level - b.level) // sort by level, top is done first
        }

        this.manageConstruction()     // create buildables
    }

    private manageConstruction() {
        if (this.constructionSites.length > this.config.build.max_constructions) return
        if (this.room.memory.buildables.length === 0) return

        const spawn = this.spawns[0]
        if (!spawn) return

        let totalConstructions = this.constructionSites.length

        this.startLogs('manageConstruction')
        this.log('manageConstruction', `#00fff4[**manageConstruction:**] totalConstructions: ${totalConstructions} buildables: ${this.room.memory.buildables.length}`)

        let i = 0

        while (this.room.memory.buildables.length > 0) {
            i++
            if (i > 10) {
                this.log('manageConstruction', `  - **manageConstruction:** too many iterations`)
                break
            }

            const buildable = this.room.memory.buildables[0]
            if (buildable.level > this.controllerLevel) break

            this.log('manageConstruction', `  - **manageConstruction:** buildable: ${buildable.structure} ${buildable.x},${buildable.y}`)

            const result = this.room.createConstructionSite(buildable.x, buildable.y, buildable.structure as BuildableStructureConstant)

            if (result === ERR_FULL || result === ERR_RCL_NOT_ENOUGH) { // too many construction sites -OR- Room Controller Level insufficient
                this.log('manageConstruction', `  - **Not enough resources to build:** ${buildable.structure}`)
                this.room.memory.buildables.shift()
            }
            else if (result === OK) {
                totalConstructions++
                this.log('manageConstruction', `  - **Built:** ${buildable.structure}`)
                this.room.memory.buildables.shift()
            }
            else if (result === ERR_NOT_ENOUGH_RESOURCES) {
                this.log('manageConstruction', `  - **Not enough resources to build:** ${buildable.structure}`)
                this.room.memory.buildables.shift()
            }
            else if (result === ERR_INVALID_TARGET) {
                this.log('manageConstruction', `  - **Invalid target:** ${buildable.structure}`)
                this.room.memory.buildables.shift()
            }
            else {
                this.log('manageConstruction', `  - **Unknown error:** ${result}`)
                this.room.memory.buildables.shift()
            }

            if (totalConstructions >= this.config.build.max_constructions) break
        }
    }

    private manageVisuals() {
        if (!CONFIG.visuals.enabled) return

        this.room.visual.text(`RT:${this.room.repairThreshold.toFixed(5)}`, 3, 23, {
            font: 0.5,
            color: '#00fff4',
            align: 'left',
        })

        this.room.visual.text(`Lvl:${this.controllerLevel.toFixed(2)}`, 3, 23.5, {
            font: 0.5,
            color: '#00fff4',
            align: 'left',
        })

        CREEP_ROLES.forEach((role, index) => {
            this.room.visual.text(`${role}:${this.creepsSetup[role].max}/${this.creepsByRole[role].length}`, 3, 24 + (index * 0.5), {
                font: 0.5,
                color: '#00fff4',
                align: 'left',
            })
        })


        if (CONFIG.visuals.show_transfers) {
            // visualize transfers
            for (const [id, amount] of Object.entries(this.transfers)) {
                const target = Game.getObjectById(id as any) as TargetTypes
                if (target && amount !== 0) {
                    this.room.visual.text(String(amount), target.pos.x, target.pos.y + 0.125, {
                        font: 0.5,
                        color: 'blue',
                    })
                }
            }
        }

        if (CONFIG.visuals.show_assignments) {
            this.structures.forEach(structure => {
                const totalAssigned = this.creeps.filter(c => c.tasks?.some(t => 'id' in t && t.id === structure.id)).length
                if (totalAssigned === 0) return

                this.room.visual.text(String(totalAssigned), structure.pos.x, structure.pos.y + 0.1, {
                    font: '0.3 bold',
                    color: 'red',
                    opacity: 0.35,
                })
            })
        }

        if (this.config.build.show_build) {
            this.room.memory.buildables ??= []

            for (const structure of this.room.memory.buildables) {
                if (structure.structure === STRUCTURE_CONTAINER) {
                    this.room.visual.circle(structure.x, structure.y, {
                        fill: 'yellow',
                        radius: 0.30,
                        stroke: 'black',
                        strokeWidth: 0.05,
                    })
                }

                this.room.visual.text(structure.structure[0], structure.x, structure.y + 0.125, {
                    font: 0.5,
                    color: 'white',
                    opacity: 0.35,
                })
            }
        }
    }

    private manageRepairThreshold() {
        if (!this.towers.filter(t => !this.freeCapacity(t)).length) return              // need towers
        if (this.sourcesActive.length < 2) return                                       // need sources
        if (this.containersNearSources.some(c => this.freeCapacity(c) > 1500)) return   // need containers

        // Base increment/decrement value
        const adjustment = 0.0001

        const aFullContainer = this.containers.some(c => !this.freeCapacity(c))

        // Example condition: Increase threshold if energy is above a certain level
        if (aFullContainer && this.energyAvailable > this.energyCapacityAvailable * 0.8) {
            this.room.repairThreshold = Math.min(0.9, this.room.repairThreshold + adjustment)
        }

        // Example condition: Decrease threshold if there are enemies
        if (this.enemies.length > 0) {
            this.room.repairThreshold = Math.max(0.1, this.room.repairThreshold - adjustment)
        }

        // Ensure threshold is within reasonable bounds
        this.room.repairThreshold = Math.min(0.9, Math.max(0.1, this.room.repairThreshold))
    }

    // debug logs
    private logs: { [key in DebugConfig]: { cpu: number, args: any[] }[] } = {
        manageSpawns: [],
        manageTowers: [],
        manageCreeps: [],
        manageConstruction: [],
        manageRefillables: [],
        manageRoles: [],
    }

    private startLogs(key: DebugConfig) {
        if (!this.config.debug.enabled) return
        this.logs[key] = []
    }

    private log(key: DebugConfig, ...args: any[]) {
        if (!this.config.debug.enabled) return

        this.logs[key].push({
            cpu: Game.cpu.getUsed(),
            args
        })
    }

    private flushLogs() {
        if (!this.config.debug.enabled) return

        Object.keys(this.logs).forEach(key => {
            if (this.config.debug.keys && !this.config.debug.keys.includes(key as DebugConfig)) return
            if (this.logs[key as DebugConfig].length === 0) return

            let output = '<div style="padding: 1rem 2rem;background-color: #1f1f1f;border-radius: 1rem;margin: 0.25rem 0;min-width: 1024px;width:100%;max-width:1024px;overflow:auto;letter-spacing:-0.04em;line-height:1.2;">'

            this.logs[key as DebugConfig]
                .forEach(({ cpu, args }, index) => {
                    if (args.length === 0) return
                    output += '<p style="margin:0;padding:0;">'

                    const previousCpu = this.logs[key as DebugConfig][index - 1]?.cpu ?? cpu
                    const cpuDiff = cpu - previousCpu

                    if (cpuDiff > 0) args.push(` #8bb2da[**cpu:** ${cpuDiff.toFixed(2)}]`)

                    args.forEach((message: any) => {
                        if (typeof message === 'object') {
                            const msg = { ...message }
                            if ('room' in msg) msg.room = undefined
                            if ('pos' in msg) msg.pos = undefined
                            if ('_owner' in msg) msg._owner = undefined
                            if ('_my' in msg) msg._my = undefined

                            // output += `<pre style='overflow:auto;max-height:100px;background:black;padding:2px;border:0;border-radius:3px;color:#d3b886;min-width:500px;margin:0;line-height:1;'><code>` +
                            output += JSON.stringify(msg, null, 2)
                                .replace(/"([^"]+)":/g, '<span style="color:rgb(252 104 104);">"$1"</span>:') // Keys in red
                                .replace(/:\s*"([^"]+)"/g, ': <span style="color:rgb(156, 211, 159);">"$1"</span>') // String values in green
                                .replace(/:\s*(\d+)/g, ': <span style="color:rgb(139, 178, 218);">$1</span>') // Numbers in blue
                                .replace(/:\s*(true|false)/g, ': <span style="color:rgb(255, 188, 87);">$1</span>') // Booleans in orange
                                .replace(/:\s*null/g, ': <span style="color: #9e9e9e;">null</span>') // Null in gray

                            // `</code></pre>`

                        } else if (typeof message === 'string') {
                            // Convert markdown-style text to HTML.
                            const formattedMessage = message
                                .replace(/#([0-9A-Fa-f]{6})\[(.*?)\]/g, '<span style="color:#$1;">$2</span>') // Custom color markdown
                                .replace(/\*\*(.*?)\*\*/g, '<strong style="font-size:13px">$1</strong>') // Bold
                                .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
                                .replace(/`(.*?)`/g, '<code>$1</code>') // Inline code
                                .replace(/##(.*?)##/g, '<span style="font-size:18px">$1</span>') // Font size

                            output += `${formattedMessage}`
                        } else {
                            try {
                                output += `${message}`
                            } catch (e) {
                                console.log(`Error formatting debug message: ${e}`)
                            }
                        }
                    })
                    output += '</p>'
                })

            output += '</div>'

            console.log(output)
        })
    }
}

export default RoomHivemind
