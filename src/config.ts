declare global {
    interface RoomConfig {
        creeps: {
            [key: string]: CreepRoleConfig
        },
        build: {
            enabled: boolean
            show_build: boolean
            show_build_levels: boolean
            max_constructions: number
            auto_build_roads_level: number
            auto_build_containers: number
            build_orders: {
                [key: number]: string[]
            }
        }
    }

    interface TaskConfig {
        conditions: string[]
        validates?: string[]
        task: {
            action: string
            target: string
        }
    }

    interface CreepRoleConfig {
        body: BodyPartConstant[],
        max: string,
        conditions: string[],
        tasks: TaskConfig[]
    }
}

interface Config {
    visuals: {
        enabled: boolean
        show_matrix: boolean
        creep_travel: boolean
    }

    rooms: {
        [key: string]: RoomConfig
    }
}

export const CONFIG: Config = {
    visuals: {                                 // visuals
        enabled: false,                         // enable/disable visuals
        show_matrix: false,                    // show pathfinding matrix
        creep_travel: true,                    // show creep paths
    },

    rooms: {
        sim: {                                  // room name
            creeps: {
                harvester: {                    // role
                    body: [WORK, CARRY, MOVE, MOVE],
                    max: "sources().length",

                    conditions: [
                        // "mules.length > 0",
                        // "upgraders.length > 0"
                    ],

                    tasks: [                    // tasks
                        // refill spawn
                        {
                            conditions: [
                                "usedCapacity(creep)", // creep is full
                                //    "spawns().filter(freeCapacity).filter(notOverAssigned).length > 0" // spawn has free capacity
                            ],
                            validates: [
                                "usedCapacity(creep)",
                                "freeCapacity(target)" // Ensure the spawn still has free capacity
                            ],
                            task: {
                                action: "transfer",
                                target: "closestSpawn"
                            }
                        },
                        // harvest source
                        {
                            conditions: [
                                "freeCapacity(creep) > 0" // creep has free capacity
                            ],
                            validates: [
                                "target.energy > 0", // Ensure the source still has energy
                                "freeCapacity(creep)",
                                //    "notOverAssignedSource(target)"
                            ],
                            task: {
                                action: "harvest",
                                target: "closestSource"
                            }
                        },
                        // upgrade room controller
                        {
                            conditions: [
                                "usedCapacity(creep)",
                                "!freeCapacity(closestSpawn())"
                            ],// creep is full and spawn is full
                            validates: [
                                "usedCapacity(creep)",
                                //    "spawns().filter(freeCapacity).filter(notOverAssigned).length === 0" // Ensure the spawn is full
                            ],
                            task: {
                                action: "upgrade",
                                target: "controller"
                            }
                        },
                    ]
                }
            },
            build: {                            // building
                enabled: true,                 // enable/disable auto building
                show_build: true,              // show build orders
                show_build_levels: true,       // show build levels
                max_constructions: 0,           // max number of construction sites to place
                auto_build_roads_level: 3.6,    // build roads at this level
                auto_build_containers: 3.2,     // build containers at this level
                build_orders: {                 // build orders
                    2: [
                        '  E . EE ',
                        '   .A..  ',
                        '         ',
                    ],
                    2.4: [
                        '    .    ',
                        '  E .CEE ',
                        '   .A..  ',
                        '         ',
                        '         ',
                    ],
                    2.8: [
                        '   E.E   ',
                        '  E .CEE ',
                        '  ..A..  ',
                        '    .    ',
                        '         ',
                    ],
                    3: [
                        '   E.ET  ',
                        '  E .CEE ',
                        '  ..A... ',
                        '   C.    ',
                        '         ',
                    ],
                    3.15: [
                        '   E.ET  ',
                        ' EE .CEE ',
                        '  ..A... ',
                        '  EC.  E ',
                        '         ',
                    ],
                    3.3: [
                        '   E.ET  ',
                        ' EE .CEE ',
                        '  ..A... ',
                        ' EEC. EE ',
                        '         ',
                    ],
                    4: [
                        '  .. ..  ',
                        ' .EE.EE. ',
                        '.EEE.ETE.',
                        '.EE .CEE.',
                        ' ...A... ',
                        '.EEC. EE.',
                        '.EEE.EEE.',
                        ' .EE.EE. ',
                        '  .. ..  ',
                    ]
                }
            }
        }
    },
}
