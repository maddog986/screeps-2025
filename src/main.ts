import 'creep/creep_manager'
import 'room/room_manager'

// main game loop
export const loop = () => {
	console.log('---------------------------------------')

	// Automatically delete memory of missing creeps
	for (const name in Memory.creeps) {
		if (!(name in Game.creeps)) {
			delete Memory.creeps[name]
			continue
		}
	}

	// get all rooms
	const rooms = Object.values(Game.rooms)

	// loop all rooms
	rooms.forEach(room => {
		room.manager.run()
	})

	// loop my creeps
	const creeps = Object.values(Game.creeps)
		.filter(c => c.my && !c.spawning)

	// setup tasks for creeps
	creeps.forEach(creep => {
		creep.manager.run()
		creep.manager.flushLogs()
	})

	// loop all rooms
	rooms.forEach(room => {
		room.manager.flushLogs()
	})

	// // Object.values(Game.creeps).forEach(c => c.drop(RESOURCE_ENERGY))

	// // end of tick extra tasks
	// creeps
	// 	.forEach(creep => {
	// 		// harvester transfer whatever energy we can to another creep with less free capacity to top them off
	// 		if (!creep.manager.completed.has('transfer') && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
	// 			// other creeps nearby with less free capacity
	// 			const nearBy = creeps.filter(c =>
	// 				c.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
	// 				c.store.getFreeCapacity(RESOURCE_ENERGY) < creep.store.getFreeCapacity(RESOURCE_ENERGY) &&
	// 				c.pos.isNearTo(creep)
	// 			)

	// 			if (nearBy.length > 0) {
	// 				const transfer = creep.transfer(nearBy[0], RESOURCE_ENERGY)
	// 				if (transfer === OK) {
	// 					creep.manager.completed.add('transfer')
	// 				}
	// 			}
	// 		}
	// 	})
}
