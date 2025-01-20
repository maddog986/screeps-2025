import Traveler from 'utils/Traveler'
import utils from 'utils/utils'
import { ASSIGNMENT, CreepBaseClass, JOB, ROLE } from './CreepBaseClass'

export default class Mule extends CreepBaseClass {
  findTarget() {
    this.findJob([ASSIGNMENT.assist])
    if (this.target) return

    // if mule can store more, see if a harvester is nearby
    if (this.hasFreeCapacity()) {
      const mules = Object.values(Game.creeps).filter(({ id, memory: { role, job } }) => role === ROLE.mule && job === JOB.transfer && id !== this.creep.id)

      // harvesters within 3 range
      const harvesters = this.creep.pos.findInRange(FIND_MY_CREEPS, 5, {
        filter: ({ id, store, memory: { role, transfer } }) => role === ROLE.harvester &&
          store.getUsedCapacity() >= 5 && id !== this.last_target &&

          // only take from harvesters that have enough energy to cover already assigned mules
          mules.filter(({ memory: { target } }) => target === id).reduce((a, b) => a + b.store.getFreeCapacity(), 0) < store.getUsedCapacity(RESOURCE_ENERGY)
      })

      if (harvesters.length > 0) {
        const harvester = this.creep.pos.findClosestByPath(harvesters)
        if (harvester) {
          this.setTarget(harvester, JOB.withdraw)
          return
        }
      }
    }

    // console.log(`${this.creep.name} find target. target: ${this.target}, hasUsedCapacity: ${this.hasUsedCapacity()}, hasFreeCapacity: ${this.hasFreeCapacity()}`)

    // can the creep do something with stored energy?
    if (!this.target && this.hasUsedCapacity()) {
      this.findJob([ASSIGNMENT.refill_spawn, ASSIGNMENT.refill_upgrader, ASSIGNMENT.refill_builder])
    }

    // can an find energy source
    if (!this.target && this.hasFreeCapacity()) {
      this.findJob([ASSIGNMENT.withdraw_harvester])
    }

    super.findTarget()
  }

  run() {
    super.run()

    if (this.target) return
    if (this.move_code === OK) return

    const spawn = this.creep.pos.findClosestByPath(FIND_MY_SPAWNS)
    if (!spawn) return

    const spot = parseInt(this.creep.name.slice(-1))
    // top right of spawn
    if (spot === 1) {
      // move it
      this.move_code = Traveler.move(this.creep, new RoomPosition(spawn.pos.x + 1, spawn.pos.y - 1, spawn.pos.roomName))
    }
    // bottom right of spawn
    else if (spot === 2) {
      this.move_code = Traveler.move(this.creep, new RoomPosition(spawn.pos.x + 1, spawn.pos.y + 1, spawn.pos.roomName))
    }
    // top left of spawn
    else if (spot === 3) {
      this.move_code = Traveler.move(this.creep, new RoomPosition(spawn.pos.x - 1, spawn.pos.y - 1, spawn.pos.roomName))
    }
    // bottom left of spawn
    else if (spot === 4) {
      this.move_code = Traveler.move(this.creep, new RoomPosition(spawn.pos.x - 1, spawn.pos.y + 1, spawn.pos.roomName))
    }
  }
}

export const MuleSetup = (room: Room) => {
  let room_energy = Math.min(400, Math.max(300, room.energyCapacityAvailable))

  let max = 1
  let body: BodyPartConstant[] = utils.createBody([CARRY, MOVE], room_energy)

  const room_creeps = Object.values(Game.creeps).filter(({ my, ticksToLive, room: { name } }) => my && name === room.name && (!ticksToLive || ticksToLive > 100))

  const harvester_counts = room_creeps.filter(({ store, memory: { role } }) => role === ROLE.harvester && store.getUsedCapacity(RESOURCE_ENERGY) > 10).length
  if (harvester_counts === 0) return { max: 0, body: [] }

  const upgraders_empty = room_creeps.some(({ store, memory: { role } }) => role === ROLE.upgrader && store.getUsedCapacity(RESOURCE_ENERGY) < 5)
  if (upgraders_empty) max++

  const harvesters_with_energy = room_creeps.some(({ store, memory: { role } }) => role === ROLE.harvester && store.getUsedCapacity(RESOURCE_ENERGY) === store.getCapacity(RESOURCE_ENERGY))
  if (harvesters_with_energy) max++

  return {
    max,
    body
  }
}
