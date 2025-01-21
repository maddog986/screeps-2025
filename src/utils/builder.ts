import { CONFIG } from 'config'
import { ROLE } from './creeps/CreepBaseClass'
import Traveler from './Traveler'
import utils from './utils'

interface LayoutKey {
    [name: string]: BuildableStructureConstant
}

// maps letters in the layout arrays to structures and vice versa
const layoutKey = {
    A: STRUCTURE_SPAWN,
    N: STRUCTURE_NUKER,
    K: STRUCTURE_LINK,
    L: STRUCTURE_LAB,
    E: STRUCTURE_EXTENSION,
    S: STRUCTURE_STORAGE,
    T: STRUCTURE_TOWER,
    O: STRUCTURE_OBSERVER,
    M: STRUCTURE_TERMINAL,
    P: STRUCTURE_POWER_SPAWN,
    ".": STRUCTURE_ROAD,
    C: STRUCTURE_CONTAINER,
    R: STRUCTURE_RAMPART,
    W: STRUCTURE_WALL
} as LayoutKey

interface SimplePositions {
    [name: string]: number[][]
}

function relPoly(room_name: string, x: number, y: number, poly: Array<[number, number]>): RoomPosition[] {
    return poly.map((p) => new RoomPosition(p[0] + x, p[1] + y, room_name))
}

interface Layout {
    room: Room
    x: number
    y: number
    type: STRUCTURE_CONTAINER | STRUCTURE_EXTENSION | STRUCTURE_LAB | STRUCTURE_LINK | STRUCTURE_ROAD | STRUCTURE_RAMPART | STRUCTURE_SPAWN | STRUCTURE_STORAGE | STRUCTURE_TERMINAL | STRUCTURE_TOWER | STRUCTURE_WALL | STRUCTURE_NUKER | STRUCTURE_OBSERVER | STRUCTURE_POWER_SPAWN
    opts?: {
        opacity?: number
    }
}

function visual_structure({ room, x, y, type, opts = {} }: Layout) {
    const colors = {
        dark: "#181818",
        gray: "#555555",
        light: "#AAAAAA",
        outline: "#8FBB93",
        power: "#f4331f ",
        road: "#666",
    }

    const room_visual = new RoomVisual(room.name)

    opts = Object.assign({ opacity: .25 }, opts)

    switch (type) {
        case STRUCTURE_CONTAINER:
            room_visual.rect(x - 0.225, y - 0.3, 0.45, 0.6, {
                fill: "yellow",
                opacity: opts.opacity,
                stroke: colors.dark,
                strokeWidth: 0.10,
            })
            break
        case STRUCTURE_EXTENSION:
            room_visual.circle(x, y, {
                fill: '#b5ffb5',
                opacity: (opts.opacity || 1) * .2,
                radius: 0.34,
            })
            room_visual.circle(x, y, {
                fill: colors.dark,
                opacity: opts.opacity,
                radius: 0.27,
                stroke: colors.gray,
                strokeWidth: 0.05,
            })
            room_visual.circle(x, y, {
                fill: colors.gray,
                opacity: opts.opacity,
                radius: 0.24,
            })

            break

        case STRUCTURE_LAB:
            room_visual.circle(x, y - 0.025, {
                fill: colors.dark,
                opacity: opts.opacity,
                radius: 0.55,
                stroke: colors.outline,
                strokeWidth: 0.05,
            })
            room_visual.circle(x, y - 0.025, {
                fill: colors.gray,
                opacity: opts.opacity,
                radius: 0.40,
            })
            room_visual.rect(x - 0.45, y + 0.3, 0.9, 0.25, {
                fill: colors.dark,
                opacity: opts.opacity,
                stroke: undefined,
            })
            {
                let box = relPoly(room.name, x, y, [
                    [-0.45, 0.3],
                    [-0.45, 0.55],
                    [0.45, 0.55],
                    [0.45, 0.3],
                ])

                room_visual.poly(box as any, {
                    opacity: opts.opacity,
                    stroke: colors.outline,
                    strokeWidth: 0.05,
                })
            }
            break

        case STRUCTURE_LINK: {
            const outer = relPoly(room.name, x, y, [
                [0.0, -0.5],
                [0.4, 0.0],
                [0.0, 0.5],
                [-0.4, 0.0],
            ])
            const inner = relPoly(room.name, x, y, [
                [0.0, -0.3],
                [0.25, 0.0],
                [0.0, 0.3],
                [-0.25, 0.0],
            ])

            outer.push(outer[0])
            inner.push(inner[0])

            room_visual.poly(outer, {
                fill: colors.dark,
                opacity: opts.opacity,
                stroke: colors.outline,
                strokeWidth: 0.05,
            })
            room_visual.poly(inner, {
                fill: colors.gray,
                opacity: opts.opacity,
                stroke: undefined,
            })
            break
        }

        case STRUCTURE_ROAD:
            room_visual.circle(x, y, {
                fill: colors.road,
                opacity: opts.opacity,
                radius: 0.125,
                stroke: undefined,
            })

            // if (room_visual.roads === undefined) {
            //     room_visual.roads = []
            // }
            // room_visual.roads.push([x, y])

            break

        case STRUCTURE_RAMPART:
            room_visual.circle(x, y, {
                radius: 0.6,
                fill: "#00c900",
                stroke: "#00ff00",
                strokeWidth: 0.15,
                opacity: (opts.opacity || 1) * 0.15
            })

            break

        case STRUCTURE_SPAWN:
            room_visual.circle(x, y, {
                fill: colors.dark,
                opacity: opts.opacity,
                radius: 0.70,
                stroke: "#CCCCCC",
                strokeWidth: 0.10,
            })
            break

        case STRUCTURE_STORAGE:
            room_visual.rect(x - 0.3, y - 0.35, 0.55, .7, {
                fill: "#d1c624",
                opacity: opts.opacity,
                stroke: colors.dark,
                strokeWidth: 0.12,
            })
            break

        case STRUCTURE_TERMINAL: {
            const outer = relPoly(room.name, x, y, [
                [0.0, -0.8],
                [0.55, -0.55],
                [0.8, 0.0],
                [0.55, 0.55],
                [0.0, 0.8],
                [-0.55, 0.55],
                [-0.8, 0.0],
                [-0.55, -0.55],
            ])
            const inner = relPoly(room.name, x, y, [
                [0.0, -0.65],
                [0.45, -0.45],
                [0.65, 0.0],
                [0.45, 0.45],
                [0.0, 0.65],
                [-0.45, 0.45],
                [-0.65, 0.0],
                [-0.45, -0.45],
            ])

            outer.push(outer[0])
            inner.push(inner[0])

            room_visual.poly(outer, {
                fill: colors.dark,
                opacity: opts.opacity,
                stroke: colors.outline,
                strokeWidth: 0.05,
            })
            room_visual.poly(inner, {
                fill: colors.light,
                opacity: opts.opacity,
                stroke: undefined,
            })
            room_visual.rect(x - 0.45, y - 0.45, 0.9, 0.9, {
                fill: colors.gray,
                opacity: opts.opacity,
                stroke: colors.dark,
                strokeWidth: 0.1,
            })
            break
        }

        case STRUCTURE_TOWER:
            room_visual.circle(x, y, {
                fill: colors.dark,
                // fill: "transparent",
                opacity: opts.opacity,
                radius: 0.6,
                stroke: colors.outline,
                strokeWidth: 0.05,
            })
            room_visual.rect(x - 0.4, y - 0.3, 0.8, 0.6, {
                fill: colors.gray,
                opacity: opts.opacity,
            })
            room_visual.rect(x - 0.2, y - 0.8, 0.4, 0.45, {
                fill: colors.light,
                opacity: opts.opacity,
                stroke: colors.dark,
                strokeWidth: 0.07,
            })
            break
        /*
         case STRUCTURE_POWER_SPAWN:
         room_visual.circle(x, y, {
         fill: "red",
         opacity: opts.opacity,
         radius: 0.70,
         stroke: "#CCCCCC",
         strokeWidth: 0.10,
         });
         break;
         */
        case STRUCTURE_POWER_SPAWN:
            room_visual.circle(x, y, {
                fill: colors.dark,
                opacity: opts.opacity,
                radius: 0.70,
                stroke: "#CCCCCC",
                strokeWidth: 0.10,
            })
            room_visual.circle(x, y, {
                fill: colors.dark,
                opacity: opts.opacity,
                radius: 0.65,
                stroke: colors.power,
                strokeWidth: 0.10,
            })
            room_visual.circle(x, y, {
                fill: colors.dark,
                opacity: opts.opacity,
                radius: 0.45,
                stroke: colors.power,
                strokeWidth: 0.15,
            })
            break
        case STRUCTURE_NUKER:
            const outline = relPoly(room.name, x, y, [
                [0, -1],
                [-0.47, 0.2],
                [-0.5, 0.5],
                [0.5, 0.5],
                [0.47, 0.2],
                [0, -1],
            ])
            const inline = relPoly(room.name, x, y, [
                [0, -.80],
                [-0.40, 0.2],
                [0.40, 0.2],
                [0, -.80],
            ])

            room_visual.poly(outline, {
                fill: colors.dark,
                opacity: opts.opacity,
                stroke: colors.outline,
                strokeWidth: 0.05,
            })

            room_visual.poly(inline, {
                fill: colors.gray,
                opacity: opts.opacity,
                stroke: colors.outline,
                strokeWidth: 0.01,
            })

        case STRUCTURE_OBSERVER:
            room_visual.circle(x, y, {
                fill: colors.dark,
                opacity: opts.opacity,
                radius: 0.45,
                stroke: colors.outline,
                strokeWidth: 0.07,
            })
            room_visual.circle(x, y + .2, {
                fill: colors.outline,
                opacity: opts.opacity,
                radius: 0.2,
                stroke: undefined,
            })
            break
        case STRUCTURE_WALL:
            room_visual.circle(x, y, {
                radius: 0.3,
                fill: colors.dark,
                stroke: colors.light,
                strokeWidth: 0.05,
                opacity: opts.opacity
            })
            break
        default:
            room_visual.circle(x, y, {
                fill: colors.light,
                opacity: opts.opacity,
                radius: 0.35,
                stroke: colors.dark,
                strokeWidth: 0.20,
            })
            break
    }
}

export const getBuildPositions = function (layout: string[]): SimplePositions {
    if (!layout.length) return {}

    const height = layout.length
    const width = layout[0].length
    const top = Math.floor(height / 2) || 0
    const left = Math.floor(width / 2) || 0
    const positions = {} as SimplePositions

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const char = layout[y][x] as BuildableStructureConstant
            const key = layoutKey[char] as string

            if (!key) continue

            positions[key] = positions[key] || []
            positions[key].push([x - left, y - top])
        }
    }

    return positions
}


export const buildLayout = function (room: Room) {
    const buildOrder = CONFIG.buildOrder[room.name]
    if (!buildOrder) return

    const center_point = room.find(FIND_MY_SPAWNS).pop()
    if (!center_point) return

    if (!room.controller) return

    let controller_level = room.controller?.level || 0
    if (!controller_level) return

    controller_level = controller_level + (room.controller.progress / room.controller?.progressTotal)
    if (Game.time % 10 === 0) console.log("controller_level:", controller_level)

    let all_structures: Array<{ x: number, y: number, structure: string, level: number }> = []

    for (const level in buildOrder) {
        const layout = buildOrder[level]
        if (!layout) continue

        const positions = getBuildPositions(layout)
        if (!positions) continue

        for (const structure in positions) {
            for (const [x, y] of positions[structure]) {
                all_structures.push({ x: center_point.pos.x + x, y: center_point.pos.y + y, structure, level: Number(level) })
            }
        }
    }


    // dynamic structures
    const constructure_sites = room.find(FIND_MY_CONSTRUCTION_SITES)
    const containers = room.find(FIND_STRUCTURES, {
        filter: ({ structureType }) => structureType === STRUCTURE_CONTAINER
    })

    // find a source with all positions with at least one full harvester
    const full_harvesters_near_sources = room.find(FIND_SOURCES, {
        filter: (source) =>
            // find all harvester creeps with target source and no capacity
            utils.creeps({ role: ROLE.harvester, target: source.id, freeCapacity: 0 }).length >= 1
            // no containers near source
            && !containers.some(({ pos }) => source.pos.inRangeTo(pos, 2))
            // no construction sites near source
            && !constructure_sites.some(({ pos }) => source.pos.inRangeTo(pos, 2))
    })

    if (full_harvesters_near_sources.length) {
        for (const full_harvesters_near_source of full_harvesters_near_sources) {
            const optimalPosition = utils.findOptimalPosition(room, full_harvesters_near_source.pos, 1)
            if (optimalPosition) {
                all_structures.push({ x: optimalPosition.x, y: optimalPosition.y, structure: STRUCTURE_CONTAINER, level: 3 })
            }
        }
    }

    const spawns = room.find(FIND_MY_SPAWNS)
    const sources = room.find(FIND_SOURCES)

    // build roads to sources
    for (const spawn of spawns) {
        for (const source of sources) {
            // look for containers near source
            const container_near_source = room.find(FIND_STRUCTURES, {
                filter: ({ pos, structureType }) => structureType === STRUCTURE_CONTAINER && source.pos.inRangeTo(pos, 2)
            }).shift()

            // find a path to the source
            const path_to_source = spawn.pos.findPathTo(container_near_source ? container_near_source.pos : source.pos, {
                range: container_near_source ? 1 : 2,
                ignoreCreeps: true,
                maxOps: 5000,
                maxRooms: 1,
                costCallback: (roomName, costMatrix) => {
                    costMatrix = Traveler.buildRoomCostMatrix(roomName, costMatrix, {
                        swampCost: 1,
                        plainCost: 10,
                        ignoreCreeps: true
                    })

                    for (const { x, y, structure } of all_structures) {
                        if (structure === STRUCTURE_WALL) {
                            costMatrix.set(x, y, 255)
                        } else if (structure === STRUCTURE_ROAD) {
                            costMatrix.set(x, y, 1)
                        } else {
                            costMatrix.set(x, y, 255)
                        }
                    }

                    return costMatrix
                },
            })

            for (const { x, y } of path_to_source) {
                all_structures.push({ x: x, y, structure: STRUCTURE_ROAD, level: 3 })
            }
        }
    }



    // clean up structures data
    all_structures = all_structures
        // remove duplicates from all_structures if there is a lower level
        .filter((v, i, a) => a.findIndex(t => (t.x === v.x && t.y === v.y && t.structure === v.structure) && t.level < v.level) === -1)
        // remove structures if spot is not clear
        .filter(({ x, y }) => {
            const structures = [...room.lookForAt(LOOK_STRUCTURES, x, y), ...room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y)]
            return structures.length === 0
        })



    // do construction sites
    if (CONFIG.buildEnabled && constructure_sites.length <= 3) {
        const structure_closest_to_spawn = all_structures
            // filter out levels higher than controller
            .filter(({ level }) => level <= controller_level)

            // sort by closest to spawn
            .sort((a, b) => {
                const spawn = spawns[0]
                return utils.getRangeTo(spawn.pos.x, spawn.pos.y, a.x, a.y) - utils.getRangeTo(spawn.pos.x, spawn.pos.y, b.x, b.y)
            })

            // make towers first
            .sort((a, b) => {
                if (a.structure === STRUCTURE_TOWER) return -1
                if (b.structure === STRUCTURE_TOWER) return 1

                if (a.structure === STRUCTURE_EXTENSION) return -1
                if (b.structure === STRUCTURE_EXTENSION) return 1

                return 0
            })
            // get first item
            .slice(0, Math.max(1, 3 - constructure_sites.length))

        if (structure_closest_to_spawn.length) {
            structure_closest_to_spawn.forEach(({ x, y, structure }) => {
                console.log(`construct: ${structure}`, room.createConstructionSite(x, y, structure as BuildableStructureConstant))
            })
        }
    }

    // all visualizations
    if (!CONFIG.visualizeRoom) return

    for (const { x, y, structure, level } of all_structures) {
        // if (level > controller_level) continue

        visual_structure({
            room,
            x: x,
            y: y,
            type: structure as any,
            opts: { opacity: 1 }
        })
    }

    const roads = [...all_structures.filter(({ structure }) => structure === STRUCTURE_ROAD),
    ...room.find(FIND_STRUCTURES, { filter: ({ structureType }) => structureType === STRUCTURE_ROAD }).map(({ pos }) => ({ x: pos.x, y: pos.y, level: 3, structure: STRUCTURE_ROAD })),
    ...constructure_sites.filter(({ structureType }) => structureType === STRUCTURE_ROAD).map(({ pos }) => ({ x: pos.x, y: pos.y, level: 3, structure: STRUCTURE_ROAD }))
    ]
        // remove duplicates from all_structures if there is a lower level
        .filter((v, i, a) => a.findIndex(t => (t.x === v.x && t.y === v.y && t.structure === v.structure) && t.level < v.level) === -1)

    for (const { x, y, level } of roads) {
        for (let dx = x - 1; dx <= x + 1; dx++) {
            for (let dy = y - 1; dy <= y + 1; dy++) {
                if (dx === x && dy === y) continue

                if (roads.some(({ x, y }) => x === dx && y === dy)) {
                    room.visual.line(dx, dy, x, y, { color: "#666", opacity: 0.25, width: 0.45 })
                }
            }
        }
    }
}
