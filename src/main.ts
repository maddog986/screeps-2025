import './prototypes'
import SquadManager from './squads'

// Main game loop. RoomHivemind is constructed on first `room.manager` access
// and runs spawn/tower/build/link logic in its constructor.
export const loop = () => {
	// Automatically delete memory of missing creeps
	for (const name in Memory.creeps) {
		if (!(name in Game.creeps)) {
			delete Memory.creeps[name]
		}
	}

	// Run room managers first so opportunistic tasks exist before creeps act
	for (const roomName in Game.rooms) {
		void Game.rooms[roomName].manager
	}

	SquadManager.manageSquads()

	for (const name in Game.creeps) {
		const creep = Game.creeps[name]
		if (creep.spawning) continue
		creep.manager.manageCreepTasks()
	}

	for (const roomName in Game.rooms) {
		Game.rooms[roomName].manager.flushLogs()
	}
}
