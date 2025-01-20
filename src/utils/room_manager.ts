import { buildLayout } from './builder'
import { cache } from './cache'
import { BuilderSetup } from './creeps/Builder'
import { ROLE } from './creeps/CreepBaseClass'
import { HarvesterSetup } from './creeps/Harvester'
import { MuleSetup } from './creeps/Mule'
import { UpgraderSetup } from './creeps/Upgrader'
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

    @cache("build_room", 4)
    creep_loadout(): CreateSetup {
        return {
            [ROLE.harvester]: HarvesterSetup(this.room),
            [ROLE.builder]: BuilderSetup(this.room),
            [ROLE.mule]: MuleSetup(this.room),
            [ROLE.upgrader]: UpgraderSetup(this.room)
        }
    }

    @cache("build_room", 10)
    build_room() {
        buildLayout(this.room)
    }

    @cache('spawns', 10)
    find_spawns() {
        return this.room.find(FIND_MY_SPAWNS)
    }

    @cache('find_creep_by_role')
    find_creep_by_role(role: ROLE) {
        return Object.values(Game.creeps).filter((creep: Creep) => creep.memory.role === role)
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

        if (Game.time % 25 === 0) {
            this.build_room()
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

                console.log(role, 'partsCost:', partsCost, 'max:', creepSetup[role].max, 'energyAvailable:', spawn.room.energyAvailable)

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
                    console.log(`Spawned new ${role}: ${newName}`)
                    break
                } else {
                    console.log(`Failed to spawn new ${role}: ${newName}. Code: ${spawned}`)
                }
            }
        }
    }
}
