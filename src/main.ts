
declare global {
  // Memory extension samples
  interface Memory {
    uuid: number
    log: any
  }

  interface CreepMemory {
    role: ROLE
    room: string
    task?: TASK
    target?: Id<_HasId>
    last_target?: Id<_HasId>
    work?: ScreepsReturnCode | CreepActionReturnCode | -100
    move?: CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND | -100
    transfer?: ScreepsReturnCode | -100
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
};

enum TASK {
  idle = 'idle',
  harvest = 'harvest',
  refill_spawn = 'refill_spawn',
  upgrade_controller = 'upgrade_controller',
  withdraw = 'withdraw',
  transfer = 'transfer',
  construct = 'construct',
}

type CreepSetup = {
  [key in ROLE]: {
    body: BodyPartConstant[]
    max: number
  }
}

const creepSetup = {
  [ROLE.harvester]: {
    body: [WORK, CARRY, MOVE],
    max: 3,
  },
  [ROLE.builder]: {
    body: [CARRY, WORK, MOVE, MOVE],
    max: 2,
  },
  [ROLE.mule]: {
    body: [CARRY, CARRY, MOVE, MOVE],
    max: 2,
  }
}









class CreepBaseClass {
  creep: Creep
  target: _HasId | undefined | null

  // move: CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND | -100 = -100
  // transfer: ScreepsReturnCode | -100 = -100

  constructor(creep: Creep) {
    this.creep = creep
    this.target = creep.memory.target ? Game.getObjectById(creep.memory.target) : null

    this.move = -100
    this.transfer = -100
    this.work = -100
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
    }
  }

  moveToTarget() {
    if (!this.target) return

    // already done this tick
    if ([OK, ERR_TIRED].includes(this.move as any)) {
      return
    }

    this.move = this.creep.moveTo((this.target as unknown as _HasRoomPosition), { reusePath: 10, visualizePathStyle: { stroke: "#ffffff" } })
  }

  upgradeController() {
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
    // already done this tick
    if ([OK, ERR_TIRED].includes(this.transfer as any)) {
      return
    }

    this.transfer = this.creep.transfer(this.target as any, resource)

    if ([OK, ERR_FULL, ERR_NOT_ENOUGH_RESOURCES].includes(this.transfer as any) || !this.hasUsedCapacity()) {
      this.clearTarget()
    } else if (this.transfer === ERR_NOT_IN_RANGE) {
      this.moveToTarget()
    }
  }

  withdrawResource(resource: ResourceConstant = RESOURCE_ENERGY) {
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
}




class Harvester extends CreepBaseClass {
  constructor(creep: Creep) {
    super(creep);
  }

  findTarget() {
    // can an find energy source
    if (this.hasFreeCapacity()) {
      const target3 = this.creep.pos.findClosestByPath(FIND_SOURCES, {
        filter: ({ energy }) => energy > 0
      })

      if (target3) {
        this.setTarget(target3, TASK.harvest)
        return
      }
    }

    // count mules spawned
    const mules = Object.values(Game.creeps).filter(({ memory: { role } }) => role === ROLE.mule).length

    // can the creep do something with stored energy?
    if (this.hasUsedCapacity() && mules === 0) {

      // find a spawm that needs energy
      const target = this.creep.pos.findClosestByPath(FIND_MY_SPAWNS, {
        filter: ({ store }) => store.getFreeCapacity(RESOURCE_ENERGY) > 0
      })

      if (target) {
        this.setTarget(target, TASK.refill_spawn)
        return
      }

      const target2 = this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: ({ structureType }) => structureType === STRUCTURE_CONTROLLER
      })

      if (target2) {
        this.setTarget(target2, TASK.upgrade_controller)
        return
      }
    }


  }
}




class Mule extends CreepBaseClass {
  constructor(creep: Creep) {
    super(creep)
  }

  findTarget() {
    // can an find energy source
    if (this.creep.store.getFreeCapacity(RESOURCE_ENERGY) >= 40) {
      const target3 = this.creep.pos.findClosestByPath(FIND_MY_CREEPS, {
        filter: ({ id, memory: { role }, store }) => store.getUsedCapacity(RESOURCE_ENERGY) >= 10 &&
          [ROLE.harvester].includes(role) &&
          this.last_target !== id
      })

      if (target3) {
        this.setTarget(target3, TASK.withdraw)
        return
      }
    }

    // can the creep do something with stored energy?
    if (!this.target && this.hasUsedCapacity()) {
      // find a spawm that needs energy
      const target = this.creep.pos.findClosestByPath(FIND_MY_SPAWNS, {
        filter: ({ store }) => store.getFreeCapacity(RESOURCE_ENERGY) > 0
      })

      if (target) {
        this.setTarget(target, TASK.refill_spawn)
        return
      }

      // transfer resources to a builder
      const target2 = this.creep.pos.findClosestByPath(FIND_MY_CREEPS, {
        filter: ({ id, memory: { role }, store }) => store.getFreeCapacity(RESOURCE_ENERGY) >= 5 &&
          [ROLE.builder].includes(role) &&
          this.last_target !== id
      })

      if (target2) {
        this.setTarget(target2, TASK.transfer)
        return
      }
    }
  }
}

class Builder extends CreepBaseClass {
  constructor(creep: Creep) {
    super(creep)
  }

  findTarget() {
    // can the creep do something with stored energy?
    if (this.hasUsedCapacity()) {
      const target_build = this.creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES)

      if (target_build) {
        this.setTarget(target_build, TASK.construct)
        return
      }

      const target_controller = this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: ({ structureType }) => structureType === STRUCTURE_CONTROLLER
      })

      if (target_controller) {
        this.setTarget(target_controller, TASK.upgrade_controller)
        return
      }
    }

    // can an find energy source
    if (this.hasFreeCapacity()) {
      const target2 = this.creep.pos.findClosestByPath(FIND_MY_CREEPS, {
        filter: ({ memory: { role, transfer, task }, store }) => store.getUsedCapacity(RESOURCE_ENERGY) >= 15 &&
          [ROLE.harvester, ROLE.mule].includes(role) &&
          transfer !== OK &&
          task !== TASK.refill_spawn
      })

      if (target2) {
        this.setTarget(target2, TASK.withdraw)
        return
      }
    }
  }

  upgradeController() {
    super.upgradeController();
    this.clearTarget();
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

  // loop each room
  for (const room in Game.rooms) {
    // is room mine?
    if (Game.rooms[room].controller?.my) {

      // find my spawns
      const spawns = Game.rooms[room].find(FIND_MY_SPAWNS)

      // loop my spawns
      for (const spawn of spawns) {
        // if not my spawn, skip
        if (spawn.room.name !== room) {
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

          // spawn a creep
          const newName = `${role.slice(0, 1).toUpperCase()}_${Game.time}`

          // spawn the creep
          const spawned = spawn.spawnCreep(creepSetup[role].body, newName, {
            memory: {
              role,
              room
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
    }
  }

  // run my creeps
  for (const creep of myCreeps) {
    creep.run()
  }
}
