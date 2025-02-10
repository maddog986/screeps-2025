declare global {
    interface SquadMemory {
        leader: string
        members: string[]
        position?: { x: number; y: number; roomName: string }
        regrouping?: boolean
        tactic?: "focus-fire" | "hit-and-run" | "hold-position" | "surround"
    }

    interface Memory {
        squads: SquadMemory[]
    }
}

const SQUAD_SIZE = 4
const REGROUP_RANGE = 3
const STUCK_TICKS = 3

export default class SquadManager {
    static manageSquads(): void {
        Memory.squads ??= [] // Ensure squads memory exists

        // Get combat creeps
        const combatCreeps = Object.values(Game.creeps).filter(creep =>
            creep.body.some(part => [ATTACK, RANGED_ATTACK, HEAL, TOUGH].includes(part.type as any))
        )

        // Update squad memory with newly spawned or existing creeps
        this.updateSquadMemory(combatCreeps)

        for (const squad of Memory.squads) {
            const leader = Game.creeps[squad.leader]

            if (!leader) {
                this.assignNewLeader(squad)
                continue
            }

            const squadCreeps = [leader, ...squad.members.map(name => Game.creeps[name]).filter(Boolean)]
            if (squadCreeps.length < 2) {
                Memory.squads = Memory.squads.filter(s => s !== squad)
                continue
            }

            // Check if squad is together before moving
            if (!this.isSquadTogether(squadCreeps)) {
                squad.regrouping = true
                this.regroupSquad(squadCreeps, leader)
            } else {
                squad.regrouping = false

                // Engage combat tactics
                const target = this.getTarget(squadCreeps)
                if (target) {
                    this.executeTactic(squad, squadCreeps, target)
                } else {
                    this.moveSquad(squadCreeps, new RoomPosition(44, 22, leader.room.name)) // Example target
                }
            }
        }
    }

    private static updateSquadMemory(combatCreeps: Creep[]): void {
        const groupedByRoom: Record<string, Creep[]> = {}

        for (const creep of combatCreeps) {
            const room = creep.room.name
            if (!groupedByRoom[room]) {
                groupedByRoom[room] = []
            }
            groupedByRoom[room].push(creep)
        }

        for (const room in groupedByRoom) {
            const creeps = groupedByRoom[room]

            for (let i = 0; i < creeps.length; i += SQUAD_SIZE) {
                const squadCreeps = creeps.slice(i, i + SQUAD_SIZE)
                const existingSquad = Memory.squads.find(s => s.leader === squadCreeps[0].name)

                if (!existingSquad) {
                    Memory.squads.push({
                        leader: squadCreeps[0].name,
                        members: squadCreeps.slice(1).map(c => c.name),
                        tactic: "surround", // Default tactic
                    })
                } else {
                    existingSquad.members = squadCreeps.slice(1).map(c => c.name)
                }
            }
        }
    }

    private static assignNewLeader(squad: SquadMemory): void {
        if (squad.members.length > 0) {
            squad.leader = squad.members.shift()!
        } else {
            Memory.squads = Memory.squads.filter(s => s !== squad)
        }
    }

    private static isSquadTogether(squad: Creep[]): boolean {
        const leader = squad[0]
        return squad.every(creep => creep.pos.inRangeTo(leader.pos, REGROUP_RANGE))
    }

    private static regroupSquad(squad: Creep[], leader: Creep): void {
        squad.forEach(creep => {
            if (!creep.pos.inRangeTo(leader.pos, 1)) {
                creep.moveTo(leader, { visualizePathStyle: { stroke: "#ff0000" } })
            }
        })
    }

    private static moveSquad(squad: Creep[], targetPos: RoomPosition): void {
        squad.forEach(creep => creep.moveTo(targetPos, { visualizePathStyle: { stroke: "#ffaa00" } }))
    }

    private static getTarget(squad: Creep[]): Creep | null {
        const leader = squad[0]
        const enemies = leader.room.find(FIND_HOSTILE_CREEPS)
        return enemies.length > 0 ? leader.pos.findClosestByRange(enemies) : null
    }

    private static executeTactic(squad: SquadMemory, squadCreeps: Creep[], target: Creep): void {
        switch (squad.tactic) {
            case "focus-fire":
                this.focusFire(squadCreeps, target)
                break
            case "hit-and-run":
                this.hitAndRun(squadCreeps, target)
                break
            case "hold-position":
                this.holdPosition(squadCreeps)
                break
            case "surround":
                this.surroundTarget(squadCreeps, target)
                break
        }
    }

    private static focusFire(squadCreeps: Creep[], target: Creep): void {
        squadCreeps.forEach(creep => {
            if (creep.getActiveBodyparts(RANGED_ATTACK)) {
                creep.rangedAttack(target)
            } else if (creep.getActiveBodyparts(ATTACK)) {
                creep.attack(target)
            }
            creep.moveTo(target, { visualizePathStyle: { stroke: "#ff4444" } })
        })
    }

    private static hitAndRun(squadCreeps: Creep[], target: Creep): void {
        squadCreeps.forEach(creep => {
            if (creep.getActiveBodyparts(RANGED_ATTACK)) {
                creep.rangedAttack(target)
            }
            const fleePath = PathFinder.search(creep.pos, { pos: target.pos, range: 3 }).path
            if (fleePath.length > 0) {
                creep.move(creep.pos.getDirectionTo(fleePath[0]))
            }
        })
    }

    private static holdPosition(squadCreeps: Creep[]): void {
        squadCreeps.forEach(creep => {
            // Healers heal, others stand ready
            if (creep.getActiveBodyparts(HEAL)) {
                creep.heal(creep)
            }
        })
    }

    private static surroundTarget(squadCreeps: Creep[], target: Creep): void {
        const positions = [
            { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, // Left & Right
            { dx: 0, dy: -1 }, { dx: 0, dy: 1 } // Top & Bottom
        ]

        squadCreeps.forEach((creep, index) => {
            if (index < positions.length) {
                const movePos = new RoomPosition(target.pos.x + positions[index].dx, target.pos.y + positions[index].dy, target.room.name)
                creep.moveTo(movePos, { visualizePathStyle: { stroke: "#ffffff" } })

                if (creep.getActiveBodyparts(ATTACK)) {
                    creep.attack(target)
                }
                if (creep.getActiveBodyparts(RANGED_ATTACK)) {
                    creep.rangedAttack(target)
                }
            }
        })
    }
}
