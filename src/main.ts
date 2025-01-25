import CreepManager from 'creep_manager'
import RoomManager from 'room_manager'

// extend Room prototype
if (!Room.prototype.manager) {
	Object.defineProperty(Room.prototype, 'manager', {
		get: function (): RoomManager {
			if (!this._manager) {
				this._manager = new RoomManager(this)
			}
			return this._manager
		},
	})
}

// extend Creep prototype
if (!Creep.prototype.manager) {
	Object.defineProperty(Creep.prototype, 'manager', {
		get: function (): CreepManager {
			if (!this._manager) {
				this._manager = new CreepManager(this)
			}
			return this._manager
		},
	})
}

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
	const creeps = Object.values(Game.creeps).filter(c => c.my && !c.spawning)

	// setup tasks for creeps
	creeps.forEach(creep => {
		// load creep manager to assign tasks
		if (!creep.manager) console.log('creep manager not found', creep.name)

		// clear out empty travels
		if (!creep.memory._travel || !creep.memory._travel.path.length) {
			delete creep.memory._travel
		}
	})

	// execute tasks for all creeps
	creeps.forEach(creep => {
		creep.manager.executeTasks()
		creep.manager.flushLogs()
	})






	// end of tick extra tasks
	creeps.filter(creep => creep.memory.role === 'harvester')
		.forEach(creep => {
			// harvester transfer whatever energy we can to another creep with less free capacity to top them off
			if (creep.memory.role === 'harvester' && !creep.manager.completed.has('transfer') && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
				// other creeps nearby with less free capacity
				const nearBy = creeps.filter(c =>
					c.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
					c.store.getFreeCapacity(RESOURCE_ENERGY) < creep.store.getFreeCapacity(RESOURCE_ENERGY) &&
					c.pos.isNearTo(creep)
				)

				if (nearBy.length > 0) {
					const transfer = creep.transfer(nearBy[0], RESOURCE_ENERGY)
					if (transfer === OK) {
						creep.manager.completed.add('transfer')
					}
				}
			}
		})
}
