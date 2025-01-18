import { TravelData, Traveler } from 'utils/Traveler'
import { partsCost } from 'utils/utils'

declare global {
  // Memory extension samples
  interface Memory {
    uuid: number
    log: any
  }

  interface RoomMemory {
    avoid?: boolean
  }

  interface CreepMemory {
    role: ROLE
    room: string
    task?: TASK
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

enum ROLE {
  'harvester' = 'harvester',
  'mule' = 'mule',
  'builder' = 'builder',
  'upgrader' = 'upgrader',
};

enum TASK {
  idle = 'idle',
  harvest = 'harvest',
  refill_spawn = 'refill_spawn',
  upgrade_controller = 'upgrade_controller',
  withdraw = 'withdraw',
  transfer = 'transfer',
  construct = 'construct',
  repair = 'repair'
}

type CreepSetup = {
  [key in ROLE]: {
    body: BodyPartConstant[]
    max: number
  }
}

const jobs = {
  'build': function (this: CreepBaseClass): boolean {
    // find a construction site
    const target_build = this.creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES)

    if (target_build) {
      this.setTarget(target_build, TASK.construct)
      return true
    }

    return false
  },

  'repair': function (this: CreepBaseClass): boolean {
    // only check for repairs every 5 ticks
    if (Game.time % 5 !== 0) {
      return false
    }

    // find repairable structure
    const target_repair = this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
      filter: ({ hits, hitsMax }) => hits < hitsMax
    })

    if (target_repair) {
      this.setTarget(target_repair, TASK.repair)
      return true
    }

    return false
  },

  'refill_spawn': function (this: CreepBaseClass): boolean {
    // transfer resources to a spawn
    const target_spawn = this.creep.pos.findClosestByPath(FIND_MY_SPAWNS, {
      filter: ({ store }) => store.getFreeCapacity(RESOURCE_ENERGY) > 0
    })

    if (target_spawn) {
      this.setTarget(target_spawn, TASK.refill_spawn)
      return true
    }

    return false
  },

  'refill_upgrader': function (this: CreepBaseClass): boolean {
    // get all upgraders
    const upgraders = Object.values(Game.creeps)
      .filter(({ my, store, memory: { role } }) => my && role === ROLE.upgrader && store.getFreeCapacity() >= 10)

    // no upgraders with free capacity
    if (upgraders.length === 0) {
      return false
    }

    const mules = Object.values(Game.creeps).filter(({ memory: { role, task, target } }) => role === ROLE.mule && task === TASK.transfer)

    // filter out upgraders that already have a mule assigned to it
    const upgraders_that_need_it = upgraders.filter((upgrader) => {
      const my_range = this.creep.pos.getRangeTo(upgrader.pos)

      const mule = mules.find(({ pos, memory: { target } }) => target === upgrader.id && pos.getRangeTo(upgrader) < my_range)

      return !mule
    })

    // no upgraders with free capacity and no tasks
    if (upgraders_that_need_it.length === 0) {
      return false
    }

    // get upgraders with the least amount of energy
    const target = upgraders_that_need_it.reduce((a, b) => a.store.getFreeCapacity() < b.store.getFreeCapacity() ? a : b)

    // // transfer resources to a upgrader
    // const target = this.creep.pos.findClosestByPath(FIND_MY_CREEPS, {
    //   filter: ({ id, memory: { role }, store }) => store.getFreeCapacity(RESOURCE_ENERGY) >= 5 &&
    //     [ROLE.upgrader].includes(role) &&
    //     this.last_target !== id
    // })

    if (target) {
      this.setTarget(target, TASK.transfer)
      return true
    }

    return false
  },

  'refill_builder': function (this: CreepBaseClass): boolean {
    // transfer resources to a builder
    const target_builder = this.creep.pos.findClosestByPath(FIND_MY_CREEPS, {
      filter: ({ id, memory: { role }, store }) => store.getFreeCapacity(RESOURCE_ENERGY) >= 5 &&
        [ROLE.builder].includes(role) &&
        this.last_target !== id
    })

    if (target_builder) {
      this.setTarget(target_builder, TASK.transfer)
      return true
    }

    return false
  },

  'upgrade_controller': function (this: CreepBaseClass): boolean {
    // upgrade controller
    const target_controller = this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
      filter: ({ structureType }) => structureType === STRUCTURE_CONTROLLER
    })

    if (target_controller) {
      this.setTarget(target_controller, TASK.upgrade_controller)
      return true
    }

    return false
  },

  'withdraw_harvester': function (this: CreepBaseClass): boolean {
    const withdraw_from = [ROLE.harvester]

    if (this.creep.memory.role !== ROLE.mule) {
      withdraw_from.push(ROLE.mule)
    }

    // take resources from another creep
    const target = this.creep.pos.findClosestByPath(FIND_MY_CREEPS, {
      filter: ({ id, memory: { role, transfer, task }, store }) => store.getUsedCapacity(RESOURCE_ENERGY) >= 15 &&
        withdraw_from.includes(role) &&
        transfer !== OK &&
        task !== TASK.refill_spawn &&
        this.creep.id !== id
    })

    if (target) {
      this.setTarget(target, TASK.withdraw)
      return true
    }

    return false
  },

  'harvest': function (this: CreepBaseClass): boolean {
    // find a energy source
    const target = this.creep.pos.findClosestByPath(FIND_SOURCES, {
      filter: ({ energy }) => energy > 0
    })

    if (target) {
      this.setTarget(target, TASK.harvest)
      return true
    }

    return false
  }
}








class CreepBaseClass {
  creep: Creep
  target: _HasId | _HasRoomPosition | undefined | null

  // move: CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND | -100 = -100
  // transfer: ScreepsReturnCode | -100 = -100

  constructor(creep: Creep) {
    this.creep = creep
    this.target = creep.memory.target ? Game.getObjectById(creep.memory.target) : null

    this.move = -100
    this.transfer = -100
    this.work = -100

    if (!this.creep.memory.target_time) this.creep.memory.target_time = -1

    this.creep.memory.target_time++
  }

  get work() {
    return this.creep.memory.work ?? -100
  }

  set work(work: ScreepsReturnCode | CreepActionReturnCode | -100) {
    this.creep.memory.work = work
  }

  get move() {
    return this.creep.memory.move ?? -100
  }

  set move(move: CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND | -100) {
    this.creep.memory.move = move
  }

  get transfer() {
    return this.creep.memory.transfer ?? -100
  }

  set transfer(transfer: ScreepsReturnCode | -100) {
    this.creep.memory.transfer = transfer
  }

  get role() {
    return this.creep.memory.role
  }

  get task() {
    return this.creep.memory.task ? this.creep.memory.task : TASK.idle
  }

  set task(task: TASK) {
    this.creep.memory.task = task
  }

  get last_target() {
    return this.creep.memory.last_target
  }

  setTarget(target: _HasId | undefined | null, task: TASK = TASK.idle) {
    if (target) {
      this.task = TASK.idle
      this.target = target

      this.creep.memory.task = task
      this.creep.memory.target = target.id
      this.creep.memory.target_time = 0
      this.creep.memory.last_target = target.id
    } else {
      this.clearTarget()
    }
  }

  hasFreeCapacity(resource: ResourceConstant | undefined = undefined) {
    return this.creep.store.getFreeCapacity(resource) > 0
  }

  hasUsedCapacity(resource: ResourceConstant | undefined = undefined) {
    return this.creep.store.getUsedCapacity(resource) > 0
  }

  findJob(find_jobs: Array<keyof typeof jobs>) {
    return (find_jobs).some((target) => jobs[target].call(this))
  }

  findTarget() {
    // find a target
  }

  clearTarget() {
    this.task = TASK.idle
    this.target = null

    delete this.creep.memory.task
    delete this.creep.memory.target
  }

  run() {
    if (this.task !== TASK.idle && !this.target) {
      this.clearTarget()
    }

    // find a target if idle
    if (this.task === TASK.idle) {
      this.findTarget()
    }

    // no tasks to complete?
    if (this.task === TASK.idle) return

    // complete task
    if (this.task === TASK.harvest) {
      this.harvest()
    } else if (this.task === TASK.refill_spawn || this.task === TASK.transfer) {
      this.transferResource()
    } else if (this.task === TASK.upgrade_controller) {
      this.upgradeController()
    } else if (this.task === TASK.withdraw) {
      this.withdrawResource()
    } else if (this.task === TASK.construct) {
      this.construct()
    } else if (this.task === TASK.repair) {
      this.repair()
    }
  }

  moveToTarget() {
    if (!this.target) return

    // already done this tick
    if ([OK, ERR_TIRED].includes(this.move as any)) {
      return
    }

    this.move = Traveler.travelTo(this.creep, this.target as _HasRoomPosition);
  }

  upgradeController() {
    // empty?
    if (!this.hasUsedCapacity()) {
      this.clearTarget()
      return
    }

    // already done this tick
    if ([OK, ERR_TIRED].includes(this.work as any)) {
      return
    }

    this.work = this.creep.upgradeController(this.target as StructureController)

    if ([ERR_NO_BODYPART, ERR_NOT_ENOUGH_RESOURCES].includes(this.work as any) || !this.hasUsedCapacity()) {
      this.clearTarget()
    } else if (this.work === ERR_NOT_IN_RANGE) {
      this.moveToTarget()
    }
  }

  transferResource(resource: ResourceConstant = RESOURCE_ENERGY) {
    // empty?
    if (!this.hasUsedCapacity()) {
      this.clearTarget()
      return
    }

    // already done this tick
    if ([OK, ERR_TIRED].includes(this.transfer as any)) {
      return
    }

    // save a transfer request
    if (this.target instanceof Creep && this.target.memory.transfer === OK) {
      return this.withdrawResource()
    }

    this.transfer = this.creep.transfer(this.target as any, resource)

    if ([OK, ERR_FULL, ERR_NOT_ENOUGH_RESOURCES].includes(this.transfer as any) || !this.hasUsedCapacity()) {
      this.clearTarget()
    } else if (this.transfer === ERR_NOT_IN_RANGE) {
      this.moveToTarget()
    }
  }

  withdrawResource(resource: ResourceConstant = RESOURCE_ENERGY) {
    // already full?
    if (!this.hasFreeCapacity()) {
      this.clearTarget()
      return
    }

    // already done this tick
    if ([OK, ERR_TIRED].includes(this.transfer as any)) {
      return
    }

    if (this.target instanceof Creep) {
      // wait until next tick so we dont interupt the other creep
      if (this.target.memory.transfer === OK) {
        return
      }

      this.target.memory.transfer = this.target.transfer(this.creep, resource)

      if ([OK, ERR_NOT_ENOUGH_RESOURCES].includes(this.target.memory.transfer as any) || !this.hasFreeCapacity()) {
        this.clearTarget()
      } else if (this.target.memory.transfer === ERR_NOT_IN_RANGE) {
        this.moveToTarget()
      }
    }
  }

  harvest() {
    // already work done work this tick
    if ([OK, ERR_TIRED].includes(this.work as any)) {
      return
    }

    this.work = this.creep.harvest(this.target as Source)

    if ([ERR_NOT_ENOUGH_RESOURCES].includes(this.work as any) || !this.hasFreeCapacity()) {
      this.clearTarget()
    } else if (this.work === ERR_NOT_IN_RANGE) {
      this.moveToTarget()
    }
  }

  construct() {
    // empty?
    if (!this.hasUsedCapacity()) {
      this.clearTarget()
      return
    }

    // already work done work this tick
    if ([OK, ERR_TIRED].includes(this.work as any)) {
      return
    }

    this.work = this.creep.build(this.target as any)

    if ([ERR_INVALID_TARGET, ERR_NOT_ENOUGH_RESOURCES].includes(this.work as any) || !this.hasUsedCapacity()) {
      this.clearTarget()
    } else if (this.work === ERR_NOT_IN_RANGE) {
      this.moveToTarget()
    }
  }

  repair() {
    // empty?
    if (!this.hasUsedCapacity()) {
      this.clearTarget()
      return
    }

    // already work done work this tick
    if ([OK, ERR_TIRED].includes(this.work as any)) {
      return
    }

    this.work = this.creep.repair(this.target as any)

    if ([ERR_INVALID_TARGET, ERR_NOT_ENOUGH_RESOURCES].includes(this.work as any) || !this.hasUsedCapacity()) {
      this.clearTarget()
    } else if (this.work === ERR_NOT_IN_RANGE) {
      this.moveToTarget()
    }

    // clear target if at max hits
    if (this.target && 'hits' in this.target && 'hitsMax' in this.target && this.target.hits === this.target.hitsMax) {
      this.clearTarget()
    }
  }
}

class Harvester extends CreepBaseClass {
  findTarget() {
    // can an find energy source
    if (this.hasFreeCapacity()) {
      this.findJob(['harvest'])
    }

    // can the creep do something with stored energy?
    if (this.hasUsedCapacity()) {
      // count mules spawned
      const mules = Object.values(Game.creeps).filter(({ memory: { role } }) => role === ROLE.mule).length

      if (mules === 0) {
        this.findJob(['refill_spawn', 'upgrade_controller'])
      }
    }
  }

  run() {
    super.run()

    // if already transfered, return
    if (this.transfer === OK) {
      return
    }

    // find a mule creep nearby to transfer to
    const mule = this.creep.pos.findClosestByPath(FIND_MY_CREEPS, {
      filter: ({ memory: { role, transfer, task }, store }) => store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
        role === ROLE.mule
    })

    if (mule) {
      this.transfer = this.creep.transfer(mule, RESOURCE_ENERGY)

      // if mules target is self, clear target
      if (mule.memory.target === this.creep.id) {
        delete mule.memory.task
        delete mule.memory.target
      }
    }

    // if already transfered, return
    if (this.transfer === OK) {
      return
    }

    // find a harvester nearby to transfer a small amount to
    const harvester = this.creep.pos.findClosestByPath(FIND_MY_CREEPS, {
      filter: ({ memory: { role }, store }) => store.getFreeCapacity(RESOURCE_ENERGY) >= 5 &&
        role === ROLE.harvester
    })

    if (harvester) {
      this.transfer = this.creep.transfer(harvester, RESOURCE_ENERGY, Math.min(5, harvester.store.getFreeCapacity(RESOURCE_ENERGY), this.creep.store.getUsedCapacity(RESOURCE_ENERGY)))
    }

    // if already transfered, return
    if (this.transfer === OK) {
      return
    }

    // pickup dropped energy if not full
    if (this.creep.store.getFreeCapacity() > 0) {
      const dropped_energy = this.creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
        filter: ({ resourceType }) => resourceType === RESOURCE_ENERGY
      })
      if (dropped_energy) {
        this.transfer = this.creep.pickup(dropped_energy)
      }
    }
  }
}

class Mule extends CreepBaseClass {
  findTarget() {
    if (this.creep.store.getFreeCapacity() > 0) {
      // harvesters within 3 range
      const harvesters = this.creep.pos.findInRange(FIND_MY_CREEPS, 4, {
        filter: ({ id, store, memory: { role, task, transfer } }) => role === ROLE.harvester &&
          store.getUsedCapacity() >= 5 && id !== this.last_target
      })

      if (harvesters.length > 0) {
        const harvester = this.creep.pos.findClosestByPath(harvesters)
        if (harvester) {
          this.setTarget(harvester, TASK.withdraw)
          return
        }
      }
    }

    // can the creep do something with stored energy?
    if (!this.target && this.hasUsedCapacity()) {
      this.findJob(['refill_spawn', 'refill_upgrader', 'refill_builder'])
    }

    // can an find energy source
    if (!this.target && this.creep.store.getFreeCapacity() >= 25) {
      this.findJob(['withdraw_harvester'])
    }
  }
}

class Builder extends CreepBaseClass {
  findTarget() {
    // can the creep do something with stored energy?
    if (this.hasUsedCapacity()) {
      this.findJob(['build', 'repair', 'upgrade_controller'])
    }

    // find an energy source
    if (this.hasFreeCapacity()) {
      this.findJob(['withdraw_harvester'])
    }
  }

  upgradeController() {
    super.upgradeController();

    // clear target every 10 ticks
    if (this.creep.memory.target_time && this.creep.memory.target_time % 10 === 0) {
      this.clearTarget()
    }
  }

  repair() {
    super.repair();

    // clear target every 10 ticks
    if (this.creep.memory.target_time && this.creep.memory.target_time % 10 === 0) {
      this.clearTarget()
    }
  }
}

class Upgrader extends CreepBaseClass {
  constructor(creep: Creep) {
    super(creep)
  }

  findTarget() {
    this.findJob(['upgrade_controller'])
  }

  upgradeController() {
    // already done this tick
    if ([OK, ERR_TIRED].includes(this.work as any)) {
      return
    }

    if (!this.creep.pos.inRangeTo(this.target as StructureController, 3)) {
      this.moveToTarget()
      return
    }

    this.work = this.creep.upgradeController(this.target as StructureController)

    if (this.work === ERR_NOT_IN_RANGE) {
      this.moveToTarget()
    }
  }

  run() {
    super.run()

    // if we are not below half, return
    if (this.creep.store.getFreeCapacity() < this.creep.store.getCapacity() / 2) {
      return
    }

    // only run every 3 ticks
    if (Game.time % 3 !== 0) {
      return
    }

    // find nearby upgrader to share energy with
    const upgraders = this.creep.pos.findInRange(FIND_MY_CREEPS, 1, {
      filter: ({ store, memory: { role, task, transfer } }) => role === ROLE.upgrader &&
        transfer !== OK &&
        store.getUsedCapacity() >= this.creep.store.getUsedCapacity() &&
        store.getUsedCapacity() > 20
    })

    if (upgraders) {
      for (const upgrader of upgraders) {
          upgrader.memory.transfer = upgrader.transfer(this.creep, RESOURCE_ENERGY, 10)
      }
    }
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
    creep.run()
  }


  // loop each room
  for (const room_name in Game.rooms) {
    const room = Game.rooms[room_name]

    // is room mine?
    if (room.controller?.my) {
      // controller level
      const controller_level = room.controller.level

      const creepSetup = {
        [ROLE.harvester]: {
          body: [WORK, CARRY, MOVE],
          max: 3,
        },
        [ROLE.builder]: {
          body: [CARRY, WORK, MOVE, MOVE],
          max: controller_level >= 2 ? 1 : 0,
        },
        [ROLE.mule]: {
          body: [CARRY, CARRY, MOVE, MOVE],
          max: 2 + Math.floor(controller_level/2),
        },
        [ROLE.upgrader]: {
          body: [CARRY, WORK, WORK, MOVE],
          max: controller_level
        }
      }

      if (controller_level >= 3) {
        creepSetup[ROLE.harvester].max = 3
        creepSetup[ROLE.harvester].body = [WORK, WORK, CARRY, MOVE]
      }

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
        if (spawn.room.energyAvailable < 200) {
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

            while (!!Game.creeps[`${name}_${i}`]) {
              i++
            }

            return `${name}_${i}`;
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

    // find all creeps
    const creeps = Object.values(Game.creeps)
      .filter(({ my, room: _room, memory: { transfer } }) => my && _room.name === room.name && transfer !== OK)

    // loop dropped resources
    for (const dropped_resource of dropped_resources) {
      // loop creeps
      for (const creep of creeps) {
        // if not my creep, skip
        if (!creep.my) {
          continue
        }

        // if creep is full, skip
        if (creep.store.getFreeCapacity() === 0) {
          continue
        }

        // if creep is too far away, skip
        if (creep.pos.getRangeTo(dropped_resource) > 1) {
          continue
        }

        // pickup dropped resource
        creep.pickup(dropped_resource)
      }
    }
  }
}
