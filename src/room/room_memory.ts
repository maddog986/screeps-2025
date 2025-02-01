import BaseContext from 'utils/base_context'

declare global {
    interface CreepMemory {
        role: string
    }

    interface HostileCreep {
        id: string
        owner: string
        body: BodyPartConstant[]
        last_seen: number
    }

    interface RoomMemory {
        next_spawn: number
        hostiles: HostileCreep[]
        underAttack: boolean
        sources: string[]
        owner: string
        last_seen: number
        avgCpu: number
    }
}

interface RoomMemoryContext {
    nextSpawn: number
    underAttack: boolean
}

export default class RoomMemoryManager<TContext extends Record<string, any> = {}> extends BaseContext<TContext & RoomMemoryContext> {
    enemies: Creep[]
    sources: Source[]

    constructor(room: Room) {
        // enable debugging for this class
        super(room, room.name)

        this.room.memory ??= {
            next_spawn: 0,
            hostiles: [],
            underAttack: false,
            sources: [],
            owner: '',
            last_seen: Game.time,
            avgCpu: 0
        }

        this.enemies = this.getContext('enemies', true)
        this.sources = this.getContext('sources', true)

        // log all hostiles
        this.enemies.forEach((c: Creep) => {
            const previouslySeen = this.room.memory.hostiles.find((h: HostileCreep) => h.id === c.id)

            if (previouslySeen) {
                previouslySeen.last_seen = Game.time
                return
            }

            this.room.memory.hostiles.push({
                id: c.id,
                owner: c.owner.username,
                body: c.body.map(b => b.type),
                last_seen: Game.time
            })
        })

        //this.enemies.map((c: Creep) => c.id)
        this.room.memory.underAttack = this.enemies.length > 0
        this.setContext('underAttack', this.room.memory.underAttack)

        // save sources to memory
        this.room.memory.sources = this.sources.map(s => s.id)

        // // save owner to memory
        // this.room.memory.owner = this.room.controller?.owner?.username ?? ''
        // this.setContext('roomOwner', this.room.memory.owner)

        // save last seen
        this.room.memory.last_seen = Game.time
        this.setContext('roomLastSeen', this.room.memory.last_seen)

        // if (this.room.memory.owner && this.room.memory.owner !== 'maddog986') {
        //     if (!Memory.territory.avoid.some(r => r === this.room.name)) {
        //         Memory.territory.avoid.push(this.room.name)
        //     }
        // }
    }
}
