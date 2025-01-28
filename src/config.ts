declare global {
    type DebugLevel = 'basic' | 'detailed'

    interface RoomConfig {
        spawnDelay: number
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
        action: string
        target: string
    }

    interface CreepRoleConfig {
        body: BodyPartConstant[],
        max: string,
        conditions: string[],
        tasks: TaskConfig[]
    }
}

interface Config {
    debug: boolean | DebugLevel

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
    debug: "detailed",                            // enable/disable debugging

    visuals: {                                 // visuals
        enabled: true,                         // enable/disable visuals
        show_matrix: true,                    // show pathfinding matrix
        creep_travel: true,                    // show creep paths
    },

    rooms: {
        sim: {                                  // room name
            spawnDelay: 10,                     // ticks to delay between spawns
            creeps: {
                harvester: {                    // role
                    body: [WORK, CARRY, CARRY, MOVE, MOVE],
                    max: "Math.min(8, Math.max(1, sources().filter(notOverAssigned).reduce((a,b) => a + walkablePositions(b), 0) + (creeps().filter(c => usedCapacity(c) > 45).length * 2) - (creeps().filter(c => usedCapacity(c) < 20).length * 3)))",        // max number of creeps

                    conditions: [
                        // "mules.length > 0",
                        // "upgraders.length > 0"
                    ],

                    tasks: [                    // tasks
                        // refill spawn
                        {
                            action: "transfer",
                            target: "closestSpawn()",
                            conditions: [
                                "usedCapacity(creep)",          // creep is full
                                "freeCapacity(target)",          // Ensure the spawn still has free capacity
                                "notOverAssigned(target)",      // Ensure the spawn is not over assigned
                            ],
                            validates: [
                                "usedCapacity(creep)",
                                "freeCapacity(target)", // Ensure the spawn still has free capacity
                            ],
                        },
                        // refill builder
                        {
                            action: "transfer",
                            target: "creepsByRole('builder').filter(freeCapacity).shift()",
                            conditions: [
                                "usedCapacity(creep)",          // creep is full
                                "freeCapacity(target)",         // Ensure the spawn still has free capacity
                                "notOverAssigned(target)",      // Ensure the spawn is not over assigned
                            ],
                            validates: [
                                "usedCapacity(creep)",
                                "freeCapacity(target)", // Ensure the spawn still has free capacity
                            ],
                        },
                        // harvest source
                        {
                            action: "harvest",
                            target: "closestSource()",
                            conditions: [
                                "freeCapacity(creep) > 0", // creep has free capacity
                                //"notOverAssignedSource(target)"
                            ],
                            validates: [
                                "target.energy > 0", // Ensure the source still has energy
                                "freeCapacity(creep)",
                                // "notOverAssignedSource(target)"
                            ],
                        },
                        // upgrade room controller
                        {
                            action: "upgrade",
                            target: "controller",
                            conditions: [
                                "usedCapacity(creep)",
                                "!freeCapacity(closestSpawn())"
                            ],// creep is full and spawn is full
                            validates: [
                                "usedCapacity(creep)",
                                "spawns().filter(freeCapacity).filter(notOverAssigned).length === 0" // Ensure the spawn is full
                            ],
                        },
                    ]
                },
                builder: {
                    body: [WORK, CARRY, MOVE, MOVE],
                    max: "Math.ceil(constructionSites().length/2)",
                    conditions: [
                        "constructionSites().length > 0"
                    ],
                    tasks: [
                        // // withdraw energy from harvester
                        // {
                        //     conditions: [
                        //         "freeCapacity(creep) > 0", // creep has free capacity
                        //         // "notOverAssignedSource(target)"
                        //     ],
                        //     validates: [
                        //         "freeCapacity(creep)",
                        //         "hasCapacity(target)"
                        //         // "notOverAssignedSource(target)"
                        //     ],
                        //     task: {
                        //         action: "withdraw",
                        //         target: "creepsByRole('harvester').filter(hasCapacity).shift()"
                        //     }
                        // },

                        // harvest source
                        {
                            action: "harvest",
                            target: "closestSource()",
                            conditions: [
                                "freeCapacity(creep) > 0", // creep has free capacity
                                //"notOverAssignedSource(target)"
                            ],
                            validates: [
                                "target.energy > 0", // Ensure the source still has energy
                                "freeCapacity(creep)",
                                // "notOverAssignedSource(target)"
                            ],
                        },
                        {
                            action: "build",
                            target: "closestConstructionSite()",
                            conditions: [
                                "usedCapacity(creep) > 0",
                                "constructionSites().length > 0"
                            ],
                            validates: [
                                "usedCapacity(creep) > 0",
                                // "constructionSites().length > 0"
                            ],
                        }
                    ]
                }
            },
            build: {                            // building
                enabled: true,                 // enable/disable auto building
                show_build: true,              // show build orders
                show_build_levels: false,       // show build levels
                max_constructions: 3,           // max number of construction sites to place
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
