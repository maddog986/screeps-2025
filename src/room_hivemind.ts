import { CONFIG } from 'config'
import { get } from 'http'

export const TASK_ACTIONS = ['harvest', 'transfer', 'upgrade', 'renew', 'recycle', 'build', 'withdraw', 'pickup', 'repair', 'attack', 'move', 'scout', 'claim'] as const
export const CREEP_ROLES = ['harvester', 'upgrader', 'mule', 'defender', 'builder', 'scout', 'claimer'] as const

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
        squad?: string
    }

    interface RoomMemory {
        buildables: StructurePosition[]
        lastSeen: number
        sources: string[]
        enemies: {
            id: string
            owner: string
            lastSeen: number
            body: BodyPartConstant[]
        }[]
        sourceWalkablePositionsTotal: number
        owner: string
        threatLevel: number
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
    refillables: (Structure)[] = []
    sourceWalkablePositionsTotal: number = 0
    sources: Source[] = []
    sourcesActive: Source[] = []
    remoteSources: Source[] = []
    spawns: StructureSpawn[] = []
    structures: AnyStructure[] = []
    tombstones: Tombstone[] = []
    towers: StructureTower[] = []
    transfers: Record<string, number> = {}
    flags: Flag[] = []
    refillableHistory: number[] = []
    spawn: StructureSpawn | undefined
    containersFreeCapacity: number = 0
    containersCapacity: number = 0
    hostileStructures: StructureTower[] = []
    threatLevel: number = 0
    links: StructureLink[] = []
    linksNearSpawns: StructureLink[] = []
    linksNearController: StructureLink[] = []
    linksNearSources: StructureLink[] = []
    helpRooms: string[] = []
    wanted: boolean = false

    constructor(public room: Room) {
        this.wanted = room.name in CONFIG.rooms || room.name === 'sim'
        this.room = room
        this.config = CONFIG?.rooms[room.name] ?? CONFIG.rooms.default

        this.enemies = room.find(FIND_HOSTILE_CREEPS)
        this.sources = room.find(FIND_SOURCES)

        this.controller = room.controller as StructureController
        this.controllerLevel = this.controller ? (this.controller.level + this.controller.progress / this.controller.progressTotal) : 0
        this.energyAvailable = room.energyAvailable
        this.energyCapacityAvailable = room.energyCapacityAvailable
        this.sourcesActive = this.sources.filter((source) => source.energy > 0)
        this.sourceWalkablePositionsTotal = this.sourcesActive.reduce((acc, source) => acc + Math.min(3, source.walkablePositions), 0)

        this.creeps = Object.values(Game.creeps).filter(c => c.memory.room === room.name)
        this.creepsByRole = CREEP_ROLES.reduce((acc, role) => {
            acc[role] = this.creeps.filter((c) => c.role === role)
            return acc
        }, {} as Record<string, Creep[]>)

        this.creepsByTask = TASK_ACTIONS.reduce((acc, task) => {
            acc[task] = this.creeps.filter(c => c.hasTaskByAction(task))
            return acc
        }, {} as Record<TaskAction, Creep[]>)

        // room memory
        room.memory.lastSeen = Game.time
        room.memory.sources = this.sources.map(s => s.id)
        room.memory.enemies = this.enemies.map(e => ({
            id: e.id,
            owner: e.owner.username,
            lastSeen: Game.time,
            body: e.body.map(b => b.type)
        }))
        room.memory.sourceWalkablePositionsTotal = this.sourceWalkablePositionsTotal
        room.memory.owner = this.room.controller?.owner?.username ?? ''
        room.memory.threatLevel = this.getThreatLevel()

        this.threatLevel = room.memory.threatLevel

        if (this.wanted) {
            this.flags = this.room.find(FIND_FLAGS)
            this.structures = this.room.find(FIND_STRUCTURES)
            this.constructionSites = this.room.find(FIND_MY_CONSTRUCTION_SITES)

            for (const structure of this.structures) {
                if (structure.structureType === STRUCTURE_TOWER) {
                    if (structure.my === true) {
                        this.towers.push(structure)
                    } else {
                        this.hostileStructures.push(structure)
                    }
                }
                if (structure.structureType === STRUCTURE_EXTENSION && structure.my === true) {
                    this.extensions.push(structure)
                }
                if (structure.structureType === STRUCTURE_SPAWN && structure.my === true) {
                    this.spawns.push(structure)
                    this.spawn = structure
                }
                if (structure.structureType === STRUCTURE_CONTAINER) {
                    this.containers.push(structure)
                    if (structure.pos.getRangeToCached(this.controller!.pos) <= 7) {
                        this.containersNearController.push(structure)
                    }
                    if (structure.pos.getRangeToCached(this.spawn!.pos) <= 3) {
                        this.containersNearSpawns.push(structure)
                    }
                    if (structure.pos.getRangeToCached(this.sources[0].pos) <= 2) {
                        this.containersNearSources.push(structure)
                    }
                }
                if (structure.structureType === STRUCTURE_LINK && structure.my === true) {
                    this.links.push(structure)
                    if (structure.pos.getRangeToCached(this.controller!.pos) <= 6) {
                        this.linksNearController.push(structure)
                    }
                    if (structure.pos.getRangeToCached(this.spawn!.pos) <= 4) {
                        this.linksNearSpawns.push(structure)
                    }
                    if (structure.pos.getRangeToCached(this.sources[0].pos) <= 4) {
                        this.linksNearSources.push(structure)
                    }
                }
                if ('my' in structure && structure.my === true) {
                    this.myStructures.push(structure)
                }
                if (structure.hits / structure.hitsMax < this.room.repairThreshold || structure.hitsMax <= 5000 && structure.hits !== structure.hitsMax) {
                    this.needsRepair.push(structure)
                }
                if ('store' in structure && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                    this.refillables.push(structure)
                }
            }

            console.log('sources:', this.sources.map(s => s.id))
        }

        // owned room data
        if (this.controller && this.controller.my) {
            this.tombstones = this.room.find(FIND_TOMBSTONES)
            this.droppedResources = this.room.find(FIND_DROPPED_RESOURCES)

            this.manageCreepsSetup()
            this.manageTowers()             // attack enemies
            this.manageBuilding()           // calculate buildables
            this.manageRepairThreshold()    // adjust repair threshold
            this.manageLinks()              // manage links
            this.manageVisuals()            // visualize
            this.manageNewClaim()           // manage new claim
            this.manageSpawns()             // spawn creeps

        }

        this.manageCreeps()                 // manage creeps
    }

    maxBodyParts(bodyParts: BodyPartConstant[], limit: number = 800): BodyPartConstant[] {
        const cost = (bodyParts: BodyPartConstant[]) => bodyParts.reduce((sum, part) => sum + BODYPART_COST[part], 0)
        let body = [...bodyParts]

        while (cost(body.concat(bodyParts)) <= Math.min(limit, this.energyCapacityAvailable)) {
            body = body.concat(bodyParts)
        }

        return body
    }

    private manageCreepsSetup() {
        this.creepsSetup.harvester = {
            body: this.buildCreepBody(900, { move: 3, work: 1, carry: 2 }, HARVEST_POWER, 12),
            max: 0
        }

        this.creepsSetup.mule = {
            body: this.buildCreepBody(600, { move: 1, carry: 2 }),
            max: 0
        }

        this.creepsSetup.upgrader = {
            body: this.buildCreepBody(1200, { move: 2, work: 2, carry: 1 }, UPGRADE_CONTROLLER_POWER, 12),
            max: 0
        }

        this.creepsSetup.builder = {
            body: this.buildCreepBody(300, { move: 3, work: 1, carry: 1 }, BUILD_POWER, 4),
            max: 0
        }

        this.creepsSetup.harvester.max += 1 // this.sourceWalkablePositionsTotal

        //this.creepsSetup.mule.max += this.containersNearSources.length >= 1 ? 1 : 0
        //this.creepsSetup.mule.max += this.containersNearSpawns.length >= 1 ? 1 : 0
        //this.creepsSetup.mule.max += this.containersNearController.length >= 1 ? 1 : 0

        //this.creepsSetup.upgrader.max += this.controllerLevel >= 2.1 ? 1 : 0

        //this.creepsSetup.builder.max += this.containers.length > 0 && this.constructionSites.length >= 1 ? 1 : 0

        if (this.config.debug) this.log('manageRoles', `\n#5aff6f[##manageRoles##]`, this.creepsSetup)
    }

    private manageNewClaim() {
        if (this.controllerLevel < 4 || this.threatLevel > 0) return

        // helps newly claimed rooms construct spawn by sending harvesters
        this.helpRooms = Object.entries(CONFIG.rooms).filter(([roomName, room]) => {
            if (roomName === 'default') return false
            return true
        })
            .map(([roomName]) => roomName)
            // sort rooms by distance to current room
            .sort((a, b) => {
                const distA = Game.map.getRoomLinearDistance(this.room.name, a)
                const distB = Game.map.getRoomLinearDistance(this.room.name, b)
                return distA - distB
            })

        if (!this.helpRooms.length) return

        this.helpRooms.forEach(roomName => {
            const room = Game.rooms[roomName]
            if (!room) return

            const newRoomThreatLevel = room.manager.getThreatLevel()

            // help construct spawn by sending harvesters
            if (newRoomThreatLevel === 0) {
                const doWeOwnIt = room.controller && room.controller.my

                if (!doWeOwnIt) {
                    // get sources from remote room
                    this.remoteSources = room.manager.sources
                    console.log('remoteSources:', this.remoteSources.map(s => s.id))
                }

                if (doWeOwnIt && room.manager.constructionSites.some(cs => cs.structureType === STRUCTURE_SPAWN)) {
                    // spawn more harvesters
                    this.creepsSetup.harvester.max += 2

                    // can this room spare a harvester?
                    const canSpareHarvester = this.creepsByRole.harvester.length < this.sourceWalkablePositionsTotal * 0.4
                    const roomHasMaxHarvesters = room.manager.creepsByRole?.harvester?.length >= room.manager.sourceWalkablePositionsTotal

                    if (canSpareHarvester && !roomHasMaxHarvesters) {
                        const harvester = room.manager.creepsByRole.harvester
                            // sort by used capacity
                            .sort((a, b) => room.manager.usedCapacity(a) - room.manager.usedCapacity(b))
                            .shift()

                        // reassign harvester to help new room
                        if (harvester) {
                            harvester.drop(RESOURCE_ENERGY)
                            harvester.memory.room = room.name
                            harvester.tasks = [{
                                action: 'harvest',
                                id: room.manager.sources[0].id
                            }]
                            room.manager.creepsByRole.harvester.push(harvester)
                        }
                    }
                }
            }
        })
    }

    public getAdjacentRooms(): string[] {
        const match = this.room.name.match(/([WE])(\d+)([NS])(\d+)/)
        if (!match) return []

        const [, ew, x, ns, y] = match
        const xNum = parseInt(x, 10)
        const yNum = parseInt(y, 10)

        const adjacentRooms: string[] = []

        const directions = [
            { dx: -1, dy: 0 }, // West
            { dx: 1, dy: 0 },  // East
            { dx: 0, dy: -1 }, // South
            { dx: 0, dy: 1 },  // North
        ]

        for (const { dx, dy } of directions) {
            const newX = xNum + dx
            const newY = yNum + dy
            const newRoom = `${ew}${newX}${ns}${newY}`
            adjacentRooms.push(newRoom)
        }

        return adjacentRooms
    }

    public getUnseenAdjacentRooms(): string[] {
        return this.getAdjacentRooms().filter(room => !Game.rooms[room])
    }

    public getUnseenRoomsIfStale(): string[] {
        return this.getAdjacentRooms().filter(room => {
            // Check if the room is not visible
            if (!Game.rooms[room]) return true

            // If visible, check the memory for last visit time
            const lastVisited = Game.rooms[room].memory.lastSeen || 0
            const threatLevel = Game.rooms[room].memory.threatLevel || 0

            return (Game.time - lastVisited) >= (threatLevel > 1 ? 300 : 150)
        })
    }

    public getThreatLevel(): number {
        const hostiles = this.room.find(FIND_HOSTILE_CREEPS)
        const hostileStructures = this.room.find(FIND_HOSTILE_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_TOWER
        })

        if (this.controller?.owner && !this.controller.my) {
            return 4 // Enemy-controlled room
        }

        if (hostileStructures.length > 0) {
            return 3 // Enemy towers detected
        }

        if (hostiles.length > 0) {
            const hasAttackParts = hostiles.some(c => c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0)
            const hasHealParts = hostiles.some(c => c.getActiveBodyparts(HEAL) > 0)

            if (hasAttackParts || hasHealParts) {
                return 2 // Armed hostile creeps detected
            }

            return 1 // Unarmed hostile creeps detected
        }

        return 0 // No threats detected
    }

    public usedCapacity(target: TargetTypes | undefined) {
        if (!target) return 0

        if (target instanceof Creep && target.store[RESOURCE_ENERGY] === null) {
            return 0
        }

        this.transfers[target.id] ??= 0

        if (target instanceof Resource) {
            return target.amount + this.transfers[target.id]
        }

        if ('store' in target) {
            return (target.store.getUsedCapacity(RESOURCE_ENERGY) ?? target.store.getUsedCapacity() ?? 0) + this.transfers[target.id]
        }

        if ('energy' in target) {
            return Math.min(target.energyCapacity, target.energy + this.transfers[target.id])
        }

        return 0
    }

    public freeCapacity(target: TargetTypes | undefined) {
        if (!target) return 0

        if (target instanceof Creep && target.store[RESOURCE_ENERGY] === null) {
            return 0
        }

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
            return 0
        }

        return 0
    }

    public getCapacity(target: TargetTypes | undefined): number {
        if (!target) return 0

        if (target instanceof Creep && target.store[RESOURCE_ENERGY] === null) {
            return 0
        }

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

    private buildCreepBody(
        energyAvailable: number,
        partsRatio: { [key in BodyPartConstant]?: number },
        workRatePerPart: number = 2,
        maxWorkRate?: number // Optional cap on WORK parts (max energy/tick)
    ): BodyPartConstant[] {
        const body: BodyPartConstant[] = []

        energyAvailable = Math.min(this.energyCapacityAvailable, energyAvailable)

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

    assignedToHarvest(): Creep[] {
        return this.creeps.filter(c => c.hasTaskByAction('harvest'))
    }

    assignedToUpgrade(): Creep[] {
        return this.creeps.filter(c => c.hasTaskByAction('upgrade'))
    }

    private manageCreeps() {
        if (this.config.debug) this.startLogs('manageCreeps')
        if (this.config.debug) this.log('manageCreeps', `#00fff4[**manageCreeps:**] total: ${this.creeps.length}`)

        const totalMules = this.creepsByRole.mule.filter(c => !c.spawning).length

        // pickup resources
        for (const resource of this.droppedResources) {
            if (this.usedCapacity(resource) === 0) continue

            const nearByCreeps = this.creeps
                .filter(c => this.freeCapacity(c) > 0 && c.pos.isNearToCached(resource.pos) && !c.hasTaskByAction('pickup') && !c.hasTaskByAction('withdraw'))

            for (const creep of nearByCreeps) {
                if (this.freeCapacity(creep) === 0 || this.usedCapacity(resource) === 0) break
                if (this.config.debug) this.log('manageCreeps', `  - #00fff4[**pickup:**] ${creep.name}`)

                creep.addTask({
                    id: resource.id,
                    action: 'pickup',
                    blocking: true,
                } as TaskObject, true)
            }
        }

        // withdraw resources
        for (const tombstone of this.tombstones) {
            if (this.usedCapacity(tombstone) === 0) continue

            const nearByCreeps = this.creeps
                .filter(c => this.freeCapacity(c) > 0 && c.pos.isNearToCached(tombstone.pos) && !c.hasTaskByAction('withdraw') && !c.hasTaskByAction('transfer') && !c.hasTaskByAction('pickup'))

            for (const creep of nearByCreeps) {
                if (this.freeCapacity(creep) === 0 || this.usedCapacity(tombstone) === 0) break
                if (this.config.debug) this.log('manageCreeps', `  - #00fff4[**withdraw:**] ${creep.name}`)

                creep.addTask({
                    id: tombstone.id,
                    action: 'withdraw',
                    blocking: true,
                } as TaskObject, true)
            }
        }

        // harvesters
        for (const creep of this.creepsByRole.harvester) {
            if (!creep.hasTaskByAction('upgrade')) continue

            const isHarvesting = this.assignedToHarvest().includes(creep)

            // harvesters transfer energy to links
            if (isHarvesting && creep.store.getUsedCapacity(RESOURCE_ENERGY) > creep.workPower('harvest') * 3) {
                const linkNearBy = this.linksNearSources.find(l => l.pos.isNearToCached(creep.pos))
                if (linkNearBy) {
                    if (this.config.debug) this.log('manageCreeps', `  - **linkNearBy:** ${linkNearBy}`)

                    creep.addTask({
                        id: linkNearBy.id,
                        action: 'transfer',
                        blocking: true,
                    } as TaskObject, true)

                    continue
                }
            }

            // if more than half full, or over 50 energy, retask to harvesting
            if (isHarvesting && (this.usedCapacity(creep) > this.getCapacity(creep) * 0.5 || this.usedCapacity(creep) > 50)) {
                const source = this.sources.find(s =>
                    (s.energy > 0 || s.ticksToRegeneration < creep.pos.getRangeToCached(s.pos)) // has energy or is about to regenerate
                    && s.walkablePositions > this.creepsByRole.harvester.filter(c => c.hasTask('harvest', s.id)).length // has enough walkable positions
                )
                if (!source) continue

                if (this.config.debug) this.log('manageCreeps', `  - **retasking to harvesting:** ${creep.name}`)

                creep.tasks = []
                creep.addTask({
                    id: source.id,
                    action: 'harvest',
                } as TaskObject)

                continue
            }
        }

        // Upgraders share resources among each other
        for (const creep of this.creepsByRole.upgrader) {
            const isUpgrading = this.assignedToUpgrade().includes(creep)
            if (!isUpgrading) continue

            if (this.config.debug) this.log('manageCreeps', `  - **reviewing:** ${creep.name}`)

            // check if there is a container near by
            const containerNearBy = this.containersNearController
                .filter(c => this.usedCapacity(c) > 0 && c.pos.isNearToCached(creep.pos))
                .shift()

            if (containerNearBy) {
                if (this.config.debug) this.log('manageCreeps', `    - #00ff84[**auto withdraw:**] ${containerNearBy}`)

                creep.addTask({
                    id: containerNearBy.id,
                    action: 'withdraw',
                    blocking: true,
                } as TaskObject, true)

                continue
            }

            // Find nearby upgraders
            const recipient = this.creepsByTask.upgrade.find(other =>
                other.id !== creep.id &&
                creep.pos.inRangeToCached(other.pos, 1) &&
                other.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            )

            if (this.config.debug) this.log('manageCreeps', `  - **nearby upgraders:** ${recipient}`)

            if (recipient) {
                if (this.config.debug) this.log('manageCreeps', `  - **donor:** ${recipient.name}`)

                recipient.tasks.push({
                    id: creep.id,
                    action: 'transfer',
                    blocking: true,
                    amount: Math.floor(this.usedCapacity(creep) * 0.45),
                } as TaskObject)

                continue
            }
        }
    }

    private manageSpawns() {
        if (this.config.debug) this.startLogs('manageSpawns')
        if (this.config.debug) this.log('manageSpawns', `#00fff4[**manageSpawns:**] total: ${this.spawns.length}`)

        for (const spawn of this.spawns) {
            if (this.config.debug) this.log('manageSpawns', `**spawn**: ${spawn.name}`, `\n  - usedCapacity: ${spawn.store.getUsedCapacity(RESOURCE_ENERGY)}`, `\n  - spawning: ${!!spawn.spawning}`)

            if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                this.transfers[spawn.id] = 1 // spawn regens 1 energy per tick
            }

            if (spawn.spawning || this.energyAvailable < 200) {
                if (this.config.debug) this.log('manageSpawns', `  - **spawning** or **usedCapacity** < 200`)
                return
            }

            const role = CREEP_ROLES.find(role => {
                const creeps = this.creepsByRole[role]
                return creeps.length < this.creepsSetup[role as keyof typeof this.creepsSetup].max
            })
            if (this.config.debug) this.log('manageSpawns', `  - **role:** ${role ? role : 'no roles to spawn'}`)
            if (!role) return

            const body = this.creepsSetup[role as keyof typeof this.creepsSetup].body
            const max = this.creepsSetup[role as keyof typeof this.creepsSetup].max

            let name = role.charAt(0).toUpperCase()
            let i = 1
            while (Game.creeps[`${name}${i}`]) {
                i++
            }

            name = `${name}${i}`

            if (this.config.debug) this.log('manageSpawns', `  - **spawnCreep:** ${name}`, `\n    - **body:** ${body}`, `\n    - **max:** ${max}`)

            const result = spawn.spawnCreep(body, name, { memory: { role: role as CreepRole, room: this.room.name, tasks: [] } })

            if (result === OK) {
                const cost = body.reduce((acc, part) => acc + BODYPART_COST[part], 0)
                this.transfers[spawn.id] ??= 0
                this.transfers[spawn.id] -= cost
            } else {
                if (this.config.debug) this.log('manageSpawns', `  - **spawnCreep failed:** ${result}`)
            }
        }
    }

    private manageTowers() {
        if (this.config.debug) this.startLogs('manageTowers')
        if (this.config.debug) this.log('manageTowers', `#00fff4[**manageTowers:**] total: ${this.towers.length}`)

        this.towers.forEach(tower => {
            if (this.usedCapacity(tower) === 0) {
                return
            }

            if (this.config.debug) this.log('manageTowers', `  - **tower:** ${tower.id}`, `\n    - **freeCapacity:** ${this.freeCapacity(tower)}`, `\n    - **usedCapacity:** ${this.usedCapacity(tower)}`)

            if (this.enemies.length > 0) {
                const result = tower.attack(this.enemies[0])
                if (this.config.debug) this.log('manageTowers', `  - **attack result:** ${result}`)
            } else {
                const creepsNeedHealing = this.creeps.filter(c => c.hits < c.hitsMax)
                if (creepsNeedHealing.length > 0) {
                    const result = tower.heal(creepsNeedHealing[0])
                    if (this.config.debug) this.log('manageTowers', `  - **heal result:** ${result}`)
                } else if (
                    this.usedCapacity(tower) > 800
                    && this.creepsByRole.mule.length > 1
                    && this.needsRepair.length > 0
                    && this.containersNearSources.every(c => this.usedCapacity(c) > 1000)
                    && this.sourcesActive.length >= 2
                ) {
                    const result = tower.repair(this.needsRepair[0])

                    if (result === OK) {
                        this.needsRepair.shift()
                    }

                    if (this.config.debug) this.log('manageTowers', `  - **repair result:** ${result}`)
                }
            }
        })
    }

    private manageLinks() {
        if (this.config.debug) this.startLogs('manageLinks')
        if (this.config.debug) this.log('manageLinks', `#00fff4[**manageLinks:**] total: ${this.links.length}`)

        // this.links.forEach(link => {
        //     if (this.config.debug) this.log('manageLinks', `  - **link:** ${link.id}`, `\n    - **freeCapacity:** ${this.freeCapacity(link)}`, `\n    - **usedCapacity:** ${this.usedCapacity(link)}`)
        // })

        this.linksNearSources.forEach(link => {
            if (this.config.debug) this.log('manageLinks', `  - **link:** ${link.id}`, `\n    - **freeCapacity:** ${this.freeCapacity(link)}`, `\n    - **usedCapacity:** ${this.usedCapacity(link)}`)

            if (link.cooldown > 0) return

            // First try to find a link near spawns that needs energy
            let targetLink = this.linksNearSpawns
                .filter(l => !l.cooldown && this.freeCapacity(l) > 10)
                .sort((a, b) => this.freeCapacity(b) - this.freeCapacity(a))
                .shift()

            // If no spawn links need energy, try controller links
            if (!targetLink) {
                targetLink = this.linksNearController
                    .filter(l => !l.cooldown && this.freeCapacity(l) > 10)
                    .sort((a, b) => this.freeCapacity(b) - this.freeCapacity(a))
                    .shift()
            }

            if (targetLink) {
                const result = link.transferEnergy(targetLink)
                if (this.config.debug) this.log('manageLinks', `  - **transfer result:** ${result}`)
            }
        })
    }

    private manageBuilding() {
        if (!this.config.build) return
        if (this.room.memory.buildables && Game.time % this.config.build.build_frequency !== 0) return
        if (!this.spawn) return

        if (this.config.debug) this.startLogs('manageConstruction')

        this.room.memory.buildables ??= []

        const controllerPos = this.controller!.pos

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

        const isWalkable = (x: number, y: number): boolean => {
            // Check if coordinates are out of bounds
            if (x < 0 || x > 49 || y < 0 || y > 49) return false

            if (this.constructionSites.some(cs => cs.pos.x === x && cs.pos.y === y)) return false
            if (this.structures.some(cs => cs.pos.x === x && cs.pos.y === y)) return false

            // Look at the specified position in the room
            const lookResults = this.room.lookAt(x, y)

            // Determine if the position is walkable
            return !lookResults.some(({ type, terrain, structure, constructionSite }) => {
                // Check for impassable structures or terrain
                if (type === "structure" && structure!.structureType === STRUCTURE_RAMPART) return true
                if (type === "constructionSite" && constructionSite!.structureType !== 'road') return true
                if (type === "terrain" && terrain === "wall") return true
                return false
            })

            return true
        }

        const findOptimalPlacement = (
            start: RoomPosition,
            targets: RoomPosition[],
            range: number
        ): RoomPosition | null => {
            const candidates: RoomPosition[] = []

            // Generate all positions around the start within the given range
            for (let dx = -range; dx <= range; dx++) {
                for (let dy = -range; dy <= range; dy++) {
                    if (dx === 0 && dy === 0) continue // Skip the original position
                    // is walkable?
                    if (!isWalkable(start.x + dx, start.y + dy)) continue

                    const pos = new RoomPosition(start.x + dx, start.y + dy, start.roomName)
                    candidates.push(pos)
                }
            }

            let bestPosition: RoomPosition | null = null
            let bestTotalCost = Infinity

            for (const pos of candidates) {
                let totalPathCost = 0
                let valid = true

                for (const target of targets) {
                    const path = PathFinder.search(pos, { pos: target, range: 1 })

                    if (path.incomplete) {
                        valid = false
                        break // Skip this candidate if it can't reach a target
                    }

                    totalPathCost += path.cost
                }

                if (valid && totalPathCost < bestTotalCost) {
                    bestTotalCost = totalPathCost
                    bestPosition = pos
                }
            }

            return bestPosition
        }

        const filterPositions = (buildable_structures: StructurePosition[]): StructurePosition[] =>
            // remove positions that are not clear
            buildable_structures
                // remove duplicates with a higher level
                .filter((v, i, a) => a.findIndex(t => t.x === v.x && t.y === v.y && t.structure === v.structure && t.level < v.level) === -1)
                .filter((v, i, a) => a.findIndex(t => t.x === v.x && t.y === v.y && t.structure === v.structure) === i)

                // remove structures that are blocked
                .filter(({ x, y, structure }) => isWalkable(x, y))

        const planRoads = (
            start: RoomPosition,
            targets: RoomPosition[],
            plannedStructures: StructurePosition[]
        ): RoomPosition[] => {
            const roadPositions: Set<string> = new Set()
            const structureMap = new Map<string, StructurePosition>()

            // Convert planned structures to a Map for quick lookups
            for (const structure of plannedStructures) {
                structureMap.set(`${structure.x},${structure.y},${start.roomName}`, structure)
            }

            for (const target of targets) {
                const path = PathFinder.search(start, { pos: target, range: target.isEqualTo(controllerPos) ? 3 : 1 }, {
                    plainCost: 5,
                    swampCost: 5,
                    roomCallback: (roomName) => {
                        const room = Game.rooms[roomName]
                        if (!room) return false

                        const costs = new PathFinder.CostMatrix()

                        // Consider existing structures
                        this.structures.forEach(struct => {
                            if (struct.structureType === STRUCTURE_ROAD) {
                                costs.set(struct.pos.x, struct.pos.y, 1) // Prefer roads
                            } else if (struct.structureType !== STRUCTURE_CONTAINER && struct.structureType !== STRUCTURE_RAMPART) {
                                costs.set(struct.pos.x, struct.pos.y, 255) // Avoid placing roads where structures exist
                            }
                        })

                        // Consider planned structures
                        for (const { x, y, structure } of plannedStructures) {
                            if (structure === STRUCTURE_ROAD) {
                                costs.set(x, y, 1) // Encourage roads
                            } else if (structure !== STRUCTURE_CONTAINER && structure !== STRUCTURE_RAMPART) {
                                costs.set(x, y, 255) // Avoid placing roads where structures exist
                            }
                        }

                        return costs
                    }
                })

                for (const step of path.path) {
                    const key = `${step.x},${step.y},${step.roomName}`
                    if (!structureMap.has(key)) {
                        roadPositions.add(key)
                    }
                }
            }

            return Array.from(roadPositions).map(pos => {
                const [x, y, roomName] = pos.split(",")
                return new RoomPosition(parseInt(x, 10), parseInt(y, 10), roomName)
            })
        }


        const buildOrders = this.config.build.build_orders
        let buildableStructures: StructurePosition[] = []

        for (const level in buildOrders) {
            const buildPositions = setBuildPositions(buildOrders[level], this.spawn!.pos, parseFloat(level))
            if (this.config.debug) this.log('manageConstruction', `#00fff4[**Buildables:**] level: ${level} buildPositions: ${buildPositions.length}`)
            buildableStructures.push(...buildPositions)
        }

        buildableStructures = filterPositions(buildableStructures)

        // add a container near each source
        const containerPositions: RoomPosition[] = [...this.sources.map(s => s.pos), controllerPos]
        const targetPositions: RoomPosition[] = [...this.spawns.map(s => s.pos), ...this.sources.map(s => s.pos)]

        containerPositions.forEach(position => {
            const optimalPosition = findOptimalPlacement(position, [...targetPositions, controllerPos], position.isEqualTo(controllerPos) ? 3 : 1)

            if (optimalPosition) {
                if (this.containers.some(c => c.pos.getRangeTo(optimalPosition) <= 2)) return
                if (this.constructionSites.some(cs => cs.pos.getRangeTo(optimalPosition) <= 2)) return

                buildableStructures.push({
                    x: optimalPosition.x,
                    y: optimalPosition.y,
                    structure: STRUCTURE_CONTAINER,
                    level: this.config.build!.auto_build_containers,
                })
            }
        })

        buildableStructures = filterPositions(buildableStructures)

        const containerNearController = buildableStructures.find(b => b.structure === STRUCTURE_CONTAINER && new RoomPosition(b.x, b.y, this.room.name).getRangeTo(controllerPos) <= 3)
        if (containerNearController) {
            targetPositions.push(new RoomPosition(containerNearController.x, containerNearController.y, this.room.name))
        }

        // find a path from spawn to each target
        const roadPositions = planRoads(this.spawn!.pos, targetPositions, buildableStructures)
        roadPositions.forEach(position => {
            buildableStructures.push({
                x: position.x,
                y: position.y,
                structure: STRUCTURE_ROAD,
                level: this.config.build!.auto_build_roads_level,
            })
        })

        buildableStructures = filterPositions(buildableStructures)
            .sort((a, b) => a.level - b.level) // sort by level, top is done first

        if (this.config.debug) this.log('manageConstruction', `#00fff4[**Buildables:**] buildables: ${this.room.memory.buildables.length}`)

        this.room.memory.buildables = buildableStructures

        this.manageConstruction()     // create buildables
    }

    private manageConstruction() {
        if (!this.config.build || this.constructionSites.length > this.config.build.max_constructions) return
        if (this.room.memory.buildables.length === 0) return

        const spawn = this.spawns[0]
        if (!spawn) return

        let totalConstructions = this.constructionSites.length

        if (this.config.debug) this.startLogs('manageConstruction')
        if (this.config.debug) this.log('manageConstruction', `#00fff4[**manageConstruction:**] totalConstructions: ${totalConstructions} buildables: ${this.room.memory.buildables.length}`)

        let i = 0

        while (this.room.memory.buildables.length > 0) {
            i++
            if (i > 10) {
                if (this.config.debug) this.log('manageConstruction', `  - **manageConstruction:** too many iterations`)
                break
            }

            const buildable = this.room.memory.buildables[0]
            if (buildable.level > this.controllerLevel) break

            if (this.config.debug) this.log('manageConstruction', `  - **manageConstruction:** buildable: ${buildable.structure} ${buildable.x},${buildable.y}`)

            const result = this.room.createConstructionSite(buildable.x, buildable.y, buildable.structure as BuildableStructureConstant)

            if (result === ERR_FULL || result === ERR_RCL_NOT_ENOUGH) { // too many construction sites -OR- Room Controller Level insufficient
                if (this.config.debug) this.log('manageConstruction', `  - **Not enough resources to build:** ${buildable.structure}`)
                this.room.memory.buildables.shift()
            }
            else if (result === OK) {
                totalConstructions++
                if (this.config.debug) this.log('manageConstruction', `  - **Built:** ${buildable.structure}`)
                this.room.memory.buildables.shift()
            }
            else if (result === ERR_NOT_ENOUGH_RESOURCES) {
                if (this.config.debug) this.log('manageConstruction', `  - **Not enough resources to build:** ${buildable.structure}`)
                this.room.memory.buildables.shift()
            }
            else if (result === ERR_INVALID_TARGET) {
                if (this.config.debug) this.log('manageConstruction', `  - **Invalid target:** ${buildable.structure}`)
                this.room.memory.buildables.shift()
            }
            else {
                if (this.config.debug) this.log('manageConstruction', `  - **Unknown error:** ${result}`)
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

        if (this.config.build?.show_build) {
            this.room.memory.buildables ??= []

            for (const structure of this.room.memory.buildables) {
                if (structure.structure === STRUCTURE_CONTAINER) {
                    this.room.visual.rect(structure.x - 0.3, structure.y - 0.3, 0.6, 0.6, {
                        fill: 'yellow',
                        opacity: 0.35,
                        stroke: 'black',
                        strokeWidth: 0.05,
                    })

                } else if (structure.structure === STRUCTURE_ROAD) {
                    this.room.visual.circle(structure.x, structure.y, {
                        fill: 'white',
                        radius: 0.20,
                        opacity: 0.35,
                    })

                } else if (structure.structure === STRUCTURE_EXTENSION) {
                    this.room.visual.circle(structure.x, structure.y, {
                        fill: 'yellow',
                        radius: 0.30,
                        opacity: 0.20,
                        stroke: 'black',
                        strokeWidth: 0.05,
                    })

                } else {
                    this.room.visual.rect(structure.x - 0.3, structure.y - 0.3, 0.6, 0.6, {
                        fill: 'white',
                        opacity: 0.35,
                    })
                }

                if (this.config.build.show_build_levels) {
                    this.room.visual.text(structure.level.toString(), structure.x, structure.y + 0.15, {
                        font: 0.35,
                        color: 'yellow',
                        opacity: 0.35,
                    })
                } else {
                    this.room.visual.text(structure.structure[0], structure.x, structure.y + 0.125, {
                        font: 0.5,
                        color: 'white',
                        opacity: 0.35,
                    })
                }
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
        if (this.threatLevel > 0) {
            this.room.repairThreshold = Math.max(0.2, this.room.repairThreshold - (adjustment * 2))
        }

        // Ensure threshold is within reasonable bounds
        this.room.repairThreshold = Math.min(0.9, Math.max(0.2, this.room.repairThreshold))
    }

    public isNearSource(target: TargetTypes): boolean {
        if (target instanceof StructureLink) return this.linksNearSources.some(l => l.id === target.id)
        if (target instanceof StructureContainer) return this.containersNearSources.some(c => c.id === target.id)
        if (this.sources.some(s => target.pos.getRangeToCached(s.pos) <= 6)) return true
        return false
    }

    public isNearSpawn(target: TargetTypes): boolean {
        if (target instanceof StructureLink) return this.linksNearSpawns.some(l => l.id === target.id)
        if (target instanceof StructureContainer) return this.containersNearSpawns.some(c => c.id === target.id)
        if (this.spawns.some(s => target.pos.getRangeToCached(s.pos) <= 6)) return true
        return false
    }

    public isNearController(target: TargetTypes): boolean {
        if (target instanceof StructureLink) return this.linksNearController.some(l => l.id === target.id)
        if (target instanceof StructureContainer) return this.containersNearController.some(c => c.id === target.id)
        if (this.controller && target.pos.getRangeToCached(this.controller.pos) <= 6) return true
        return false
    }

    // debug logs
    private logs: { [key in DebugConfig]: { cpu: number, args: any[] }[] } = {
        manageSpawns: [],
        manageTowers: [],
        manageCreeps: [],
        manageConstruction: [],
        manageRoles: [],
        manageLinks: [],
    }

    public startLogs(key: DebugConfig) {
        if (!this.config.debug) return
        this.logs[key] = []
    }

    public log(key: DebugConfig, ...args: any[]) {
        if (!this.config.debug) return

        this.logs[key].push({
            cpu: Game.cpu.getUsed(),
            args
        })
    }

    public flushLogs() {
        if (!this.config.debug) return

        Object.keys(this.logs).forEach(key => {
            if (this.config.debug && !this.config.debug.includes(key as DebugConfig)) return
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
