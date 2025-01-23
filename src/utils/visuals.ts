export interface Layout {
    room: Room
    x: number
    y: number
    type: STRUCTURE_CONTAINER | STRUCTURE_EXTENSION | STRUCTURE_LAB | STRUCTURE_LINK | STRUCTURE_ROAD | STRUCTURE_RAMPART | STRUCTURE_SPAWN | STRUCTURE_STORAGE | STRUCTURE_TERMINAL | STRUCTURE_TOWER | STRUCTURE_WALL | STRUCTURE_NUKER | STRUCTURE_OBSERVER | STRUCTURE_POWER_SPAWN
    opts?: {
        opacity?: number
    }
}

export interface LayoutKey {
    [name: string]: BuildableStructureConstant
}

// maps letters in the layout arrays to structures and vice versa
export const layoutKey = {
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

function relPoly(room_name: string, x: number, y: number, poly: Array<[number, number]>): RoomPosition[] {
    return poly.map((p) => new RoomPosition(p[0] + x, p[1] + y, room_name))
}

export function visual_structure({ room, x, y, type, opts = {} }: Layout) {
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
                opacity: (opts.opacity || 1) * 0.6,
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
                opacity: (opts.opacity || 1) * 0.6,
                radius: 0.6,
                stroke: colors.outline,
                strokeWidth: 0.05,
            })
            room_visual.rect(x - 0.4, y - 0.3, 0.8, 0.6, {
                fill: colors.gray,
                opacity: (opts.opacity || 1) * 0.6,
            })
            room_visual.rect(x - 0.2, y - 0.8, 0.4, 0.45, {
                fill: colors.light,
                opacity: (opts.opacity || 1) * 0.6,
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
