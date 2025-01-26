// declare global {
//     interface Creep {
//         _shadowStore?: StoreDefinition
//         realTimeStore(): StoreDefinition
//         updateShadowStore(resourceType: ResourceConstant, amount: number, action: 'add' | 'subtract'): void
//         getEffectiveWork(): number
//         getRealTimeUsedCapacity(resourceType?: ResourceConstant): number
//         getRealTimeFreeCapacity(resourceType?: ResourceConstant): number
//     }

//     interface Structure {
//         _shadowStore?: StoreDefinition
//         getRealTimeUsedCapacity(resourceType?: ResourceConstant): number
//         getRealTimeFreeCapacity(resourceType?: ResourceConstant): number
//     }
// }

// export { }

// // Helper: Ensure _shadowStore is initialized and synced
// function ensureShadowStore(target: { _shadowStore?: StoreDefinition; store: StoreDefinition }): StoreDefinition {
//     if (!target._shadowStore) {
//         target._shadowStore = { ...target.store }
//     }
//     return target._shadowStore
// }

// // Extend all objects with real-time capacity tracking
// Object.defineProperty(Structure.prototype, 'getRealTimeUsedCapacity', {
//     value: function (resourceType: ResourceConstant) {
//         const shadowStore = ensureShadowStore(this)
//         if (resourceType) {
//             return shadowStore[resourceType] || 0
//         }
//         return Object.values(shadowStore).reduce((total: number, amount: number) => total + amount, 0)
//     },
//     writable: true,
//     configurable: true,
// })

// Object.defineProperty(Structure.prototype, 'getRealTimeFreeCapacity', {
//     value: function (resourceType: ResourceConstant) {
//         const capacity = this.store.getCapacity(resourceType)
//         const usedCapacity = this.getRealTimeUsedCapacity(resourceType)
//         return capacity !== null ? capacity - usedCapacity : null
//     },
//     writable: true,
//     configurable: true,
// })

// // Extend Source prototype
// Object.defineProperty(Source.prototype, 'getRealTimeUsedCapacity', {
//     value: function () {
//         return this.energy
//     },
//     writable: true,
//     configurable: true,
// })

// Object.defineProperty(Source.prototype, 'getRealTimeFreeCapacity', {
//     value: function () {
//         return this.energyCapacity - this.energy
//     },
//     writable: true,
//     configurable: true,
// })

// // Extend StructureSpawn prototype
// Object.defineProperty(StructureSpawn.prototype, 'getRealTimeUsedCapacity', {
//     value: function (resourceType?: ResourceConstant): number {
//         const shadowStore = ensureShadowStore(this)
//         return shadowStore[RESOURCE_ENERGY] || 0
//     },
//     writable: true,
//     configurable: true,
// })

// Object.defineProperty(StructureSpawn.prototype, 'getRealTimeFreeCapacity', {
//     value: function (resourceType?: ResourceConstant) {
//         const shadowStore = ensureShadowStore(this)
//         const usedCapacity = shadowStore[RESOURCE_ENERGY] || 0
//         console.log('spawn free:', this.energyCapacity - usedCapacity)
//         return this.energyCapacity - usedCapacity
//     },
//     writable: true,
//     configurable: true,
// })

// // Extend the Creep prototype
// Creep.prototype.realTimeStore = function () {
//     return ensureShadowStore(this)
// }

// Creep.prototype.updateShadowStore = function (resourceType, amount, action) {
//     const shadowStore = this.realTimeStore()

//     if (action === 'subtract') {
//         // Ensure we do not subtract more than what's in the creep's store
//         const transferAmount = Math.min(amount, shadowStore[resourceType] || 0)
//         shadowStore[resourceType] = Math.max((shadowStore[resourceType] || 0) - transferAmount, 0)
//     } else if (action === 'add') {
//         // Ensure we only add up to the creep's capacity
//         const creepCapacity = this.store.getCapacity(resourceType)
//         const freeCapacity = creepCapacity - Object.values(shadowStore).reduce((total: number, amount: number) => total + amount, 0)
//         const actualAddAmount = Math.min(amount, freeCapacity)
//         shadowStore[resourceType] = (shadowStore[resourceType] || 0) + actualAddAmount
//     }

//     this._shadowStore = shadowStore
// }

// // Helper to calculate effective action amount based on WORK parts
// Creep.prototype.getEffectiveWork = function () {
//     // Get the number of WORK parts that can perform the action
//     return this.body.reduce((total, part) => {
//         return part.type === WORK && (part.hits > 0) ? total + 1 : total
//     }, 0)
// }

// // Overriding harvest
// const originalHarvest = Creep.prototype.harvest
// Creep.prototype.harvest = function (target) {
//     const result = originalHarvest.call(this, target)
//     if (result === OK) {
//         const workParts = this.getEffectiveWork()
//         let harvestedAmount

//         if (target instanceof Source) {
//             harvestedAmount = Math.min(
//                 workParts * 2, // Each WORK part harvests 2 energy per tick
//                 this.store.getFreeCapacity(RESOURCE_ENERGY), // Free space in creep's store
//                 target.energy // Energy available in the source
//             )
//             this.updateShadowStore(RESOURCE_ENERGY, harvestedAmount, 'add')
//         } else if ('mineralType' in target) {
//             harvestedAmount = Math.min(
//                 workParts, // Each WORK part harvests 1 mineral per tick
//                 this.store.getFreeCapacity(target.mineralType), // Free space in creep's store
//                 target.mineralAmount // Minerals available in the deposit
//             )
//             this.updateShadowStore(target.mineralType || RESOURCE_ENERGY, harvestedAmount, 'add')
//         }
//     }
//     return result
// }

// // Overriding upgradeController
// const originalUpgradeController = Creep.prototype.upgradeController
// Creep.prototype.upgradeController = function (target) {
//     const result = originalUpgradeController.call(this, target)
//     if (result === OK) {
//         const workParts = this.getEffectiveWork()
//         const upgradeCost = Math.min(
//             workParts, // Each WORK part consumes 1 energy per tick
//             this.store[RESOURCE_ENERGY] // Energy available in creep's store
//         )
//         this.updateShadowStore(RESOURCE_ENERGY, upgradeCost, 'subtract')
//     }
//     return result
// }

// // Overriding build
// const originalBuild = Creep.prototype.build
// Creep.prototype.build = function (target) {
//     const result = originalBuild.call(this, target)
//     if (result === OK) {
//         const workParts = this.getEffectiveWork()
//         const buildCost = Math.min(
//             workParts * 5, // Each WORK part spends 5 energy per tick
//             this.store[RESOURCE_ENERGY] // Energy available in creep's store
//         )
//         this.updateShadowStore(RESOURCE_ENERGY, buildCost, 'subtract')
//     }
//     return result
// }

// // Overriding repair
// const originalRepair = Creep.prototype.repair
// Creep.prototype.repair = function (target) {
//     const result = originalRepair.call(this, target)
//     if (result === OK) {
//         const workParts = this.getEffectiveWork()
//         const repairCost = Math.min(
//             workParts, // Each WORK part spends 1 energy per tick on repair
//             this.store[RESOURCE_ENERGY], // Energy available in creep's store
//             Math.ceil((target.hitsMax - target.hits) / 100) // Energy needed to repair the target
//         )
//         this.updateShadowStore(RESOURCE_ENERGY, repairCost, 'subtract')
//     }
//     return result
// }

// // Override getUsedCapacity
// Creep.prototype.getRealTimeUsedCapacity = function (resourceType) {
//     const shadowStore = this.realTimeStore()
//     if (resourceType) {
//         return shadowStore[resourceType] || 0
//     }
//     return Object.values(shadowStore).reduce((total, amount) => total + amount, 0)
// }

// // Override getFreeCapacity
// Creep.prototype.getRealTimeFreeCapacity = function (resourceType) {
//     const capacity = this.store.getCapacity(resourceType)
//     const usedCapacity = this.getRealTimeUsedCapacity(resourceType)
//     return capacity !== null ? capacity - usedCapacity : 0
// }

// // Updated transfer to use the helper
// const originalTransfer = Creep.prototype.transfer
// Creep.prototype.transfer = function (target: any, resourceType: ResourceConstant, amount) {
//     const actualAmount = Math.min(
//         amount || this.store[resourceType],
//         this.store[resourceType],
//         target.getRealTimeFreeCapacity(resourceType) || 0
//     )

//     const result = originalTransfer.call(this, target, resourceType, actualAmount)
//     if (result === OK) {
//         const shadowStore = ensureShadowStore(this)
//         shadowStore[resourceType] = Math.max((shadowStore[resourceType] || 0) - actualAmount, 0)

//         const targetShadowStore = ensureShadowStore(target)
//         targetShadowStore[resourceType] = (targetShadowStore[resourceType] || 0) + actualAmount
//     }
//     return result
// }

// // Updated withdraw to use the helper
// const originalWithdraw = Creep.prototype.withdraw
// Creep.prototype.withdraw = function (target: any, resourceType: ResourceConstant, amount) {
//     const actualAmount = Math.min(
//         amount || target.getRealTimeUsedCapacity(resourceType),
//         target.getRealTimeUsedCapacity(resourceType),
//         this.getRealTimeFreeCapacity(resourceType) || 0
//     )

//     const result = originalWithdraw.call(this, target, resourceType, actualAmount)
//     if (result === OK) {
//         const shadowStore = ensureShadowStore(this)
//         shadowStore[resourceType] = (shadowStore[resourceType] || 0) + actualAmount

//         const targetShadowStore = ensureShadowStore(target)
//         targetShadowStore[resourceType] = Math.max((targetShadowStore[resourceType] || 0) - actualAmount, 0)
//     }
//     return result
// }

// // Updated pickup to use the helper
// const originalPickup = Creep.prototype.pickup
// Creep.prototype.pickup = function (resource) {
//     const actualAmount = Math.min(
//         resource.amount, // Amount of resource on the ground
//         this.getRealTimeFreeCapacity(resource.resourceType) || 0
//     )

//     const result = originalPickup.call(this, resource)
//     if (result === OK) {
//         const shadowStore = ensureShadowStore(this)
//         shadowStore[resource.resourceType] = (shadowStore[resource.resourceType] || 0) + actualAmount
//     }
//     return result
// }
