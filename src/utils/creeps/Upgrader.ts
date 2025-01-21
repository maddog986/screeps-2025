import utils from 'utils/utils'
import { ASSIGNMENT, CreepBaseClass, JOB, ROLE } from './CreepBaseClass'

export default class Upgrader extends CreepBaseClass {
  static loadout(room: Room) {
    let room_energy = Math.min(600, Math.max(300, room.energyCapacityAvailable))

    let max = 1
    let body: BodyPartConstant[] = utils.createBody([CARRY, CARRY, WORK, WORK], room_energy)

    const room_creeps = utils.creeps({ room: room.name, ticksToLive: 100 })
    const mule_counts = room_creeps.filter(({ memory: { role } }) => role === ROLE.mule).length
    const harvester_counts = room_creeps.filter(({ store, memory: { role } }) => role === ROLE.harvester && store.getUsedCapacity(RESOURCE_ENERGY) > 10).length

    const empty_upgrader_found = room_creeps.some(({ store, memory: { role } }) => role === ROLE.upgrader && store.getUsedCapacity(RESOURCE_ENERGY) === 0)
    if (empty_upgrader_found || mule_counts === 0 || harvester_counts === 0) return { max: 0, body: [] }

    const full_harvesters = room_creeps.some(({ store, memory: { role } }) => role === ROLE.harvester && store.getUsedCapacity(RESOURCE_ENERGY) === store.getCapacity(RESOURCE_ENERGY))
    if (full_harvesters) max++

    const total_alive_upgraders = room_creeps.filter(({ memory: { role } }) => role === ROLE.upgrader).length
    const idle_mules = room_creeps.filter(({ store, memory: { role, job } }) => role === ROLE.mule && job === JOB.idle && store.getUsedCapacity(RESOURCE_ENERGY) >= 50)
    if (idle_mules.length > 0) max += idle_mules.length

    return {
      max,
      body
    }
  }

  findTarget() {
    this.findJob([ASSIGNMENT.upgrade_controller])

    super.findTarget()
  }

  upgrade_controller() {
    // already done this tick
    if ([OK, ERR_TIRED].includes(this.work_code as any)) {
      return
    }

    if (!this.creep.pos.inRangeTo(this.target as StructureController, 3)) {
      this.moveToTarget()
      return
    }

    this.work_code = this.creep.upgradeController(this.target as StructureController)

    if (this.work_code === ERR_NOT_IN_RANGE) {
      this.moveToTarget()
    }
  }

  run() {
    super.run()

    // // if we are not below half, return
    // if (this.creep.store.getFreeCapacity() < this.creep.store.getCapacity() / 2) {
    //   return
    // }

    // // only run every 3 ticks
    // if (Game.time % 3 !== 0) {
    //   return
    // }

    if (this.transfer_code === OK || !this.hasUsedCapacity()) return

    // find nearby upgrader to share energy with
    const upgrader = this.creep.pos.findInRange(FIND_MY_CREEPS, 1, {
      filter: ({ id, store, memory: { role, transfer } }) =>
        role === ROLE.upgrader &&
        id !== this.creep.id &&
        store.getFreeCapacity() > this.creep.store.getFreeCapacity()
    })
      .sort((a, b) => a.store.getFreeCapacity() - b.store.getFreeCapacity())
      .shift()

    if (upgrader) {
      this.transfer_code = this.creep.transfer(upgrader, RESOURCE_ENERGY, Math.floor(this.creep.store.getUsedCapacity(RESOURCE_ENERGY) / 8))
    }
  }
}

export const UpgraderSetup = (room: Room) => {
  let room_energy = Math.min(600, Math.max(300, room.energyCapacityAvailable))

  let max = 1
  let body: BodyPartConstant[] = utils.createBody([CARRY, CARRY, WORK, WORK], room_energy)

  const room_creeps = utils.creeps({ room: room.name, ticksToLive: 100 })
  const mule_counts = room_creeps.filter(({ memory: { role } }) => role === ROLE.mule).length
  const harvester_counts = room_creeps.filter(({ store, memory: { role } }) => role === ROLE.harvester && store.getUsedCapacity(RESOURCE_ENERGY) > 10).length

  const empty_upgrader_found = room_creeps.some(({ store, memory: { role } }) => role === ROLE.upgrader && store.getUsedCapacity(RESOURCE_ENERGY) === 0)
  if (empty_upgrader_found || mule_counts === 0 || harvester_counts === 0) return { max: 0, body: [] }

  const full_harvesters = room_creeps.some(({ store, memory: { role } }) => role === ROLE.harvester && store.getUsedCapacity(RESOURCE_ENERGY) === store.getCapacity(RESOURCE_ENERGY))
  if (full_harvesters) max++

  const total_alive_upgraders = room_creeps.filter(({ memory: { role } }) => role === ROLE.upgrader).length
  const idle_mules = room_creeps.filter(({ store, memory: { role, job } }) => role === ROLE.mule && job === JOB.idle && store.getUsedCapacity(RESOURCE_ENERGY) >= 50)
  if (idle_mules.length > 0) max += idle_mules.length

  return {
    max,
    body
  }
}
