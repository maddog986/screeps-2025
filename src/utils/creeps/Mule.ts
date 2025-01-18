import { ASSIGNMENT } from 'utils/jobs'
import { CreepBaseClass, JOB, ROLE } from './CreepBaseClass'

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
}
