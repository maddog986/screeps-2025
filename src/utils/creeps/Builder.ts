import { ASSIGNMENT } from 'utils/jobs'
import { CreepBaseClass, ROLE } from './CreepBaseClass'

export default class Builder extends CreepBaseClass {
  findTarget() {
    const mules = Object.values(Game.creeps).filter(({ memory: { role } }) => role === ROLE.mule)
    if (mules.length === 0) {
      this.findJob([ASSIGNMENT.assist])
      if (this.target) return
    }

    // can the creep do something with stored energy?
    if (this.hasUsedCapacity()) {
      if (mules.length === 0) {
        this.findJob([ASSIGNMENT.refill_spawn])
        if (this.target) return
      }

      this.findJob([ASSIGNMENT.build, ASSIGNMENT.repair, ASSIGNMENT.upgrade_controller])
    }

    // find an energy source
    if (this.hasFreeCapacity()) {
      this.findJob([ASSIGNMENT.withdraw_harvester, ASSIGNMENT.harvest])
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
