import { ASSIGNMENT } from 'utils/jobs'
import { CreepBaseClass, ROLE } from './CreepBaseClass'

export default class Upgrader extends CreepBaseClass {
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
      filter: ({ store, memory: { role, transfer } }) => role === ROLE.upgrader &&
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
