import Builder from 'utils/creeps/Builder'
import { JOB, ROLE } from 'utils/creeps/CreepBaseClass'
import Harvester from 'utils/creeps/Harvester'
import Mule from 'utils/creeps/Mule'
import Upgrader from 'utils/creeps/Upgrader'
import RoomManager from 'utils/room_manager'
import { TravelerMemory } from 'utils/Traveler'
import utils from 'utils/utils'

declare global {
  // Memory extension samples
  interface Memory {
    uuid: number
    log: any
    cache: {
      [key: string]: {
        key: string
        value: any
        ids?: string[]
        serialized: boolean
        expires: number
        computedAt: number
        cpuUsed: number
      }
    }
  }

  interface RoomMemory {
    avoid?: boolean
    spawn_next?: number
  }

  interface CreepMemory {
    role: ROLE
    room: string

    job?: JOB

    target?: Id<_HasId>

    target_time?: number
    last_target?: Id<_HasId>

    work?: ScreepsReturnCode | CreepActionReturnCode | -100
    move?: ScreepsReturnCode | -100
    transfer?: ScreepsReturnCode | -100
    pickup?: ScreepsReturnCode | -100

    _travel?: TravelerMemory
    _move?: any
  }

  // Syntax for adding proprties to `global` (ex "global.log")
  namespace NodeJS {
    interface Global {
      log: any
    }
  }

  type CreateSetup = {
    [key in ROLE]: {
      body: BodyPartConstant[],
      max: number
    }
  }
}

console.log(`---Global reset ${Game.time}`)

export const loop = () => {
  // console.log(`Current game tick is ${Game.time}`)

  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name]
    }
  }

  if (Memory.cache) {
    for (const key in Memory.cache) {
      if (Memory.cache[key].expires < Game.time) {
        delete Memory.cache[key]
      }
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
      const roomManager = new RoomManager(room)
      roomManager.run()
    }

    // find all dropped resources
    const dropped_resources = room.find(FIND_DROPPED_RESOURCES)
    const tombstones = room.find(FIND_TOMBSTONES, {
      filter: ({ store }) => store.getUsedCapacity(RESOURCE_ENERGY) > 0
    })

    // find all creeps
    const creeps = utils.creeps({ room: room.name })

    // loop dropped resources
    for (const dropped_resource of [...tombstones, ...dropped_resources]) {
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

        // if creep is full, skip
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
          continue
        }

        // if creep is too far away, skip
        if (!creep.pos.isNearTo(dropped_resource)) {
          continue
        }

        // pickup dropped resource
        if (dropped_resource instanceof Resource) {
          creep.pickup(dropped_resource)
        } else if (dropped_resource instanceof Tombstone) {
          creep.withdraw(dropped_resource, RESOURCE_ENERGY)
        }
      }
    }
  }
}

// Game.spawns.Spawn1.spawnCreep([WORK, WORK, WORK, CARRY], "U3", { memory: { role: "upgrader", room: "W27528" } })
