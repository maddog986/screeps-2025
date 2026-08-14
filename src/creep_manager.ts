import RoomHivemind, { TASK_ACTIONS } from 'room_hivemind'


class CreepManager {
    room: Room
    manager: RoomHivemind
    transfers: {
        energy: number
    } = {
            energy: 0
        }

    creep: Creep
    creepCompletedActions: Set<ActionTypes>

    constructor(creep: Creep) {
        this.creep = creep
        this.room = creep.room
        this.manager = Game.rooms[creep.memory.room]?.manager ?? this.room.manager

        this.manager.transfers[creep.id] ??= 0
        this.creepCompletedActions = new Set<ActionTypes>()
    }

    private findBestTask(): { task: TaskAction, target: TargetTypes | RoomPosition, score: number }[] {
        const { role } = this.creep
        const isHarvester = role === 'harvester'
        const isBuilder = role === 'builder'
        const isUpgrader = role === 'upgrader'
        const isMule = role === 'mule'
        const isDefender = role === 'defender'
        const isScout = role === 'scout'
        const isClaimer = role === 'claimer'

        if (this.manager.config.debug) this.manager.log('manageCreeps', `\n**findBestTask:** freeCapacity: ${this.manager.freeCapacity(this.creep)} usedCapacity: ${this.manager.usedCapacity(this.creep)}`)

        if (isScout) {
            const creepOriginRoom = Game.rooms[this.creep.room.name]
            if (!creepOriginRoom) return []

            const nextRoom = creepOriginRoom.manager
                .getUnseenAdjacentRooms()
                .sort(() => Math.random() - 0.5)
                .shift()

            if (nextRoom) {
                return [{
                    task: 'scout',
                    target: new RoomPosition(25, 25, nextRoom),
                    score: 100
                }]
            }

            const nextStaleRoom = creepOriginRoom.manager.getUnseenRoomsIfStale()
                .sort(() => Math.random() - 0.5)
                .shift()

            if (nextStaleRoom) {
                return [{
                    task: 'scout',
                    target: new RoomPosition(25, 25, nextStaleRoom),
                    score: 100
                }]
            }

            // fallback is home room
            return [{
                task: 'scout',
                target: new RoomPosition(25, 25, creepOriginRoom.name),
                score: 100
            }]
        }

        if (isClaimer) {
            const wantedRoom = this.manager.getExpansionTargets()[0]

            if (wantedRoom) {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **new claim:** ${wantedRoom}`)

                return [{
                    task: 'claim',
                    target: new RoomPosition(25, 25, wantedRoom),
                    score: 100
                }]
            }
        }



        const hasMules = this.manager.creepsByRole.mule.filter(c => !c.spawning).length > 0
        const hasBuilders = this.manager.creepsByRole.builder.filter(c => !c.spawning).length > 0
        const hasUpgraders = this.manager.creepsByRole.upgrader.filter(c => !c.spawning).length > 0
        const constructionSites = this.manager.constructionSites
        const controller = this.manager.controller as StructureController

        const moveParts = this.creep.body.filter(b => b.type === MOVE).length
        const nonMoveParts = this.creep.body.length - moveParts
        const effectiveMove = (moveParts * 2) - nonMoveParts
        const isSlowMover = effectiveMove < 1

        const actAsMule = !hasMules || this.creep.role === 'mule'
        const actAsBuilder = !hasBuilders || this.creep.role === 'builder'
        const actAsUpgrader = !hasUpgraders || this.creep.role === 'upgrader'

        // Determine valid targets based on role
        let validTargets: TargetTypes[] = [...this.manager.containers, ...this.manager.links]
        if (this.manager.storage) validTargets.push(this.manager.storage)

        if (isHarvester) {
            validTargets.push(...this.manager.sourcesActive, ...this.manager.remoteSources)
        }
        if (isBuilder || actAsBuilder) {
            validTargets.push(...constructionSites)
        }
        if (isUpgrader || actAsUpgrader) {
            validTargets.push(controller)
        }
        if (isMule || actAsMule) {
            validTargets.push(...this.manager.refillables, ...this.manager.droppedResources)
        }
        if (isDefender) {
            if (this.manager.threatLevel > 0) {
                validTargets.push(...this.manager.enemies)
            } else {
                const helpRooms = this.manager.helpRooms
                    .map(roomName => Game.rooms[roomName])
                    .filter((r): r is Room => !!r && r.manager.threatLevel > 0)
                validTargets.push(...helpRooms.map(r => r.manager.enemies).flat())
            }
        }

        if (this.creep.body.find(b => b.type === WORK) && this.room.controller) validTargets.push(this.room.controller)

        // Remove duplicate targets
        validTargets = validTargets.filter((target, index, self) =>
            index === self.findIndex(t => t.id === target.id)
        )

        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **valid targets:** ${validTargets.length}`)

        const creepFreeCapacity = this.manager.freeCapacity(this.creep)
        const creepUsedCapacity = this.manager.usedCapacity(this.creep)
        const creepCarryCapacity = this.creep.store.getCapacity()

        const scores = validTargets.map(target => {
            const role = this.creep.role
            let task: TaskAction = 'withdraw'

            const distanceToTarget = this.creep.pos.getRangeToCached(target.pos)
            const targetFreeCapacity = this.manager.freeCapacity(target)
            const targetUsedCapacity = this.manager.usedCapacity(target)

            if (target instanceof Source) {
                task = 'harvest'
            }
            else if (target instanceof ConstructionSite) {
                task = 'build'
            }
            else if (target instanceof StructureController) {
                task = 'upgrade'
            }
            else if (target instanceof StructureStorage) {
                const roomNeedsFill = this.manager.energyAvailable < this.manager.energyCapacityAvailable
                if (roomNeedsFill && creepFreeCapacity > 0 && targetUsedCapacity > 0) {
                    task = 'withdraw'
                } else if (creepUsedCapacity > 0 && targetFreeCapacity > 0) {
                    task = 'transfer'
                } else if (creepFreeCapacity > 0 && targetUsedCapacity > 0) {
                    task = 'withdraw'
                } else {
                    return false
                }
            }
            else if (target instanceof StructureContainer || target instanceof StructureLink) {
                const containersCloseBy = this.manager.containers.filter(container => container.pos.getRangeToCached(this.creep.pos) <= 3)
                const linksCloseBy = this.manager.links.filter(container => container.pos.getRangeToCached(this.creep.pos) <= 3)

                const containersNearBy = containersCloseBy.filter(container => container.pos.isNearToCached(this.creep.pos))
                const linksNearBy = linksCloseBy.filter(container => container.pos.isNearToCached(this.creep.pos))

                let withdrawScore = creepFreeCapacity === 0 ? -100 : 0
                let transferScore = creepUsedCapacity === 0 ? -100 : 0

                withdrawScore += creepFreeCapacity * 0.06
                transferScore += creepUsedCapacity * 0.06

                // not a fan of harvesters withdrawing from containers and links
                if (this.creep.role === 'harvester') {
                    // containers near by
                    if (containersCloseBy.some(container => this.manager.freeCapacity(container) > 0 && this.manager.containersNearSources.includes(container))) {
                        transferScore += 1
                    }

                    // links near by
                    if (linksCloseBy.some(container => this.manager.freeCapacity(container) > 0 && this.manager.linksNearSources.includes(container))) {
                        transferScore += 1
                    }
                }

                if (this.creep.role === 'mule') {
                    // containers near by
                    if (containersCloseBy.some(container => this.manager.freeCapacity(container) > 0 && this.manager.containersNearSpawns.includes(container))) {
                        transferScore += 1
                    }

                    // links near by
                    if (linksCloseBy.some(container => this.manager.freeCapacity(container) > 0 && this.manager.linksNearSources.includes(container))) {
                        transferScore += 1
                    }
                    if (linksCloseBy.some(container => this.manager.freeCapacity(container) > 0 && this.manager.linksNearSpawns.includes(container))) {
                        withdrawScore += 1
                    }
                }

                if (this.creep.role === 'upgrader') {
                    // upgraders do not transfer
                    transferScore = 0

                    // containers near by
                    if (containersCloseBy.some(container => this.manager.usedCapacity(container) > 0 && this.manager.containersNearController.includes(container))) {
                        withdrawScore += 1
                    }

                    // links near by
                    if (linksCloseBy.some(container => this.manager.usedCapacity(container) > 0 && this.manager.linksNearController.includes(container))) {
                        withdrawScore += 1
                    }
                }

                task = withdrawScore > transferScore ? 'withdraw' : 'transfer'
            }
            else if (target instanceof Resource) {
                task = 'pickup'
            }
            else if (target instanceof Creep && !target.my) {
                task = 'attack'
            }
            else if ((target instanceof StructureSpawn || target instanceof StructureExtension || target instanceof StructureTower)) {
                task = 'transfer'
            }

            if (task === 'withdraw' && !this.manager.usedCapacity(target)) return false
            if (task === 'withdraw' && !creepFreeCapacity) return false

            if (task === 'pickup' && !this.manager.usedCapacity(target)) return false
            if (task === 'pickup' && !creepFreeCapacity) return false

            if (task === 'transfer' && !targetFreeCapacity) return false
            if (task === 'transfer' && !creepUsedCapacity) return false

            if (task === 'harvest' && ![...this.manager.sourcesActive, ...this.manager.remoteSources].some(s => s.id === target.id)) return false
            if (task === 'harvest' && !creepFreeCapacity) return false

            if (task === 'upgrade' && !this.manager.controller) return false
            if (task === 'upgrade' && creepUsedCapacity < this.creep.workPower('upgrade')) return false

            if (task === 'build' && !this.manager.constructionSites.some(s => s.id === target.id)) return false
            if (task === 'build' && creepUsedCapacity < this.creep.workPower('build')) return false

            if (task === 'attack' && !this.manager.enemies.some(e => e.id === target.id)) return false


            const distance = this.creep.pos.getRangeToCached(target.pos)

            let priorityFactor = 0


            if (target instanceof Source) {
                priorityFactor += this.getHarvestScore(target) * (creepFreeCapacity / creepCarryCapacity)
            }
            else if (target instanceof ConstructionSite) {
                priorityFactor += this.getBuildScore(target)
            }
            else if (target instanceof StructureController) {
                priorityFactor += this.getUpgradeScore(target)
            }
            else if (target instanceof StructureStorage) {
                priorityFactor += this.getStorageScore(target, task, actAsMule)
            }
            else if (target instanceof StructureContainer || target instanceof StructureLink) {
                const isNearSpawn = this.manager.spawns.some(spawn => target.pos.getRangeToCached(spawn.pos) <= 7)
                const isNearController = this.manager.controller ? target.pos.getRangeToCached(this.manager.controller!.pos) <= 7 : false
                const isNearSource = this.manager.sourcesActive.some(source => target.pos.getRangeToCached(source.pos) <= 4)

                priorityFactor += this.getContainerScore(target, task, distanceToTarget, actAsMule, isNearSpawn, isNearController, isNearSource)
            }
            else if (target instanceof Resource) {
                priorityFactor += this.getResourceScore(target, task, distanceToTarget)
            }
            else if (target instanceof Creep && !target.my) {
                priorityFactor += 100
            }
            else if ((target instanceof StructureSpawn || target instanceof StructureExtension || target instanceof StructureTower)) {
                const isNearSpawn = this.manager.spawns.some(spawn => target.pos.getRangeToCached(spawn.pos) <= 7)

                priorityFactor += this.getSpawnStructuresScore(target, task, distanceToTarget, actAsMule, isNearSpawn) * (creepUsedCapacity / creepFreeCapacity)
            }

            const distanceFactor = ((isSlowMover ? 0.5 : 1) - ((distance / 50) * 3)) * 0.35
            priorityFactor *= 0.35

            const weight = this.manager.policy.taskWeight[task] ?? 1
            const score = (priorityFactor + distanceFactor + (Math.random() * 0.05)) * weight

            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **${score.toFixed(2)}** ${target} **priorityFactor:** ${priorityFactor.toFixed(2)} **distanceFactor:** ${distanceFactor.toFixed(2)}`)

            return { task, target, score }
        })
            .filter(taskTarget => taskTarget !== false)
            .sort((a, b) => b.score - a.score)

        if (this.manager.config.debug) this.manager.log('manageCreeps', `\n**final scores:**${!scores.length ? ' no tasks found' : `\n      - `}`, scores
            .map(t => (`**${String(t.target)}**: ${t.score} ${t.task} ${this.manager.usedCapacity(t.target)} ${this.manager.freeCapacity(t.target)}`))
            .join('\n      - '))

        return scores
    }

    private getStorageScore(target: StructureStorage, task: TaskAction, actAsMule: boolean): number {
        const roomNeedsFill = this.manager.energyAvailable < this.manager.energyCapacityAvailable
        const assignedCreeps = this.manager.creeps.filter(c => c.hasTaskById(target.id))
        const assignedCreepsStored = assignedCreeps.reduce((acc, c) => acc + this.manager.usedCapacity(c), 0)
        const assignedCreepsFree = assignedCreeps.reduce((acc, c) => acc + this.manager.freeCapacity(c), 0)

        let score = 8

        if (task === 'transfer') {
            score += roomNeedsFill ? -15 : 18
            score += this.creep.role === 'harvester' ? 6 : 0
            score += assignedCreepsStored > this.manager.freeCapacity(target) ? -100 : 0
        } else {
            score += roomNeedsFill && actAsMule ? 22 : 0
            score += this.creep.role === 'upgrader' ? -40 : 0
            score += assignedCreepsFree > this.manager.usedCapacity(target) ? -100 : 0
        }

        return score
    }

    private getContainerScore(target: StructureContainer | StructureLink, task: TaskAction, distanceToTarget: number, actAsMule: boolean, isNearSpawn: boolean, isNearController: boolean, isNearSource: boolean): number {
        if (this.manager.creepsByRole.mule.length >= 3 && this.manager.links.length >= 3) {
            const mules = this.manager.creepsByRole.mule.filter(c => !c.spawning)

            if (mules.length && this.creep.name === mules[0].name) {
                if (!isNearSpawn) {
                    return -10
                }
            }

            if (mules.length > 1 && this.creep.name === mules[1].name) {
                if (!isNearSource) {
                    return -10
                }
            }

            if (mules.length > 2 && this.creep.name === mules[2].name) {
                if (!isNearController) {
                    return -10
                }
            }
        }

        let score = 1

        const roomFull = this.manager.energyAvailable >= this.manager.energyCapacityAvailable
        const spawnContainersFull = this.manager.containersNearSpawns.every(c => !this.manager.freeCapacity(c))
        const assignedCreeps = this.manager.creeps.filter(c => c.hasTaskById(target.id))
        const assignedCreepsStored = assignedCreeps.reduce((acc, c) => acc + this.manager.usedCapacity(c), 0)
        const assignedCreepsFree = assignedCreeps.reduce((acc, c) => acc + this.manager.freeCapacity(c), 0)
        const freeCapacity = this.manager.freeCapacity(target)
        const usedCapacity = this.manager.usedCapacity(target)

        if (target instanceof StructureContainer) {
            score += isNearSpawn ? 0.25 : 0
            score += isNearController ? 0.5 : 0

            score += (task === 'withdraw' && isNearSpawn && roomFull && spawnContainersFull) ? -100 : 0 // energy structures full, we dont want to withdraw from spawn containers
            score += (task === 'withdraw' && isNearSpawn && !roomFull && actAsMule) ? 30 : 0 // withdraw from spawn containers if the room is not full and the creep is a mule
            score += (task === 'withdraw' && isNearSpawn && !actAsMule) ? -50 : 0 // disguarage non-mule creeps from withdrawing from spawn containers
            score += (task === 'withdraw' && isNearSpawn && this.creep.role === 'upgrader' && this.manager.creepsByRole.mule.length > 0) ? -100 : 0 // disguarage upgraders from withdrawing from spawn containers
            score += (task === 'withdraw' && isNearSource && actAsMule) ? 10 : 0 // withdraw from source containers is for mules only
            score += (task === 'withdraw' && isNearSource && actAsMule && !roomFull) ? 10 : 0 // withdraw from source containers if room not null
            score += (task === 'withdraw' && isNearSource && this.creep.role === 'builder') ? 10 : 0 // builders withdraw from source containers
            score += (task === 'withdraw' && isNearController && actAsMule) ? -10 : 0 // disguarage mules from withdrawing from controller containers

            score += (task === 'transfer' && !roomFull && isNearSpawn) ? -100 : 0 // dont transfer to a container if the spawn/extensions are NOT full
            score += (task === 'transfer' && !actAsMule && isNearSpawn) ? -10 : 0 // let mules handle the transfer near spawns
            score += (task === 'transfer' && !actAsMule && (!isNearSource || distanceToTarget <= 1)) ? -10 : 0 // let mules handle the transfer expect near sources. distance check is when harvesters are already on the way to refill structures and a mule spawns. its quicker and easier to have the harvester redposit because of fatigue on the way back to harvest.
            score += (task === 'transfer' && actAsMule && isNearSource) ? -100 : 0 // mules do not transfer to source containers
            score += (task === 'transfer' && actAsMule && isNearSpawn) ? 20 : 0 // important to transfer to spawn containers
            score += (task === 'transfer' && isNearSource && distanceToTarget > 4) ? -100 : 0 // dont transfer to source containers if the distance is greater than 4
            score += (task === 'transfer' && isNearController && actAsMule) ? 10 : 0 // enguarage mules from transferring to controller containers
            score += (task === 'transfer' && isNearController && actAsMule && distanceToTarget <= 4) ? 25 : 0 // little bonus to transfer to controller containers if near by
        }
        else if (target instanceof StructureLink) {
            score += (task === 'transfer' && isNearSource) ? 12 : 0 // links are more important than containers
            score += (task === 'transfer' && isNearSource) ? (distanceToTarget > 4 ? -70 : 0) : 0 // only transfer if near source
            score += (task === 'transfer' && isNearSpawn) ? -100 : 0 // energy is sent from source links
            score += (task === 'transfer' && isNearController) ? -100 : 0 // energy is sent from source links

            score += (task === 'withdraw' && isNearSpawn && (actAsMule || this.creep.role === 'builder')) ? 30 : 0 // * (distance <= 3 ? 1.5 : 1) // withdraw from spawn links is more important than other links
            score += (task === 'withdraw' && isNearSource) ? -100 : 0 // dont withdraw from source links
            score += (task === 'withdraw' && isNearSpawn && roomFull && this.manager.containersNearSpawns.every(c => !this.manager.freeCapacity(c)) && this.manager.towers.every(c => !this.manager.freeCapacity(c))) ? -100 : 0 // no containers to store the energy in a full room
            score += (task === 'withdraw' && isNearController) ? 8 : 0 // withdraw from controller links
            score += (task === 'withdraw' && isNearController && actAsMule) ? 10 : 0 // withdraw from controller links
            score += (task === 'withdraw' && isNearController && actAsMule && distanceToTarget <= 3) ? 10 : 0 // withdraw from controller links
            score += (task === 'withdraw' && isNearController && this.creep.role === 'upgrader') ? 15 : 0 // upgraders withdraw from links

            const mules = this.manager.creepsByRole.mule

            score += (task === 'withdraw' && isNearController && actAsMule && mules.length >= 3 && this.creep.name === mules[0].name) ? -10 : 0 // deprioritize primary mule from withdrawing from controller links if there are other mules nearby
            score += (task === 'withdraw' && this.creep.role === 'harvester') ? -10 : 0 // harvesters dont withdraw from links
            score += (task === 'withdraw' && this.creep.role === 'builder') ? -10 : 0 // builders dont withdraw from links
            score += (task === 'withdraw' && !actAsMule && assignedCreeps.length > 2) ? -100 : 0 // dont withdraw from links if there are other creeps withdrawing from the same link
        }

        // fails when container near controller is not full. mules wont withdraw to transfer to a nearby container.
        // score += (task === 'withdraw' && isNearController && actAsMule && roomFull && spawnContainersFull) ? -80 : 0 // mules dont need to withdraw from controller areas in good room conditions




        if (task === 'transfer') {
            score += assignedCreepsStored > freeCapacity ? -100 : 0
        } else if (task === 'withdraw') {
            score += assignedCreepsFree > usedCapacity ? -100 : 0
        }



        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **container score:** ${score} ${target} ${task} ${distanceToTarget} ${isNearSpawn} ${isNearController} ${isNearSource} ${roomFull}`)

        return score
    }

    private getHarvestScore(target: Source): number {
        const assignedHarvesters = this.manager.creepsByTask.harvest.filter(c => c.id !== this.creep.id && c.hasTask('harvest', target.id)).length
        const walkablePositions = target.walkablePositions

        let score = 1

        score += (target.energy / target.energyCapacity) * 0.05
        score += (target.walkablePositions - this.manager.creepsByTask.harvest.length) * 0.05
        score -= target.ticksToRegeneration > 0 ? (target.ticksToRegeneration / 100) * 0.05 : 0
        score += assignedHarvesters >= walkablePositions ? -100 : 0 // dont assign more harvesters than walkable positions
        score += ((walkablePositions + 1) / (assignedHarvesters + 1)) * 0.05
        score += (this.creep.role === 'harvester') ? 15 : 0 // harvesters get a bonus for harvesting

        const isRemote = !this.manager.sources.some(s => s.id === target.id)
        if (isRemote) {
            const localSaturated = this.manager.sources.every(s => {
                const assigned = this.manager.creepsByTask.harvest.filter(c => c.hasTask('harvest', s.id)).length
                return assigned >= s.walkablePositions
            })
            score += localSaturated ? 12 : -20
        }

        return score
    }

    private getBuildScore(target: ConstructionSite): number {
        if (!this.creep.body.find(b => b.type === WORK)) return -1000

        if (this.manager.spawns.length > 1) {
            const assignedCreeps = this.manager.creeps.filter(c => c.hasTaskByAction('build'))
            if (assignedCreeps.length > 2) return -100
        }

        let score = 0

        score += target.structureType === STRUCTURE_SPAWN ? 200 : 0
        score += target.structureType === STRUCTURE_EXTENSION ? 1.5 : 0
        score += target.structureType === STRUCTURE_TOWER ? 2 : 0
        score += target.structureType === STRUCTURE_WALL ? 1 : 0
        score += target.structureType === STRUCTURE_CONTAINER ? 4 : 0
        score += target.structureType === STRUCTURE_STORAGE ? 8 : 0
        score += target.structureType === STRUCTURE_LINK ? 6 : 0
        score += target.structureType === STRUCTURE_TERMINAL ? 5 : 0
        score += target.structureType === STRUCTURE_RAMPART ? 0.5 : 0
        score += (target.progress / target.progressTotal) * 2

        if (this.manager.phase === 'bootstrap' && target.structureType !== STRUCTURE_SPAWN) {
            score *= 0.45
        }

        return score
    }

    private getSpawnStructuresScore(target: TargetTypes, task: TaskAction, distanceToTarget: number, actAsMule: boolean, isNearSpawn: boolean): number {
        // const roomMule = this.manager.creepsByRole.mule.length > 0
        // if (roomMule && this.creep.pos.getRangeToCached(target.pos) > 4) {
        //     return 0
        // }

        let score = 10

        score += (this.manager.usedCapacity(target) / this.manager.freeCapacity(target))
        score += target instanceof StructureSpawn ? 5 : 0
        score += target instanceof StructureExtension ? 3 : 0
        score += target instanceof StructureTower ? 10 : 0
        if (this.manager.phase === 'bootstrap' && target instanceof StructureSpawn) score += 4

        // score += (task === 'transfer' && !actAsMule && isNearSpawn) ? -10 : 0 // let mules handle the transfer near spawns

        // const assignedCreeps = this.manager.creepsByRole.mule.filter(c => c.hasTask('transfer', target.id) && c.pos.getRangeToCached(this.manager.spawns[0].pos) <= 6)
        // if (assignedCreeps.length > 1) {
        //     score += (task === 'transfer' && isNearSpawn) ? -100 : 0 // dont transfer to spawns if there are other creeps transferring to the same spawn
        // }

        return score
    }

    private getUpgradeScore(target: StructureController): number {
        let score = 0.6

        score += target.pos.getRangeToCached(this.manager!.controller!.pos) < 2 ? 2 : 0

        score += this.creep.workPower('upgrade') > this.manager.usedCapacity(this.creep) ? -100 : 0
        score += this.creep.role === 'upgrader' ? 10 : 0
        if (this.manager.phase === 'bootstrap') score += 2

        score += (this.creep.role === 'harvester' && this.manager.creepsByRole.upgrader.length > 2) ? -10 : 0

        return score
    }

    private getResourceScore(target: Resource, task: TaskAction, distanceToTarget: number): number {
        let score = 0 // 5 + ((target.amount / creepFreeCapacity) * 4)

        score += distanceToTarget < 5 ? 10 : 0
        score += target.amount > this.manager.freeCapacity(this.creep) ? 100 : 0
        score += target.amount * 0.005

        return score
    }

    private removeTaskByIndex(index: number, findNew: boolean = true) {
        const task = this.creep.tasks[index]
        task.deleted = true
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - #00ff37[**task completed:**] action: ${task.action}`)

        this.creep.tasks.splice(index, 1)

        this.creep.tasks.forEach(task => {
            this.manager.creepsByTask[task.action] = this.manager.creepsByTask[task.action].filter(c => c.id !== this.creep.id && c.hasTaskByAction(task.action))
        })

        if (findNew) {
            this.creepFindTasks()
        }
    }

    private executeTask(task: TaskObject | TaskPosition, target: TargetTypes | RoomPosition): ScreepsReturnCode {
        if (this.manager.config.debug) this.manager.log('manageCreeps', `\n**🎯Execute Task:** ${task.action}\n  - **target:** ${target}`)

        const workPower = this.creep.body.filter(b => b.type === WORK).length
        switch (task.action) {
            case 'harvest': return this.executeHarvest(target as Source, workPower)
            case 'build': return this.executeBuild(target as ConstructionSite, workPower)
            case 'repair': return this.executeRepair(target as Structure, workPower)
            case 'transfer': return this.executeTransfer(target as Structure<StructureConstant>, 'amount' in task ? task.amount : undefined)
            case 'withdraw': return this.executeWithdraw(target as StructureContainer)
            case 'pickup': return this.executePickup(target as Resource)
            case 'upgrade': return this.executeUpgrade(target as StructureController, workPower)
            case 'renew': return this.executeRenew(target as StructureSpawn)
            case 'recycle': return (target as StructureSpawn).recycleCreep(this.creep)
            case 'attack': return this.executeAttack(target as Creep)
            case 'move': return this.executeMove(target as TargetTypes | RoomPosition, task as TaskPosition)
            case 'scout': return this.executeScout(target as RoomPosition)
            case 'claim': return this.executeClaim(target as RoomPosition, task as TaskPosition)
            default: if (this.manager.config.debug) this.manager.log('manageCreeps', '**executeTask:** action not found', task.action, 'target:', target); return ERR_NOT_FOUND
        }
    }

    private handleTaskResult(task: TaskObject | TaskPosition, target: TargetTypes | RoomPosition, result: ScreepsReturnCode, taskId: number): void {
        const enemiesNearByTarget = this.manager.enemies.some(e => e.pos.getRangeToCached(target instanceof RoomPosition ? target : target.pos) < 3) ? 1 : 0
        if (enemiesNearByTarget) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **enemies near target**`)
            this.removeTaskByIndex(taskId)
            return
        }

        const resultToText = (result: ScreepsReturnCode): string => {
            switch (result) {
                case OK: return 'OK'
                case ERR_NOT_IN_RANGE: return 'ERR_NOT_IN_RANGE'
                case ERR_BUSY: return 'ERR_BUSY'
                case ERR_FULL: return 'ERR_FULL'
                case ERR_INVALID_TARGET: return 'ERR_INVALID_TARGET'
                case ERR_NOT_ENOUGH_RESOURCES: return 'ERR_NOT_ENOUGH_RESOURCES'
                case ERR_NOT_FOUND: return 'ERR_NOT_FOUND'
                case ERR_NOT_OWNER: return 'ERR_NOT_OWNER'
                case ERR_NO_BODYPART: return 'ERR_NO_BODYPART'
                case ERR_NO_PATH: return 'ERR_NO_PATH'
                default: return result.toString()
            }
        }
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **task result:** ${result} ${resultToText(result)}`)

        if (result === ERR_NOT_IN_RANGE) {
            // if (this.creep.name === 'S1') {
            //     console.log('S1 not in range', JSON.stringify(task))
            // }

            if (task.blocking === true) {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **not in range** task will be removed from list as its blocking`)
                this.removeTaskByIndex(taskId)
                return
            }

            if (this.creepCompletedActions.has('move')) return

            if ((target instanceof RoomPosition && target.roomName !== this.creep.room.name) || ('roomName' in target && target.roomName !== this.creep.room.name)) {
                // Move towards target room
                const exitDir = this.creep.room.findExitTo(target.roomName)
                // console.log('exitDir', exitDir)

                if (exitDir !== ERR_NO_PATH && exitDir !== ERR_INVALID_ARGS) {
                    const exitPos = this.creep.pos.findClosestByPath(exitDir)
                    // console.log('exitPos', exitPos)

                    if (exitPos) {
                        const result = this.creep.moveTo(exitPos)
                        // console.log('result', result)
                        if (result === OK) {
                            this.creepCompletedActions.add('move')
                        } else if (result === ERR_NO_PATH) {
                            // console.log('no path found, removing task')
                            this.removeTaskByIndex(taskId)
                        }
                    }
                }
            } else if (OK === this.creep.moveTo(target)) {
                this.creepCompletedActions.add('move')
            }
        }
        else if (result === OK || result === ERR_NOT_ENOUGH_RESOURCES || result === ERR_FULL || result === ERR_INVALID_TARGET) { // easy way to complete task
            this.removeTaskByIndex(taskId)
        }
        else if (result === ERR_BUSY) { // wait until next tick
            task.waiting = true
        }
        else {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `#ff6969[**untracked task result:**] ${result}`, `**target:** ${target}`, '**task:**', { ...task })
        }
    }

    private executeMove(target: TargetTypes | RoomPosition, task?: TaskPosition): ScreepsReturnCode {

        const targetPosition = target instanceof RoomPosition ? target : target.pos

        if (this.creep.room.name !== targetPosition.roomName) {
            // Move towards target room
            const exitDir = this.creep.room.findExitTo(targetPosition.roomName)

            if (exitDir === ERR_NO_PATH || exitDir === ERR_INVALID_ARGS) {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **executeMove** no exit found to target room: ${targetPosition.roomName}`)
                return OK // clears the task, another random room will be selected
            }

            const exitPos = this.creep.pos.findClosestByPath(exitDir)

            if (!exitPos) {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **executeMove** no exit pos found to target room: ${targetPosition.roomName}`)
                return OK
            }

            const result = this.creep.moveTo(exitPos)
            if (result === OK) {
                this.creepCompletedActions.add('move')
                return ERR_BUSY
            }

            return result
        }

        if (this.creep.pos.getRangeToCached(targetPosition) <= (task?.pos.range ?? 1)) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **executeMove** creep is already at target: ${targetPosition.x}, ${targetPosition.y}, ${targetPosition.roomName}`)
            return OK
        }

        return ERR_NOT_IN_RANGE
    }

    private executePickup(target: Resource): ScreepsReturnCode {
        if (this.manager.usedCapacity(target) === 0) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **target out of resources**`)
            return ERR_INVALID_TARGET
        }

        if (this.creep.pos.getRangeToCached(target.pos) > 1) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **not in range**`)
            return ERR_NOT_IN_RANGE
        }

        if (this.creepCompletedActions.has('transfer')) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **transfer already completed. waiting until next tick**`)
            return ERR_BUSY
        }

        if (this.manager.config.debug) {
            const amount = Math.min(target.amount, this.creep.store.getFreeCapacity(RESOURCE_ENERGY))
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **pickup amount:** ${amount}`)
        }

        const result = this.creep.pickup(target)

        if (result === OK) {
            this.manager.transfers[this.creep.id] ??= 0
            this.manager.transfers[this.creep.id] += target.amount

            this.manager.transfers[target.id] ??= 0
            this.manager.transfers[target.id] -= target.amount

            this.creepCompletedActions.add('transfer')
        }

        return result
    }

    private executeAttack(target: Creep): ScreepsReturnCode {
        if (this.manager.config.debug) this.manager.log('manageCreeps', `**attack target:** ${target.id}`)

        const hasRangedAttack = this.creep.body.some(part => part.type === RANGED_ATTACK)
        const hasHeal = this.creep.body.some(part => part.type === HEAL)

        if (hasHeal) {
            const healResult = this.creep.heal(target)
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **heal result:** ${healResult}`)
        }

        if (hasRangedAttack) {
            // Check if the target is within ranged attack range
            if (this.creep.pos.getRangeToCached(target.pos) > 4) {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **not in ranged attack range, moving closer**`)
                this.creep.moveTo(target, { visualizePathStyle: { stroke: '#ff0000' } })
                return ERR_BUSY
            }
        } else {
            // Check if the target is within ranged attack range
            if (!this.creep.pos.isNearToCached(target.pos)) {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **not in ranged attack range, moving closer**`)
                this.creep.moveTo(target, { visualizePathStyle: { stroke: '#ff0000' } })
                return ERR_BUSY
            }
        }

        if (hasRangedAttack) {
            // Execute the ranged attack
            const rangedAttackResult = this.creep.rangedAttack(target)
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **ranged attack result:** ${rangedAttackResult}`)

            const retreatDirection = this.creep.pos.getDirectionTo(target.pos)
            if (OK === this.creep.move(((retreatDirection + 4) % 8 + 1) as DirectionConstant)) { // Move in the opposite direction
                this.creepCompletedActions.add('move')
            }

            return ERR_BUSY
        }

        // Execute the melee attack
        const attackResult = this.creep.attack(target)
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **attack result:** ${attackResult}`)

        return ERR_BUSY
    }

    private executeUpgrade(target: StructureController, workPower: number): ScreepsReturnCode {
        const power = workPower * UPGRADE_CONTROLLER_POWER
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **power:** ${power}`)
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **freeCapacity:** ${this.manager.freeCapacity(this.creep)}/${this.creep.store.getFreeCapacity(RESOURCE_ENERGY)}`, `\n  - **usedCapacity:** ${this.manager.usedCapacity(this.creep)}/${this.creep.store.getUsedCapacity(RESOURCE_ENERGY)}`)

        // if a harvester, and more than 4 creeps are upgrading, and there are positions at a source, abort
        // we get in this situation when we have extra harvesters and a source was exhausted during assignment
        // if (creep.role === 'harvester' && this.manager.creepsByTask.upgrade.length >= 4 && this.manager.sourceWalkablePositionsTotal > this.manager.creepsByTask.harvest.length) {
        //     if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **aborting upgrade task**`)
        //     return OK
        // }

        // if (creep.role === 'harvester' &&
        //     this.manager.creepsByRole.mule.length &&
        //     this.manager.creepsByRole.upgrader.length >= 2 &&
        //     this.manager.creepsByRole.harvester.length < this.manager.sourceWalkablePositionsTotal &&
        //     this.manager.containers.length > 0 && this.manager.containers.every(c => !this.manager.freeCapacity(c))
        // ) {
        //     if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **aborting upgrade task** `)
        //     return OK
        // }

        // if there is no energy, wait until next tick for resources to be available
        if (this.creep.store.getUsedCapacity(RESOURCE_ENERGY) < power) {
            if (this.manager.usedCapacity(this.creep) >= power) {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **wait until next tick for resources to be available**`)
                return ERR_BUSY
            } else {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **not enough resources**`)
                return ERR_NOT_ENOUGH_RESOURCES
            }
        }

        if (this.creep.pos.getRangeToCached(target.pos) > 4) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **not in range**`)
            return ERR_NOT_IN_RANGE
        }

        // if (this.manager.roomEnergyPercentage < 90 && this.creep.role !== 'upgrader') {
        //     const ticksLeft = this.manager.usedCapacity(this.creep) / this.creep.workPower('upgrade')
        //     if (ticksLeft % 10 === 0 && ticksLeft < 10) {
        //         if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **ticks left:** ${ticksLeft} removing task`)

        //         // remove the task
        //         this.creep.removeTask(this.creep.tasks.findIndex(t => t.action === 'upgrade'))
        //     }
        // }

        if (this.creepCompletedActions.has('work')) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **work already completed. waiting until next tick**`)
            return ERR_BUSY
        }

        const result = this.creep.upgradeController(target)

        if (result === OK) {
            this.manager.transfers[this.creep.id] ??= 0
            this.manager.transfers[this.creep.id] -= power
            this.manager.transfers[target.id] ??= 0
            this.manager.transfers[target.id] += power

            this.creepCompletedActions.add('work')

            if (this.manager.usedCapacity(this.creep) >= power) {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **enough energy to continue upgrading**`)
                return ERR_BUSY
            }
        }

        return result as ScreepsReturnCode
    }

    private executeHarvest(target: Source, workPower: number): ScreepsReturnCode {
        const power = workPower * HARVEST_POWER
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **power:** ${power}`)
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **freeCapacity:** ${this.manager.freeCapacity(this.creep)}/${this.creep.store.getFreeCapacity(RESOURCE_ENERGY)}`, `\n  - **usedCapacity:** ${this.manager.usedCapacity(this.creep)}/${this.creep.store.getUsedCapacity(RESOURCE_ENERGY)}`)
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **sourceWalkablePositions:** ${target.walkablePositions}`)

        // how many harvesters are at this source?
        const harvestersAtSource = this.manager.creepsByTask.harvest.filter(c => c.id !== this.creep.id && c.pos.isNearToCached(target.pos)).length
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **other harvesters at source:** ${harvestersAtSource} **positions:** ${target.walkablePositions}`)

        // is this sort over assigned?
        if (harvestersAtSource >= target.walkablePositions) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **source over assigned**`)
            return ERR_INVALID_TARGET
        }

        if (this.manager.usedCapacity(target) === 0 && target.ticksToRegeneration > this.creep.pos.getRangeToCached(target.pos)) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **target out of resources**`)
            return ERR_INVALID_TARGET
        }

        if (!this.creep.pos.isNearToCached(target.pos)) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **not in range**`)
            return ERR_NOT_IN_RANGE
        }

        if (this.creep.store.getFreeCapacity(RESOURCE_ENERGY) < power) { // not enough resources
            if (!this.manager.freeCapacity(this.creep)) { // wait until next tick for resources to be available
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **full**`)
                return ERR_FULL
            }
        }

        if (this.creepCompletedActions.has('work')) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **work already completed. waiting until next tick**`)
            return ERR_BUSY
        }

        const result = this.creep.harvest(target)
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **result:** ${result}`)

        if (result === OK) {
            this.manager.transfers[this.creep.id] ??= 0
            this.manager.transfers[this.creep.id] += workPower * HARVEST_POWER
            this.manager.transfers[target.id] ??= 0
            this.manager.transfers[target.id] -= workPower * HARVEST_POWER

            this.creepCompletedActions.add('work')

            if (this.manager.freeCapacity(this.creep) > 0) {
                return ERR_BUSY
            }
        }

        return result
    }

    private executeBuild(target: ConstructionSite, workPower: number): ScreepsReturnCode {
        const power = workPower * BUILD_POWER
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **power:** ${power}`)
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **freeCapacity:** ${this.manager.freeCapacity(this.creep)}/${this.creep.store.getFreeCapacity(RESOURCE_ENERGY)}`, `\n  - **usedCapacity:** ${this.manager.usedCapacity(this.creep)}/${this.creep.store.getUsedCapacity(RESOURCE_ENERGY)}`)

        if (this.creep.store.getUsedCapacity(RESOURCE_ENERGY) < power) { // not enough resources
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **usedCapacity:** ${this.manager.usedCapacity(this.creep)}/${this.creep.store.getUsedCapacity(RESOURCE_ENERGY)}`)
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **freeCapacity:** ${this.manager.freeCapacity(this.creep)}/${this.creep.store.getFreeCapacity(RESOURCE_ENERGY)}`)

            if (this.manager.usedCapacity(this.creep) >= power) { // wait until next tick for resources to be available
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **wait until next tick for resources to be available**`)
                return ERR_BUSY
            } else {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **not enough resources**`)
                return ERR_NOT_ENOUGH_RESOURCES
            }
        }

        const range = this.creep.pos.getRangeToCached(target.pos)
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **range:** ${range}`)
        if (range > 4) { // not in range
            return ERR_NOT_IN_RANGE
        }

        if (this.creepCompletedActions.has('work')) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **work already completed** waiting until next tick`)
            return ERR_BUSY
        }

        const result = this.creep.build(target)
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **result:** ${result}`)

        if (result === OK && !this.creepCompletedActions.has('move')) {
            const nearestFlag = this.manager.flags.find(f => f.pos.getRangeToCached(target.pos) < 4)
            if (nearestFlag) {
                const result = this.creep.moveTo(nearestFlag.pos)
                if (result === OK) {
                    this.creepCompletedActions.add('move')
                }
            }
        }

        if (result === OK) {
            this.manager.transfers[this.creep.id] ??= 0
            this.manager.transfers[this.creep.id] -= power
            this.manager.transfers[target.id] ??= 0
            this.manager.transfers[target.id] += power

            this.creepCompletedActions.add('work')

            if (this.manager.usedCapacity(this.creep) >= power * 2) {
                return ERR_BUSY
            } else if (this.manager.usedCapacity(this.creep) >= power) {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **almost out of resources** looking for container near by`)

                const containerNearBy = this.manager.containers
                    .filter(c => this.manager.usedCapacity(c) > this.manager.freeCapacity(this.creep) && this.creep.pos.isNearToCached(c.pos))
                    .shift()

                if (containerNearBy) {
                    if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **found container near by:** ${containerNearBy?.id}`)

                    this.creep.addTask({ id: containerNearBy.id, action: 'withdraw', blocking: true } as TaskObject, true)
                    return ERR_BUSY
                } else if (!this.creepCompletedActions.has('move')) {

                    // is there a container closer by that we can use?
                    const containerNearBy = this.manager.containers
                        .filter(c => this.manager.usedCapacity(c) >= this.manager.freeCapacity(this.creep) && this.creep.pos.getRangeToCached(c.pos) < 3)
                        .shift()

                    if (containerNearBy) {
                        const directionToContainer = this.creep.pos.getDirectionTo(containerNearBy.pos)

                        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **found container near by:** ${containerNearBy?.id}. distance: ${this.creep.pos.getRangeToCached(containerNearBy.pos)} direction: ${directionToContainer}`)

                        if (OK === this.creep.move(directionToContainer)) {
                            this.creepCompletedActions.add('move')
                        }

                        return ERR_BUSY
                    }
                }

                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **out of resources** no container near by`)
                return ERR_NOT_ENOUGH_RESOURCES
            }
        }

        return result
    }

    private executeRepair(target: Structure, workPower: number): ScreepsReturnCode {
        const power = workPower * REPAIR_POWER
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **power:** ${power}`)
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **freeCapacity:** ${this.manager.freeCapacity(this.creep)}/${this.creep.store.getFreeCapacity(RESOURCE_ENERGY)}`, `\n  - **usedCapacity:** ${this.manager.usedCapacity(this.creep)}/${this.creep.store.getUsedCapacity(RESOURCE_ENERGY)}`)

        if (this.creep.store.getUsedCapacity(RESOURCE_ENERGY) < power) { // not enough resources
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **usedCapacity:** ${this.manager.usedCapacity(this.creep)}/${this.creep.store.getUsedCapacity(RESOURCE_ENERGY)}`)
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **freeCapacity:** ${this.manager.freeCapacity(this.creep)}/${this.creep.store.getFreeCapacity(RESOURCE_ENERGY)}`)

            if (this.manager.usedCapacity(this.creep) >= power) { // wait until next tick for resources to be available
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **wait until next tick for resources to be available**`)
                return ERR_BUSY
            } else {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **not enough resources**`)
                return ERR_NOT_ENOUGH_RESOURCES
            }
        }

        const range = this.creep.pos.getRangeToCached(target.pos)
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **range:** ${range}`)
        if (range > 4) { // not in range
            return ERR_NOT_IN_RANGE
        }

        if (this.creepCompletedActions.has('work')) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **work already completed** waiting until next tick`)
            return ERR_BUSY
        }

        const result = this.creep.repair(target)
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **result:** ${result}`)

        if (result === OK && !this.creepCompletedActions.has('move')) {
            const nearestFlag = this.manager.flags.find(f => f.pos.getRangeToCached(target.pos) <= 4)
            if (nearestFlag) {
                const result = this.creep.moveTo(nearestFlag.pos)
                if (result === OK) {
                    this.creepCompletedActions.add('move')
                }
            }
        }

        if (result === OK) {
            this.manager.transfers[this.creep.id] ??= 0
            this.manager.transfers[this.creep.id] -= power
            this.manager.transfers[target.id] ??= 0
            this.manager.transfers[target.id] += power

            this.creepCompletedActions.add('work')

            if (this.manager.usedCapacity(this.creep) >= power) {
                return ERR_BUSY
            } else if (this.manager.usedCapacity(target) === 0) {

                const containerNearBy = this.manager.containers
                    .filter(c => this.manager.usedCapacity(c) > this.manager.freeCapacity(this.creep))
                    .sort((a, b) => a.pos.getRangeToCached(target.pos) - b.pos.getRangeToCached(target.pos))
                    .shift()

                if (containerNearBy) {
                    this.creep.addTask({ id: containerNearBy.id, action: 'withdraw', blocking: true } as TaskObject, true)
                    return ERR_BUSY
                }

                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **out of resources**`)
                return ERR_NOT_ENOUGH_RESOURCES
            }
        }

        return result
    }

    private executeTransfer(target: Structure<StructureConstant>, amount: number | undefined = undefined): ScreepsReturnCode {
        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **freeCapacity:** ${this.manager.freeCapacity(this.creep)}/${this.creep.store.getFreeCapacity(RESOURCE_ENERGY)}`, `\n  - **usedCapacity:** ${this.manager.usedCapacity(this.creep)}/${this.creep.store.getUsedCapacity(RESOURCE_ENERGY)}`)

        // if (this.creep.role !== 'mule') {
        //     // other creeps assigned to transfer to this container
        //     const otherCreepsAssignedToTransfer = this.manager.creepsByTask.transfer.filter(c =>
        //         c.id !== this.creep.id &&
        //         c.pos.getRangeToCached(target.pos) < this.creep.pos.getRangeToCached(target.pos)
        //     )

        //     if (otherCreepsAssignedToTransfer.length > 0) {
        //         const freeCapacity = this.manager.usedCapacity(target)
        //         const usedCapacityByOtherCreeps = otherCreepsAssignedToTransfer.reduce((sum, c) => sum + this.manager.usedCapacity(c), 0)

        //         if (usedCapacityByOtherCreeps > freeCapacity) {
        //             console.log(this.creep.name, `distance: ${this.creep.pos.getRangeToCached(target.pos)} otherCreepsAssignedToTransfer`, otherCreepsAssignedToTransfer.map(c => `${c.name} ${c.pos.getRangeToCached(target.pos)}`), `usedCapacityByOtherCreeps: ${usedCapacityByOtherCreeps} target freeCapacity: ${this.manager.freeCapacity(target)}`)
        //             this.manager.log('manageCreeps', `  - **<h1 style="color: red;">invalid target</h1>**`)
        //             this.manager.log('manageCreeps', `  - **distance:** ${this.creep.pos.getRangeToCached(target.pos)}`)
        //             this.manager.log('manageCreeps', `  - **otherCreepsAssignedToTransfer:** ${otherCreepsAssignedToTransfer.map(c => `${c.name} ${c.pos.getRangeToCached(target.pos)}`)}`)
        //             this.manager.log('manageCreeps', `  - **usedCapacityByOtherCreeps:** ${usedCapacityByOtherCreeps}`)
        //             this.manager.log('manageCreeps', `  - **target freeCapacity:** ${this.manager.freeCapacity(target)}`)

        //             return ERR_INVALID_TARGET
        //         }
        //     }
        // }


        // basically preventing an issue where upgraders may be transversing the map to withdraw from a source, meanwhile a mule just refilled the container near controller.
        if (this.creep.role === 'mule' && this.manager.containersNearSpawns.some(c => c.id === target.id)) {
            const upgradersWithdrawFromSpawn = this.manager.creepsByRole.upgrader.filter(c => c.hasTask('withdraw', target.id))

            upgradersWithdrawFromSpawn.forEach(c => {
                const taskIndex = c.tasks.findIndex(t => t.action === 'withdraw' && 'id' in t && t.id === target.id)
                if (taskIndex !== -1) {
                    c.manager.removeTaskByIndex(taskIndex, true)
                }
            })
        }

        // if transfering to a container near spawn, and room not at full capacity, return
        // we got here because a creep was assigned to transfer to a container near spawn, but the room is not at full capacity since assigned to a refillable
        // if (this.manager.containersNearSpawns.some(c => c.id === target.id) && this.manager.energyAvailable < this.manager.energyCapacityAvailable) {
        //     return ERR_INVALID_TARGET
        // }

        if (this.manager.usedCapacity(this.creep) === 0) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **not enough resources**`)
            return ERR_NOT_ENOUGH_RESOURCES
        }

        if (this.manager.freeCapacity(target) === 0) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **full**`)
            return ERR_FULL
        }

        if (!this.creep.pos.isNearToCached(target.pos)) { // not in range
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **not in range**`)
            return ERR_NOT_IN_RANGE
        }

        if (this.creepCompletedActions.has('transfer')) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **transfer already completed** waiting until next tick`)
            return ERR_BUSY
        }

        if (this.creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0 && this.creep.pos.getRangeToCached(target.pos) > 1) {
            if (this.manager.usedCapacity(this.creep) > 0) {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **wait until next tick for resources to be available**`)
                return ERR_BUSY // wait until next tick for resources to be available
            } else {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **not enough resources**`)
                return ERR_NOT_ENOUGH_RESOURCES // done
            }
        }

        amount = amount ?? Math.min((target as StructureContainer).store.getFreeCapacity(RESOURCE_ENERGY), this.creep.store.getUsedCapacity(RESOURCE_ENERGY))

        const result = this.creep.transfer(target, RESOURCE_ENERGY, amount)

        if (result === OK) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **transferred:** amount: ${amount} target: ${target.id}`)

            this.manager.transfers[this.creep.id] ??= 0
            this.manager.transfers[this.creep.id] -= amount
            this.manager.transfers[target.id] ??= 0
            this.manager.transfers[target.id] += amount

            this.creepCompletedActions.add('transfer')
        }

        return result
    }

    private executeWithdraw(target: StructureContainer): ScreepsReturnCode {
        if (!target || 'store' in target === false) return ERR_INVALID_TARGET

        if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **freeCapacity:** ${this.manager.freeCapacity(this.creep)}/${this.creep.store.getFreeCapacity(RESOURCE_ENERGY)}`, `\n  - **usedCapacity:** ${this.manager.usedCapacity(this.creep)}/${this.creep.store.getUsedCapacity(RESOURCE_ENERGY)}`)

        if (!this.creep.pos.isNearToCached(target.pos)) { // not in range
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **not in range**`)
            return ERR_NOT_IN_RANGE
        }

        if (this.creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            if (this.manager.freeCapacity(this.creep) > 0) {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **wait until next tick for resources to be available**`)
                return ERR_BUSY // wait until next tick for resources to be available
            } else {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **not enough resources**`)
                return ERR_NOT_ENOUGH_RESOURCES // done
            }
        }

        if (target.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            if (this.manager.usedCapacity(target) > 0) {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **wait until next tick for resources to be available**`)
                return ERR_BUSY // wait until next tick for resources to be available
            } else {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **not enough resources**`)
                return ERR_NOT_ENOUGH_RESOURCES // done
            }
        }

        if (this.creepCompletedActions.has('transfer')) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **transfer already completed** waiting until next tick`)
            return ERR_BUSY
        }

        const amount = Math.min(target.store.getUsedCapacity(RESOURCE_ENERGY), this.creep.store.getFreeCapacity(RESOURCE_ENERGY))

        const result = this.creep.withdraw(target, RESOURCE_ENERGY)

        if (result === OK) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **withdrew:** ${target.id} amount: ${amount}`)

            this.manager.transfers[this.creep.id] ??= 0
            this.manager.transfers[this.creep.id] += amount
            this.manager.transfers[target.id] ??= 0
            this.manager.transfers[target.id] -= amount

            this.creepCompletedActions.add('transfer')
        }

        return result
    }

    private executeRenew(target: StructureSpawn): ScreepsReturnCode {
        if (this.creep.ticksToLive && this.creep.ticksToLive > 1400 || target.spawning) {
            return ERR_INVALID_TARGET
        }

        if (!this.creep.pos.isNearToCached(target.pos)) { // not in range
            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **not in range**`)
            return ERR_NOT_IN_RANGE
        }

        const result = target.renewCreep(this.creep)

        if (result === ERR_NOT_ENOUGH_RESOURCES) {
            return ERR_BUSY
        }
        else if (result === OK) {
            const creepCost = this.creep.body.reduce((sum, part) => sum + BODYPART_COST[part.type], 0)
            const costToRenew = Math.ceil(creepCost / 2.5 / this.creep.body.length)

            if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **cost to renew:** ${costToRenew}`)

            this.manager.transfers[target.id] ??= 0
            this.manager.transfers[target.id] -= costToRenew

            if (this.manager.usedCapacity(this.creep) > 0 && !this.creep.hasTaskByAction('transfer') && !this.creep.hasTaskByAction('withdraw')) {
                this.creep.addTask({
                    id: target.id,
                    action: 'transfer',
                    blocking: true,
                } as TaskObject, true)

                if (this.manager.freeCapacity(this.creep) > 0) {
                    const containerNearBy = this.manager.containersNearSpawns
                        .filter(c => this.manager.usedCapacity(c) > 0 && this.creep.pos.isNearToCached(c.pos))
                        .shift()

                    if (containerNearBy) {
                        this.creep.addTask({
                            id: containerNearBy.id,
                            action: 'withdraw',
                            blocking: true,
                        } as TaskObject, true)
                    }
                }
            }

            // if (this.manager.usedCapacity(target) < costToRenew) {
            //     return OK
            // }

            return ERR_BUSY
        }

        return result
    }

    private executeClaim(target: RoomPosition, task?: TaskPosition): ScreepsReturnCode {
        if (this.creep.room.name === target.roomName) {
            const controller = this.creep.room.controller

            if (this.creep.pos.getRangeToCached(target) > 2) {
                return ERR_NOT_IN_RANGE
            }

            if (controller) {
                if (controller.my) {
                    if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **claim controller:** ${controller.id} (already claimed by ${controller.owner!.username})`)
                    return OK
                }

                if (task) {
                    task.pos.x = controller.pos.x
                    task.pos.y = controller.pos.y
                }

                const ownedRooms = Object.values(Game.rooms).filter(room => room.controller?.my).length
                if (ownedRooms >= Game.gcl.level) {
                    this.creep.signController(controller, 'Future Territory of MadDog 🤠')
                }

                const result = ownedRooms >= Game.gcl.level ? this.creep.reserveController(controller) : this.creep.claimController(controller)

                // console.log(this.creep.name, 'claim', target, result, ownedRooms, Game.gcl.level)

                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **claim result:** ${result}`)

                if (result === OK) {
                    if (this.manager.config.build) {
                        if (this.manager.config.build.spawnPos) {
                            this.manager.room.createConstructionSite(this.manager.config.build.spawnPos.x, this.manager.config.build.spawnPos.y, STRUCTURE_SPAWN)
                        }
                    }
                } else if (result === ERR_GCL_NOT_ENOUGH) {
                    this.creep.reserveController(controller)
                    if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **not enough resources to claim controller**`)
                    return ERR_BUSY
                }

                return result as ScreepsReturnCode
            }


            return ERR_INVALID_TARGET
        }

        return ERR_NOT_IN_RANGE
    }

    private executeScout(target: RoomPosition): ScreepsReturnCode {
        if (target.roomName === this.creep.room.name) {
            return OK
        }

        if (target.roomName !== this.creep.room.name) {
            return ERR_NOT_IN_RANGE
        }

        const nextRoom = this.manager.getUnseenAdjacentRooms()
            .sort(() => Math.random() - 0.5)
            .shift()

        if (nextRoom) {
            this.creep.addTask({
                action: 'scout',
                pos: { x: 25, y: 25, roomName: nextRoom }
            } as TaskPosition)

            return ERR_NOT_IN_RANGE
        }

        const nextStaleRoom = this.manager.getUnseenRoomsIfStale()
            .sort(() => Math.random() - 0.5)
            .shift()

        if (nextStaleRoom) {
            this.creep.addTask({
                action: 'scout',
                pos: { x: 25, y: 25, roomName: nextStaleRoom }
            } as TaskPosition)

            return ERR_NOT_IN_RANGE
        }

        return OK
    }

    private creepFindTasks(): void {
        if (this.creep.hasTasks() || this.creep.spawning) {
            return
        }
        const bestTasks = this.findBestTask()

        if (bestTasks.length > 0) {
            const bestTask = bestTasks.shift()

            if (bestTask) {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `\n#00fff4[**New Task Found:**] task: ${bestTask.task} score: ${bestTask.score} target: ${String(bestTask.target)}`)

                if (bestTask.target instanceof RoomPosition) {
                    this.creep.addTask({
                        action: bestTask.task,
                        pos: bestTask.target
                    } as TaskPosition)
                } else {
                    this.creep.addTask({
                        action: bestTask.task,
                        id: bestTask.target.id,
                    })
                }
            }
        }
    }

    public manageCreepTasks() {
        if (this.creep.spawning) return

        if (this.manager.config.debug) this.manager.log('manageCreeps', `\n#5aff6f[##${this.creep.name} processing tasks:##] `, this.creep.tasks.map(t => t.action).join(', '))

        this.creepFindTasks()

        const myFlag = Object.values(Game.flags).find(f => f.name === this.creep.name)
        if (myFlag) {
            this.creep.tasks = []

            if (this.creep.pos.isEqualTo(myFlag.pos)) {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **flag found:** ${myFlag.name}`)
                myFlag.remove()
            } else {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **flag found:** moving to position ${myFlag.pos}`)
                this.creep.moveTo(myFlag.pos)
            }
            return
        }

        const getTarget = (task: TaskObject): TargetTypes | RoomPosition | undefined => {
            // if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **getTarget:** ${task.action}`, { ...task })

            if (task.action === 'attack') {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **getTarget:** attack`, { ...task }, this.manager.enemies)
            }

            switch (task.action) {
                case 'harvest': return [...this.manager.sources, ...this.manager.remoteSources].find(source => source.id === task.id)
                case 'build': return this.manager.constructionSites.find(site => site.id === task.id)
                case 'repair': return this.manager.needsRepair.find(structure => structure.id === task.id)
                case 'transfer':
                case 'withdraw': return Game.getObjectById<TargetTypes>(task.id) as TargetTypes
                case 'upgrade': return this.manager.controller
                case 'renew':
                case 'recycle': task.persistent = true; return this.manager.spawns.find(spawn => spawn.id === task.id)
                case 'pickup': return this.manager.droppedResources.find(resource => resource.id === task.id)
                case 'attack': return this.manager.enemies.find(enemy => enemy.id === task.id) as Creep
                case 'claim':
                case 'scout':
                case 'move': return 'pos' in task && typeof task.pos === 'object' && task.pos !== null && 'x' in task.pos && 'y' in task.pos && 'roomName' in task.pos ? new RoomPosition(task.pos.x as number, task.pos.y as number, task.pos.roomName as string) : undefined

                default: if (this.manager.config.debug) this.manager.log('manageCreeps', '#ff6969[**untracked task action:**]', task.action); return undefined
            }
        }

        let i = 0
        while (this.creep.tasks.length > 0) {
            i++
            if (i > 4) {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `<h1>**manageCreep:**</h1> infinite loop`)
                if (this.manager.config.debug) this.manager.log('manageCreeps', '**local.usedCapacity:**', this.manager.usedCapacity(this.creep))
                if (this.manager.config.debug) this.manager.log('manageCreeps', '**local.freeCapacity:**', this.manager.freeCapacity(this.creep))
                if (this.manager.config.debug) this.manager.log('manageCreeps', '**store.usedCapacity:**', this.creep.store.getUsedCapacity(RESOURCE_ENERGY))
                if (this.manager.config.debug) this.manager.log('manageCreeps', '**store.freeCapacity:**', this.creep.store.getFreeCapacity(RESOURCE_ENERGY))
                break
            }

            const taskId = this.creep.tasks.findIndex(t => !t.completed && !t.waiting && ('id' in t || 'pos' in t))
            if (taskId === -1) break

            const task = this.creep.tasks[taskId] as TaskObject

            task.completed = true

            const target = getTarget(task)
            if (!target) {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `**target not found:** clearing action: ${task.action}`)
                this.removeTaskByIndex(taskId)
                continue
            }

            if (target instanceof RoomPosition && target.roomName !== this.room.name) {
                this.handleTaskResult(task, target, ERR_NOT_IN_RANGE, taskId)
            } else if ('pos' in target && target.pos.roomName !== this.room.name) {
                this.handleTaskResult(task, target, ERR_NOT_IN_RANGE, taskId)
            } else {
                const result = this.executeTask(task, target)
                this.handleTaskResult(task, target, result, taskId)
            }

            if (task.persistent && !task.deleted) {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **persistent task:** ${task.action}`)
                break
            }
        }

        this.creep.tasks.forEach(t => {
            t.completed = undefined
            t.waiting = undefined
        })

        if (!this.creep.tasks.length) {
            if (this.manager.config.debug) this.manager.log('manageCreeps', `\n#ff6969[**no tasks left to process**]`)

            let nearestPositionToLook = this.creep.pos

            const mules = this.manager.creepsByRole.mule.filter(c => !c.spawning)

            if (mules.length && this.creep.name === mules[0].name && this.manager.linksNearSpawns.length) {
                nearestPositionToLook = this.manager.linksNearSpawns[0].pos
            }
            else if (mules.length > 1 && this.creep.name === mules[1].name && this.manager.linksNearSources.length) {
                nearestPositionToLook = this.manager.linksNearSources[0].pos
            }
            else if (mules.length > 2 && this.creep.name === mules[2].name && this.manager.linksNearController.length) {
                nearestPositionToLook = this.manager.linksNearController[0].pos
            }
            else if (this.creep.role === 'harvester') {
                const flag = this.manager.flags
                    .find(f => this.manager.sources.some(s => f.pos.getRangeToCached(s.pos) <= 6))

                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **harvester flag found:** ${flag?.name}`)

                if (flag) {
                    nearestPositionToLook = flag.pos
                }
            }
            else if (this.creep.role === 'upgrader') {
                const flag = this.manager.flags
                    .find(f => f.pos.getRangeToCached(this.manager.room!.controller!.pos) <= 8)

                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **upgrader flag found:** ${flag?.name}`)

                if (flag) {
                    nearestPositionToLook = flag.pos
                }
            }

            const nearestFlag = this.manager.flags
                .sort((a, b) => nearestPositionToLook.getRangeToCached(a.pos) - nearestPositionToLook.getRangeToCached(b.pos))
                .shift()

            if (nearestFlag && this.creep.pos.getRangeToCached(nearestFlag.pos) >= 1) {
                if (this.manager.config.debug) this.manager.log('manageCreeps', `  - **moving to flag:** ${nearestFlag.name} position: ${nearestFlag.pos} distance: ${this.creep.pos.getRangeToCached(nearestFlag.pos)}`)

                const result = this.creep.moveTo(nearestFlag.pos)
                if (result === OK) {
                    this.creepCompletedActions.add('move')
                }
            }
        }


        this.manager.creepsByTask = TASK_ACTIONS.reduce((acc, task) => {
            acc[task] = this.manager.creeps.filter(c => c.hasTaskByAction(task))
            return acc
        }, {} as Record<TaskAction, Creep[]>)



        if (this.manager.config.debug) this.manager.log('manageCreeps',
            '\n#2badff[**ℹ️tasks summary:**]',
            '\n  - **tasks left:** ', !this.creep.tasks.length ? 'none' : this.creep.tasks
                .map(t => {
                    const workPower = this.creep.workPower(t.action)
                    const ticksLeft = this.manager.freeCapacity(this.creep) / workPower
                    return `${t.action} (ticks left: ${ticksLeft})`
                })
                .join(', '),
            '\n  - **actions completed:** ', !this.creepCompletedActions.size ? 'none' : Array.from(this.creepCompletedActions).join(', '),
            `\n  - **freeCapacity:** shadow store: ${this.manager.freeCapacity(this.creep)} store: ${this.creep.store.getFreeCapacity(RESOURCE_ENERGY)}`,
            `\n  - **usedCapacity:** shadow store: ${this.manager.usedCapacity(this.creep)} store: ${this.creep.store.getUsedCapacity(RESOURCE_ENERGY)}`
        )
    }

    public workPower(action: string): number {
        const workParts = this.creep.body.filter(b => b.type === WORK).length
        if (!workParts) return 0

        if (action === 'harvest') return workParts * HARVEST_POWER
        if (action === 'build') return workParts * BUILD_POWER
        if (action === 'upgrade') return workParts * UPGRADE_CONTROLLER_POWER

        return 0
    }
}

export default CreepManager
