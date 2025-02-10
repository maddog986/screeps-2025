import RoomHivemind from 'room_hivemind'
import './prototypes'
import SquadManager from 'squads'

// main game loop
export const loop = () => {
	const cpu = Game.cpu.getUsed()

	// Automatically delete memory of missing creeps
	for (const name in Memory.creeps) {
		if (!(name in Game.creeps)) {
			delete Memory.creeps[name]
			continue
		}
	}

	SquadManager.manageSquads()

	for (const creep in Game.creeps) {
		if (Game.creeps[creep].spawning) continue

		const creepManager = Game.creeps[creep].manager
		creepManager.manageCreepTasks()
	}

	for (const room in Game.rooms) {
		Game.rooms[room].manager.flushLogs()
	}


	// console.log(`<div style="padding: 1rem;background-color: #171717;border-radius: 1rem;margin: 0 0 0.5rem 0;min-width: 600px;letter-spacing:-0.04em;line-height:1.2;">` +
	// 	`<div style="font-size: 1.8rem;font-weight: bold;color: #fff;"><strong>${Game.time}</strong> cpu: ${(Game.cpu.getUsed() - cpu).toFixed(2)}</div>` +
	// 	`</div>`)

}
