import { CONFIG } from 'config'

class RoomHivemind {
    config: RoomConfig

    controller: StructureController | undefined
    controllerLevel: number
    energyAvailable: number
    energyCapacityAvailable: number
    sources: Source[]
    sourcesActive: Source[]
    structures: AnyStructure[]
    myStructures: AnyStructure[]
    constructionSites: ConstructionSite[]
    droppedResources: Resource[]
    enemies: Creep[]
    spawns: StructureSpawn[]
    tombstones: Tombstone[]
    towers: StructureTower[]
    needsRepair: AnyStructure[]
    creeps: Creep[]
    creepsByRole: Record<string, Creep[]>

    constructor(public room: Room) {
        this.room = room
        this.config = CONFIG?.rooms[room.name] ?? CONFIG.rooms.default

        this.controller = room.controller
        this.controllerLevel = room.controller ? (room.controller.level + room.controller.progress / room.controller.progressTotal) : 0

        this.energyAvailable = room.energyAvailable
        this.energyCapacityAvailable = room.energyCapacityAvailable

        this.sources = room.find(FIND_SOURCES)
        this.sourcesActive = this.sources.filter((source) => source.energy > 0)
        this.structures = room.find(FIND_STRUCTURES)
        this.myStructures = room.find(FIND_MY_STRUCTURES)
        this.constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES)
        this.droppedResources = room.find(FIND_DROPPED_RESOURCES)
        this.enemies = room.find(FIND_HOSTILE_CREEPS)
        this.spawns = room.find(FIND_MY_SPAWNS)
        this.tombstones = room.find(FIND_TOMBSTONES)
        this.towers = this.myStructures.filter((structure) => structure.structureType === STRUCTURE_TOWER)
        this.needsRepair = this.structures.filter((structure) => structure.hits < structure.hitsMax)
        this.creeps = room.find(FIND_MY_CREEPS)

        this.creepsByRole = this.creeps.reduce((acc, creep) => {
            acc[creep.memory.role] = this.creeps.filter((c) => c.memory.role === creep.memory.role)
            return acc
        }, {} as Record<string, Creep[]>)

        this.manageSpawns()
        this.manageTowers()
    }

    get memory() {
        return this.room.memory
    }

    set memory(value: Record<string, any>) {
        this.room.memory = value as RoomMemory
    }

    manageSpawns() {
        this.spawns.forEach(spawn => {
            if (spawn.spawning) return
            if (spawn.store.getUsedCapacity(RESOURCE_ENERGY) < 300) return

            const creepsSetup: Record<string, { body: BodyPartConstant[]; max: number }> = {}

            creepsSetup.defender = {
                body: [TOUGH, ATTACK, MOVE],
                max: this.enemies.length,
            }

            creepsSetup.harvester = {
                body: [WORK, CARRY, MOVE],
                max: 6,
            }

            creepsSetup.builder = {
                body: [WORK, CARRY, MOVE],
                max: this.constructionSites.length > 0 ? 1 : 0,
            }

            const role = Object.keys(creepsSetup).find(role => {
                const creeps = this.creepsByRole[role]
                return creeps.length < creepsSetup[role as keyof typeof creepsSetup].max
            })

            if (!role) return

            const body = creepsSetup[role as keyof typeof creepsSetup].body
            const max = creepsSetup[role as keyof typeof creepsSetup].max

            let name = role.charAt(0).toUpperCase()
            let i = 1
            do {
                name = `${name}${i}`
                i++
            } while (Game.creeps[name])

            spawn.spawnCreep(body, name, { memory: { role, idle: 0, room: this.room.name } })
        })
    }

    manageTowers() {
        this.towers.forEach(tower => {
            if (tower.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return

            tower.attack(this.enemies[0])
        })
    }

}

export default RoomHivemind
