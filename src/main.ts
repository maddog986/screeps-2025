import { cache } from 'utils/cache'
import Builder from 'utils/creeps/Builder'
import { JOB, ROLE } from 'utils/creeps/CreepBaseClass'
import Harvester from 'utils/creeps/Harvester'
import Mule from 'utils/creeps/Mule'
import Upgrader from 'utils/creeps/Upgrader'
import { TravelData } from 'utils/Traveler'
import { createBody, partsCost, walkablePositions } from 'utils/utils'

declare global {
  // Memory extension samples
  interface Memory {
    uuid: number
    log: any
    cache: {
      [key: string]: {
        expires: number
        value: any
      }
    }
  }

  interface RoomMemory {
    avoid?: boolean
  }

  interface CreepMemory {
    role: ROLE
    room: string

    job?: JOB

    target?: Id<_HasId>

    target_time?: number
    last_target?: Id<_HasId>

    work?: ScreepsReturnCode | CreepActionReturnCode | -100
    move?: CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND | -100
    transfer?: ScreepsReturnCode | -100

    _trav?: TravelData
  }

  // Syntax for adding proprties to `global` (ex "global.log")
  namespace NodeJS {
    interface Global {
      log: any
    }
  }
}

type CreateSetup = {
  [key in ROLE]: {
    body: BodyPartConstant[],
    max: number
  }
}

export const loop = () => {
  // console.log(`Current game tick is ${Game.time}`)

  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name]
    }
  }

  const myCreeps: Array<Harvester | Builder | Mule> = []

  // loop my creeps
  for (const name in Game.creeps) {
    const creep = Game.creeps[name]

    // if not my creep, skip
    if (!creep.my) {
      continue
    }

    if (creep.memory.role === ROLE.harvester) {
      myCreeps.push(new Harvester(creep))
    } else if (creep.memory.role === ROLE.mule) {
      myCreeps.push(new Mule(creep))
    } else if (creep.memory.role === ROLE.builder) {
      myCreeps.push(new Builder(creep))
    } else if (creep.memory.role === ROLE.upgrader) {
      myCreeps.push(new Upgrader(creep))
    }
  }

  // run my creeps
  for (const creep of myCreeps) {
    // console.log('creep:', creep.creep.name, 'role:', creep.role, 'task:', creep.job, 'target:', creep.target)
    creep.run()
  }


  // loop each room
  for (const room_name in Game.rooms) {
    const room = Game.rooms[room_name]

    // is room mine?
    if (room.controller?.my) {
      // controller level
      const controller_level = room.controller.level

      const creepSetup: CreateSetup = cache.getItem('creepSetup', 5, () => {



        let room_energy = Math.min(700, room.energyCapacityAvailable)
        let sources = room.find(FIND_SOURCES)
        let source_walkable_positions = sources
          .reduce((acc, s) => {
            return acc + walkablePositions(s)
          }, 0)

        let harvester_body: BodyPartConstant[] = []
        let ticks_until_empty = 0

        while (ticks_until_empty <= 250) {
          source_walkable_positions -= 0.50
          harvester_body = createBody([WORK, CARRY, CARRY], room_energy)

          const work_parts_total = harvester_body.filter((part) => part === WORK).length
          const energy_per_tick = work_parts_total * HARVEST_POWER * Math.ceil(source_walkable_positions)

          ticks_until_empty = sources.length * SOURCE_ENERGY_CAPACITY / energy_per_tick
        }




        const spawns_positions = room.find(FIND_MY_SPAWNS).reduce((acc, spawn) => {
          return acc + walkablePositions(spawn)
        }, 0)

        const creepSetup: CreateSetup = {
          [ROLE.harvester]: {
            body: [CARRY, CARRY, WORK, MOVE],
            max: 3,
          },
          [ROLE.builder]: {
            body: [WORK, CARRY, CARRY, MOVE, MOVE],
            max: controller_level >= 2 ? 1 : 0,
          },
          [ROLE.mule]: {
            body: [CARRY, CARRY, MOVE, MOVE],
            max: 1,
          },
          [ROLE.upgrader]: {
            body: [CARRY, WORK, WORK, MOVE],
            max: controller_level
          }
        }

        const mules = Object.values(Game.creeps)
          .filter(({ ticksToLive, room, memory: { role } }) =>
            // must be a mule
            role === ROLE.mule &&
            // must be in same
            room.name === room_name &&
            // must have a long life ahead
            (ticksToLive === undefined || ticksToLive > 150)
          ).length > 0

        if (controller_level >= 2) {
          if (mules) {
            creepSetup[ROLE.harvester].body = harvester_body
            creepSetup[ROLE.harvester].max = Math.floor(source_walkable_positions)

            creepSetup[ROLE.upgrader].body = createBody([CARRY, CARRY, WORK, WORK], room_energy)
            creepSetup[ROLE.upgrader].max = controller_level
          }

          //creepSetup[ROLE.mule].body = createBody([CARRY, CARRY, MOVE, MOVE], room_energy)
          // creepSetup[ROLE.mule].max = Math.ceil(Object.values(Game.creeps).filter(({ room, memory: { role } }) => room.name === room_name && [ROLE.harvester, ROLE.upgrader, ROLE.builder].includes(role as any)).length * 0.3)
        }

        // console.log('harvester body:', creepSetup[ROLE.harvester].body)

        return creepSetup
      })

      // find my spawns
      const spawns = room.find(FIND_MY_SPAWNS)

      // loop my spawns
      for (const spawn of spawns) {
        // if not my spawn, skip
        if (spawn.room.name !== room_name) {
          continue
        }

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

          const creeps = Object.values(Game.creeps).filter((creep: Creep) => creep.memory.role === role)

          // do we have enough creeps of this role?
          if (creeps.length >= creepSetup[role].max) {
            continue
          }

          if (partsCost(creepSetup[role].body) > spawn.room.energyAvailable) {
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
              room: room_name
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

    // find all dropped resources
    const dropped_resources = room.find(FIND_DROPPED_RESOURCES)
    const tombstones = room.find(FIND_TOMBSTONES, {
      filter: ({ store }) => store.getUsedCapacity(RESOURCE_ENERGY) > 0
    })

    // find all creeps
    const creeps = Object.values(Game.creeps)
      .filter(({ my, room: _room, memory: { transfer } }) => my && _room.name === room.name && transfer !== OK)

    // loop dropped resources
    for (const dropped_resource of [...dropped_resources, ...tombstones]) {
      // if resource is gone, break
      if (dropped_resource instanceof Resource && dropped_resource.amount === 0) {
        continue
      } else if (dropped_resource instanceof Tombstone && dropped_resource.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
        continue
      }

      // loop creeps
      for (const creep of creeps) {
        // if not my creep, skip
        if (!creep.my) {
          continue
        }

        if (creep.memory.transfer === OK) {
          continue
        }

        // if creep is full, skip
        if (creep.store.getFreeCapacity() === 0) {
          continue
        }

        // if creep is too far away, skip
        if (!creep.pos.inRangeTo(dropped_resource, 1)) {
          continue
        }

        // pickup dropped resource
        if (dropped_resource instanceof Resource) {
          creep.memory.transfer = creep.pickup(dropped_resource)
        } else if (dropped_resource instanceof Tombstone) {
          creep.memory.transfer = creep.withdraw(dropped_resource, RESOURCE_ENERGY)
        }
      }
    }
  }
}
