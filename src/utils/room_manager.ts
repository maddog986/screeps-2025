import { CONFIG } from 'config'
import { cache } from './cache'
import Builder from './creeps/Builder'
import { ROLE } from './creeps/CreepBaseClass'
import Harvester from './creeps/Harvester'
import Mule from './creeps/Mule'
import Upgrader from './creeps/Upgrader'
import RoomBuilder from './room_builder'
import Traveler from './Traveler'
import utils from './utils'

export default class RoomManager {
    room: Room

    constructor(room: Room) {
        this.room = room
    }

    // cache key
    cache() {
        return this.room.name
    }

    @cache("creep_loadout", 4)
    creep_loadout(): CreateSetup {
        return {
            [ROLE.harvester]: Harvester.loadout(this.room),
            [ROLE.builder]: Builder.loadout(this.room),
            [ROLE.mule]: Mule.loadout(this.room),
            [ROLE.upgrader]: Upgrader.loadout(this.room)
        }
    }

    // @cache("build_room", CONFIG.buildModifer)
    build_room() {
        if (CONFIG.build.enabled === false) return

        //buildLayout(this.room)
        const builder = new RoomBuilder(this.room)
        builder.run()
    }

    @cache('spawns', 10)
    find_spawns() {
        return this.room.find(FIND_MY_SPAWNS)
    }

    @cache('find_creep_by_role')
    find_creep_by_role(role: ROLE) {
        return utils.creeps({ role })
    }

    @cache('find_structure_by_type', 5)
    find_structure_by_type(type: StructureConstant) {
        return this.room.find(FIND_MY_STRUCTURES, {
            filter: ({ structureType }) => structureType === type
        })
    }

    @cache('find_hostile_creeps')
    find_hostile_creeps() {
        const spawn = this.find_spawns().shift()
        if (!spawn) return []

        return this.room.find(FIND_HOSTILE_CREEPS)
            // sort by closest to spawn
            .sort((a, b) => utils.getRangeTo(a.pos, spawn.pos) - utils.getRangeTo(b.pos, spawn.pos))
    }

    run() {
        // auto build room layout
        this.build_room()

        if (CONFIG.visuals.enabled && CONFIG.visuals.show_matrix) {
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

        const towers = this.find_structure_by_type(STRUCTURE_TOWER) as StructureTower[]

        // loop towers
        for (const tower of towers) {
            const hostile = this.find_hostile_creeps().shift()

            if (hostile) {
                tower.attack(hostile)
            } else {
                const damaged = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
                    filter: ({ hits, hitsMax }) => hits < hitsMax
                })

                if (damaged) {
                    tower.heal(damaged)
                }
            }
        }

        // limit spawn rates
        if (this.room.memory.spawn_next && this.room.memory.spawn_next > Game.time) return

        // find my spawns
        const spawns = this.find_spawns()

        // get the creep setup for this room
        const creepSetup = this.creep_loadout()

        // loop my spawns
        for (const spawn of spawns) {
            // is spawn busy?
            if (spawn.spawning) {
                continue
            }

            // do we have energy to spawn anything?
            if (spawn.room.energyAvailable < 100) {
                continue
            }

            // loop my roles to find a creep to spawn
            for (const _role in ROLE) {
                const role = ROLE[_role as ROLE]

                if (!creepSetup[role]) {
                    console.log(`No setup for role: ${role}`)
                    continue
                }

                if (creepSetup[role].max === 0) {
                    continue
                }

                const partsCost = utils.partsCost(creepSetup[role].body)
                if (partsCost === 0) continue

                const creeps = this.find_creep_by_role(role)

                // do we have enough creeps of this role?
                if (creeps.length >= creepSetup[role].max) {
                    continue
                }

                if (partsCost > spawn.room.energyAvailable) {
                    continue
                }

                // figure a new name
                const newName = (() => {
                    let name = role.slice(0, 1).toUpperCase()
                    let i = 1

                    while (!!Game.creeps[`${name}${i}`]) {
                        i++
                    }

                    return `${name}${i}`
                })()

                //`${role.slice(0, 1).toUpperCase()}_${Game.time}`

                // spawn the creep
                const spawned = spawn.spawnCreep(creepSetup[role].body, newName, {
                    memory: {
                        role,
                        room: this.room.name
                    },
                })

                if (spawned === OK) {
                    // how long will the creep take to spawn?
                    const ticksToSpawn = Math.ceil(creepSetup[role].body.length * CREEP_SPAWN_TIME)

                    // set the next possible spawn time
                    this.room.memory.spawn_next = Game.time + ticksToSpawn + CONFIG.spawnRate

                    console.log(`Spawned new ${role}: ${newName} partsCost: ${partsCost} max: ${creepSetup[role].max} energyAvailable: ${spawn.room.energyAvailable} new spawn in: ${Game.time - this.room.memory.spawn_next}`)
                    break
                } else {
                    console.log(`Failed to spawn new ${role}: ${newName}. Code: ${spawned}`)
                }
            }
        }
    }
}
