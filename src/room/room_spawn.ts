import { CONFIG } from 'config'
import BaseClass from 'utils/base_class'
import ContextBuilder from 'utils/context_builder'

declare global {
    interface CreepMemory {
        role: string
    }
}

export default class RoomSpawnManager extends BaseClass {
    config: RoomConfig
    creeps: Creep[]
    spawns: StructureSpawn[]

    constructor(room: Room) {
        // enable debugging for this class
        super(room)

        this.config = CONFIG.rooms[room.name]
        this.creeps = this.getContext('creeps')
        this.spawns = this.getContext('spawns')

        this.log(`**context loaded**:`, {
            config: !!this.config,
            creeps: this.creeps.length,
            spawns: this.spawns.length,
        })

        // set some extra context
        this.setContext('roomName', room.name)
    }

    run() {
        super.run()

        // continue if a spawn is not spawning
        if (this.spawns.every(spawn => spawn.spawning || spawn.store.energy < 200)) return

        const roleConfig = this.allRolesConfig(this.room)
        this.log(`**Creep Loadouts** all creep loadouts:`, roleConfig)

        // loop through each spawn and spawn creeps
        this.spawns.forEach(spawn => {
            if (spawn.spawning) return

            for (const role in this.config.creeps) {
                const creepConfig = roleConfig[role]
                if (!creepConfig || !creepConfig.body || !creepConfig.body.length) continue

                const creeps = this.creepsByRole(role)
                if (creeps.length >= creepConfig.max) continue

                const name = this.creepName(role)

                this.log(`**Spawning** ${name} with ${creepConfig.body}`)

                const result = spawn.spawnCreep(creepConfig.body, name, { memory: { role } })

                if (result !== OK) {
                    this.log(`Failed to spawn ${name}: ${result}`)
                }
            }
        })
    }

    // creep body generator
    private generateBody(room: Room, role: string): BodyPartConstant[] {
        const energyAvailable = Math.min(700, room.energyCapacityAvailable)
        const config = this.config.creeps[role]

        const baseBody = config.body
        let body = [...config.body]

        const cost = (bodyParts: BodyPartConstant[]) => bodyParts.reduce((sum, part) => sum + BODYPART_COST[part], 0)

        while (cost(body.concat(baseBody)) <= energyAvailable) {
            body = body.concat(baseBody)
        }

        return body
    }

    // get role configuration
    private roleConfig(role: string, room: Room): { max: number; body: BodyPartConstant[] } | null {
        const roomConfig = CONFIG.rooms[room.name]
        if (!roomConfig || !roomConfig.creeps[role]) return null

        const roleConfig = roomConfig.creeps[role]
        const contextBuilder = new ContextBuilder(room)

        const conditionsMet = roleConfig.conditions.every((cond: string) => contextBuilder.evaluateExpression(cond))
        if (!conditionsMet) return null

        const max = contextBuilder.evaluateExpression(roleConfig.max)
        const body = this.generateBody(room, role)

        return { max, body }
    }

    // get all roles configuration
    private allRolesConfig(room: Room): Record<string, { max: number; body: BodyPartConstant[] }> {
        const roomConfig = CONFIG.rooms[room.name]
        if (!roomConfig) return {}

        const roles = Object.keys(roomConfig.creeps)
        return roles.reduce((acc, role) => {
            const config = this.roleConfig(role, room)
            if (config) acc[role] = config
            return acc
        }, {} as Record<string, { max: number; body: BodyPartConstant[] }>)
    }

    // find a unique name for a creep
    private creepName(role: string): string {
        let name = role.slice(0, 1).toUpperCase()
        let i = 1

        while (!!Game.creeps[`${name}${i}`]) {
            i++
        }

        return `${name}${i}`
    }

    // helper function to get creeps by role
    private creepsByRole(role: string): Creep[] {
        return this.creeps.filter(creep => creep.memory.role === role)
    }
}
