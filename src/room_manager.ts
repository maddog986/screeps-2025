import { CONFIG } from 'config'
import Traveler from 'creep_traveler'
import './utils/debugger'
import Debuggable from './utils/debugger'

declare global {
    interface CreepMemory {
        role: string
    }

    interface Room {
        _manager?: RoomManager
        manager: RoomManager
    }
}

export default class RoomManager extends Debuggable {
    room: Room
    spawns: StructureSpawn[]
    creeps: Creep[]

    constructor(room: Room) {
        // enable debugging for this class
        super(false, room.name, 'basic')

        this.room = room

        this.spawns = this.find(FIND_MY_SPAWNS)
        this.creeps = this.find(FIND_MY_CREEPS)
    }

    find<T extends FindConstant>(findType: T, filter?: (obj: FindTypes[T]) => boolean): FindTypes[T][] {
        const results = this.room.find(findType)

        if (filter) {
            return results.filter(filter)
        }

        return results
    }

    creepsByRole(role: string): Creep[] {
        return this.creeps.filter(creep => creep.memory.role === role)
    }

    displayMatrix() {
        if (!CONFIG.visuals.enabled || !CONFIG.visuals.show_matrix) return

        // lets visualize the room matrix
        const matrix = new PathFinder.CostMatrix
        const room_matrix = Traveler.buildRoomCostMatrix(this.room.name, matrix)

        // loop through the matrix, display a number on each tile with its cost
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                const cost = room_matrix.get(x, y)
                this.room.visual.text(cost.toString(), x, y + 0.1, {
                    font: '0.4 Arial',
                    opacity: 0.35
                })
            }
        }

    }

    run() {
        this.displayMatrix()

        const creepSetup = CONFIG.rooms[this.room.name]?.creeps

        if (creepSetup) {
            this.spawns.forEach(spawn => {
                if (spawn.spawning) return

                for (const role in creepSetup) {
                    const body = creepSetup[role].body
                    const max = creepSetup[role].max

                    const creeps = this.creepsByRole(role)
                    if (creeps.length >= max) continue

                    // wait until we have enough energy
                    if (RoomManager.partsCost(body) > this.room.energyAvailable) {
                        return
                    }

                    const name = RoomManager.creepName(role)
                    const result = spawn.spawnCreep(body, name, { memory: { role } })

                    if (result === OK) {
                        this.debug(`Spawning ${name} with ${body}`)
                        return
                    } else {
                        this.debug(`Failed to spawn ${name} with ${body}: ${result}`)
                    }
                }
            })
        }
    }

    static creepName(role: string): string {
        let name = role.slice(0, 1).toUpperCase()
        let i = 1

        while (!!Game.creeps[`${name}${i}`]) {
            i++
        }

        return `${name}${i}`
    }

    static partsCost(parts: BodyPartConstant[]): number {
        return parts.reduce((num, part) => num + BODYPART_COST[part], 0)
    }
}
