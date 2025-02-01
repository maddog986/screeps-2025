import { cpuLog } from 'utils/cache'
import RoomMemoryManager from './room_memory'

declare global {
    interface CreepMemory {
        role: string
        room: string
    }
}

export default class RoomSpawnManager<TContext extends Record<string, any> = {}> extends RoomMemoryManager<TContext> {
    public creeps: Creep[]
    public spawns: StructureSpawn[]

    constructor(room: Room) {
        // enable debugging for this class
        super(room)

        this.creeps = this.getContext('creeps', true)
        this.spawns = this.getContext('spawns', true)


        this.log(`**RoomSpawnManager.constructor** loaded:`, {
            creeps: this.creeps.length,
            spawns: this.spawns.length,
        })
    }

    run() {
        // continue if a spawn is not spawning
        if (this.spawns.every(spawn => spawn.spawning || spawn.store.energy < 200)) return

        // if enemies are present, spawn now
        if (this.enemies.length > 0) {
            this.room.memory.next_spawn = 0
        }
        // only allow spawning with some limits based on energy
        else if (this.room.energyAvailable !== this.room.energyCapacityAvailable && this.room.energyAvailable < 400) {
            this.room.memory.next_spawn = Game.time + this.config.spawnDelay
        }


        if (this.room.memory?.next_spawn > Game.time) {
            this.log(`**RoomSpawnManager.run** waiting to spawn in ticks: ${this.room.memory.next_spawn - Game.time}`)
            return
        }

        // loop through each spawn and spawn creeps
        this.spawnManager()
    }

    @cpuLog
    private spawnManager() {
        const roles = this.allRolesConfig()

        this.spawns.forEach(spawn => {
            if (spawn.spawning) return

            for (const role in this.config.creeps) {
                const creepConfig = roles[role]
                if (!creepConfig?.body?.length) continue

                const creeps = this.creepsByRole(role)
                if (creeps.length >= creepConfig.max) continue

                const name = this.creepName(role)
                this.log(`**Spawning** ${name} with ${creepConfig.body}`)

                const result = spawn.spawnCreep(creepConfig.body, name, { memory: { role, room: this.room.name, idle: 0 } })

                const spawnTime = creepConfig.body.length * 3 // calculate how long it will take to spawn this creep

                if (result === OK) {
                    this.room.memory.next_spawn = Game.time + spawnTime + this.config.spawnDelay
                } else {
                    this.log(`Failed to spawn ${name}: ${result}`)
                }
            }
        })
    }

    // creep body generator
    @cpuLog
    private generateBody(role: string): BodyPartConstant[] {
        const energyAvailable = Math.min(700, this.room.energyCapacityAvailable)
        const config = this.config.creeps[role]

        if (!config.body.max) return config.body.parts

        const baseBody = config.body.parts
        let body = [...baseBody]

        const cost = (bodyParts: BodyPartConstant[]) => bodyParts.reduce((sum, part) => sum + BODYPART_COST[part], 0)

        while (cost(body.concat(baseBody)) <= energyAvailable) {
            body = body.concat(baseBody)
        }

        return body
    }

    // get role configuration
    @cpuLog
    private roleConfig(role: string): { max: number; body: BodyPartConstant[] } | null {
        if (!this.config.creeps[role]) return null

        const roleConfig = this.config.creeps[role]

        const conditionsMet = roleConfig.conditions.every((cond: string) => this.evaluateExpression(cond))
        if (!conditionsMet) return null

        const max = Math.floor(Number(this.evaluateExpression(roleConfig.max)))
        const body = this.generateBody(role)

        return { max, body }
    }

    // get all roles configuration
    @cpuLog
    private allRolesConfig(): Record<string, { max: number; body: BodyPartConstant[] }> {
        return Object.keys(this.config.creeps).reduce((acc, role) => {
            const config = this.roleConfig(role)
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
}
