export type ColonyPhase = 'bootstrap' | 'grow' | 'operate' | 'expand'

export interface RoomSnapshot {
    rcl: number
    controllerLevel: number
    capacity: number
    energy: number
    extensions: number
    sources: number
    walkable: number
    sourceContainers: number
    spawnContainers: number
    controllerContainers: number
    hasStorage: boolean
    hasTower: boolean
    constructionSites: number
    threat: number
    harvesters: number
    mules: number
    autonomyExplore: boolean
    autonomyExpand: boolean
    canClaim: boolean
    hasExpansionTarget: boolean
    remoteSources: number
}

export interface ColonyPolicy {
    phase: ColonyPhase
    taskWeight: Record<TaskAction, number>
    allowRemotes: boolean
    workerBody: BodyPartConstant[]
    minerBody: BodyPartConstant[] | null
    muleBody: BodyPartConstant[]
    builderBody: BodyPartConstant[]
    upgraderBody: BodyPartConstant[]
    defenderBody: BodyPartConstant[]
    harvesterMax: number
    muleMax: number
    builderMax: number
    upgraderMax: number
    defenderMax: number
    scoutMax: number
    claimerMax: number
}

const TASK_ACTIONS: TaskAction[] = [
    'harvest',
    'transfer',
    'upgrade',
    'renew',
    'recycle',
    'build',
    'withdraw',
    'pickup',
    'repair',
    'attack',
    'move',
    'scout',
    'claim',
]

const ZERO_WEIGHTS = TASK_ACTIONS.reduce((acc, action) => {
    acc[action] = 1
    return acc
}, {} as Record<TaskAction, number>)

function weights(overrides: Partial<Record<TaskAction, number>>): Record<TaskAction, number> {
    return { ...ZERO_WEIGHTS, ...overrides }
}

function workerBody(capacity: number): BodyPartConstant[] {
    if (capacity < 250) return [WORK, CARRY, MOVE]
    if (capacity < 400) return [WORK, WORK, CARRY, MOVE]
    if (capacity < 550) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE]
    return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE]
}

function muleBody(capacity: number): BodyPartConstant[] {
    if (capacity < 400) return [CARRY, CARRY, MOVE]
    const body: BodyPartConstant[] = []
    let energy = Math.min(capacity, 600)
    while (energy >= 150 && body.length < 12) {
        body.push(CARRY, CARRY, MOVE)
        energy -= 150
    }
    return body.length ? body : [CARRY, CARRY, MOVE]
}

function upgraderBody(capacity: number): BodyPartConstant[] {
    if (capacity < 400) return [WORK, CARRY, MOVE]
    if (capacity < 550) return [WORK, WORK, CARRY, MOVE]
    const body: BodyPartConstant[] = [MOVE, CARRY]
    let energy = Math.min(capacity, 800) - 100
    while (energy >= 100 && body.filter(p => p === WORK).length < 6) {
        body.push(WORK)
        energy -= 100
    }
    return body
}

function defenderBody(capacity: number): BodyPartConstant[] {
    if (capacity < 330) return [MOVE, ATTACK]
    if (capacity < 460) return [TOUGH, MOVE, MOVE, ATTACK]
    return [TOUGH, MOVE, MOVE, ATTACK, ATTACK]
}

export function resolveColonyPhase(snap: RoomSnapshot): ColonyPhase {
    if (snap.threat >= 2 && snap.rcl >= 3) return snap.hasStorage ? 'operate' : 'grow'
    if (snap.rcl >= 4 && snap.capacity >= 1300 && (snap.hasStorage || snap.sourceContainers >= snap.sources) && snap.threat === 0) {
        return 'expand'
    }
    if (snap.rcl >= 3 && snap.extensions >= 5 && snap.sourceContainers > 0 && snap.hasTower) {
        return 'operate'
    }
    if (snap.rcl >= 2 || snap.extensions > 0) {
        return 'grow'
    }
    return 'bootstrap'
}

export function resolveColonyPolicy(snap: RoomSnapshot): ColonyPolicy {
    const phase = resolveColonyPhase(snap)
    const sources = Math.max(1, snap.sources)
    const walkable = Math.max(sources, snap.walkable)

    if (phase === 'bootstrap') {
        return {
            phase,
            taskWeight: weights({
                harvest: 1.1,
                upgrade: 2.4,
                build: 0.55,
                transfer: 2.1,
                withdraw: 0.3,
                pickup: 1.4,
            }),
            allowRemotes: false,
            workerBody: [WORK, CARRY, MOVE],
            minerBody: null,
            muleBody: [CARRY, CARRY, MOVE],
            builderBody: [WORK, CARRY, MOVE],
            upgraderBody: [WORK, CARRY, MOVE],
            defenderBody: [MOVE, ATTACK],
            harvesterMax: Math.max(3, Math.min(walkable, 5)),
            muleMax: 0,
            builderMax: 0,
            upgraderMax: 0,
            defenderMax: snap.threat >= 2 ? 1 : 0,
            scoutMax: 0,
            claimerMax: 0,
        }
    }

    if (phase === 'grow') {
        const canMine = snap.capacity >= 550 && snap.extensions >= 5 && snap.sourceContainers > 0 && snap.mules > 0
        return {
            phase,
            taskWeight: weights({
                harvest: 1.2,
                upgrade: 1.5,
                build: 1.6,
                transfer: 1.4,
                withdraw: 0.8,
                pickup: 1.2,
            }),
            allowRemotes: false,
            workerBody: workerBody(snap.capacity),
            minerBody: canMine ? [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE] : null,
            muleBody: muleBody(snap.capacity),
            builderBody: workerBody(Math.min(snap.capacity, 400)),
            upgraderBody: upgraderBody(snap.capacity),
            defenderBody: defenderBody(snap.capacity),
            harvesterMax: canMine ? sources : Math.max(3, Math.min(walkable, 4)),
            muleMax: snap.sourceContainers > 0 && snap.harvesters >= 2 ? 1 : 0,
            builderMax: snap.constructionSites > 0 ? 1 : 0,
            upgraderMax: 1,
            defenderMax: snap.threat >= 2 ? 1 : 0,
            scoutMax: 0,
            claimerMax: 0,
        }
    }

    const operateWeights = weights({
        harvest: 1.6,
        upgrade: 1.1,
        build: 1.2,
        transfer: 1.3,
        withdraw: 1.1,
        pickup: 1.3,
        repair: 0.8,
    })

    const staticMiners = snap.capacity >= 550 && snap.extensions >= 5 && snap.sourceContainers > 0 && (snap.mules > 0 || snap.hasStorage)
    const muleMax = Math.min(3,
        snap.sourceContainers
        + (snap.spawnContainers > 0 ? 1 : 0)
        + (snap.controllerContainers > 0 && snap.rcl >= 3 ? 1 : 0)
        + (snap.hasStorage ? 1 : 0)
    )

    if (phase === 'operate') {
        return {
            phase,
            taskWeight: operateWeights,
            allowRemotes: snap.rcl >= 4 && snap.threat === 0,
            workerBody: workerBody(snap.capacity),
            minerBody: staticMiners ? [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE] : null,
            muleBody: muleBody(snap.capacity),
            builderBody: workerBody(Math.min(snap.capacity, 550)),
            upgraderBody: upgraderBody(snap.capacity),
            defenderBody: defenderBody(snap.capacity),
            harvesterMax: staticMiners ? sources + (snap.remoteSources > 0 ? 1 : 0) : Math.max(3, sources + 1),
            muleMax: Math.max(1, muleMax),
            builderMax: snap.constructionSites === 0 ? 0 : (snap.constructionSites >= 4 ? 2 : 1),
            upgraderMax: snap.rcl >= 4 && (snap.controllerContainers > 0 || snap.hasStorage) ? 2 : 1,
            defenderMax: snap.threat >= 2 ? 1 : 0,
            scoutMax: snap.autonomyExplore && snap.threat === 0 ? 1 : 0,
            claimerMax: 0,
        }
    }

    return {
        phase: 'expand',
        taskWeight: { ...operateWeights, scout: 1.2, claim: 1.2, attack: 1.2 },
        allowRemotes: true,
        workerBody: workerBody(snap.capacity),
        minerBody: staticMiners ? [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE] : null,
        muleBody: muleBody(snap.capacity),
        builderBody: workerBody(Math.min(snap.capacity, 550)),
        upgraderBody: upgraderBody(snap.capacity),
        defenderBody: defenderBody(snap.capacity),
        harvesterMax: (staticMiners ? sources : Math.max(3, sources + 1)) + (snap.remoteSources > 0 ? 1 : 0),
        muleMax: Math.max(1, muleMax),
        builderMax: snap.constructionSites === 0 ? 0 : (snap.constructionSites >= 4 ? 2 : 1),
        upgraderMax: snap.hasStorage || snap.controllerContainers > 0 ? 2 : 1,
        defenderMax: snap.threat >= 2 ? 2 : 0,
        scoutMax: snap.autonomyExplore && snap.threat === 0 ? 1 : 0,
        claimerMax: snap.autonomyExpand && snap.canClaim && snap.hasExpansionTarget && snap.threat === 0 ? 1 : 0,
    }
}
