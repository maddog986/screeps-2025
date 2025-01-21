import utils from 'utils/utils'
import { ASSIGNMENT, CreepBaseClass, JOB, ROLE } from './CreepBaseClass'

export default class Builder extends CreepBaseClass {
  static loadout(room: Room) {
    let room_energy = Math.min(400, room.energyCapacityAvailable)

    let max = 1
    let body: BodyPartConstant[] = utils.createBody([WORK, CARRY, CARRY, MOVE], room_energy)

    const room_creeps = utils.creeps({ room: room.name, ticksToLive: 100 })
    const mule_counts = room_creeps.filter(({ memory: { role } }) => role === ROLE.mule).length
    const harvester_counts = room_creeps.filter(({ store, memory: { role } }) => role === ROLE.harvester && store.getUsedCapacity(RESOURCE_ENERGY) > 10).length
    const upgrader_counts = room_creeps.filter(({ store, memory: { role } }) => role === ROLE.upgrader && store.getFreeCapacity() > 25).length
    const construction_site_counts = room.find(FIND_CONSTRUCTION_SITES).length
    const empty_builder_found = room_creeps.some(({ store, memory: { role } }) => role === ROLE.builder && store.getUsedCapacity(RESOURCE_ENERGY) === 0)

    if (empty_builder_found || mule_counts === 0 || harvester_counts === 0 || construction_site_counts == 0 || upgrader_counts === 0) return { max: 0, body: [] }

    return {
      max: Math.max(max, Math.ceil(construction_site_counts / 2)),
      body
    }
  }

  findTarget() {
    const mules = utils.creeps({ role: ROLE.mule })
    if (mules.length === 0) {
      this.findJob([ASSIGNMENT.assist])
      if (this.target) return
    }

    // if mule can store more, see if a harvester is nearby
    if (this.hasFreeCapacity()) {
      const mules = utils.creeps({ role: ROLE.mule, job: JOB.transfer, id_not: this.creep.id })

      const total_harvesters = utils.creeps({ role: ROLE.harvester }).length

      // harvesters within 3 range
      const harvesters = this.creep.pos.findInRange(FIND_MY_CREEPS, 5, {
        filter: ({ id, store, memory: { role, transfer } }) => role === ROLE.harvester &&
          store.getUsedCapacity() >= 5 && (total_harvesters === 1 || id !== this.last_target) &&

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


    // can the creep do something with stored energy?
    if (this.hasUsedCapacity()) {
      this.findJob([ASSIGNMENT.refill_spawn, ASSIGNMENT.build, ASSIGNMENT.repair, ASSIGNMENT.upgrade_controller])
    }

    // find an energy source
    if (this.hasFreeCapacity()) {
      this.findJob([ASSIGNMENT.withdraw_container, ASSIGNMENT.withdraw_harvester, ASSIGNMENT.harvest])
    }

    super.findTarget()
  }

  upgrade_controller(): any {
    // clear target every 10 ticks
    if (this.creep.memory.target_time && this.creep.memory.target_time % 10 === 0) {
      return this.clearTarget()
    }

    super.upgrade_controller()
  }

  repair() {
    // clear target every 10 ticks
    if (this.creep.memory.target_time && this.creep.memory.target_time % 10 === 0) {
      return this.clearTarget()
    }

    super.repair()
  }
}
