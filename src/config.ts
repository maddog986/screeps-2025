declare global {
    interface CreepRoleConfig {
        body: {
            parts: BodyPartConstant[],
            max: boolean | number
        }
        max: string,
        conditions: string[],
        tasks: TaskConfig[]
    }

    interface RoomConfig {
        spawnDelay: number
        creeps: {
            [key: string]: CreepRoleConfig
        },
        build: {
            enabled: boolean
            show_build: boolean
            show_build_levels: boolean
            build_frequency: number
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
    debug: 'basic',                            // enable/disable debugging

    visuals: {                                 // visuals
        enabled: false,                         // enable/disable visuals
        show_matrix: false,                    // show pathfinding matrix
        creep_travel: false,                    // show creep paths
    },

    rooms: {
        default: {                                  // room name
            build: {                            // building
                enabled: true,                 // enable/disable auto building
                show_build: false,              // show build orders
                show_build_levels: false,       // show build levels
                build_frequency: 10,            // ticks between build orders
                max_constructions: 3,           // max number of construction sites to place
                auto_build_roads_level: 3.6,    // build roads at this level
                auto_build_containers: 2.1,     // build containers at this level
                build_orders: {                 // build orders
                    2: [
                        '     C   ',
                        '    A    ',
                        '         ',
                    ],
                    2.3: [
                        '  E .CEE ',
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
                    2.5: [
                        '   E.E   ',
                        '  E .CEE ',
                        '  ..A..  ',
                        '    .    ',
                        '         ',
                    ],
                    2.7: [
                        '   E.E   ',
                        '  E .CEE.',
                        ' ...A... ',
                        '    .    ',
                        '         ',
                    ],
                    3: [
                        '   E.ET  ',
                        '  E .CEE.',
                        ' ...A... ',
                        '    .    ',
                        '         ',
                    ],
                    3.15: [
                        '   E.ET  ',
                        ' EE .CEE.',
                        '  ..A... ',
                        '  E .  E ',
                        '         ',
                    ],
                    3.3: [
                        '   E.ET  ',
                        ' EE .CEE.',
                        '  ..A... ',
                        ' EE . EE ',
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
            },
            spawnDelay: 15,                     // ticks to delay between spawns
            creeps: {
                // defender: {
                //     body: {
                //         parts: [TOUGH, MOVE, ATTACK, ATTACK, MOVE, MOVE],
                //         max: true
                //     },
                //     max: "enemies().length > 0 ? enemies().length : 0",
                //     conditions: [
                //     ],
                //     tasks: [
                //         // attack hostile
                //         {
                //             action: "attack",
                //             target: "closestHostile()",
                //             conditions: [],
                //             validates: [],
                //         },
                //     ]
                // },
                harvester: {                    // role
                    body: {
                        parts: [WORK, CARRY, MOVE, MOVE],
                        max: true
                    },
                    //  + (creeps().filter(c => usedCapacity(c) > 45).length * 2) - (creeps().filter(c => usedCapacity(c) < 20).length * 3)))
                    max: "sources().filter(notOverAssignedTo('harvest')).reduce((a,b) => a + walkablePositions(b), 0) + containers().filter(usedCapacity).length",        // max number of creeps

                    conditions: [
                        // "mules.length > 0",
                        // "upgraders.length > 0"
                    ],

                    tasks: [
                        // harvest source
                        {
                            action: "harvest",
                            target: "closestSource()",
                            conditions: [],
                            validates: [
                                "target.energy > 0",
                            ],
                        },

                        // upgrade room controller
                        {
                            action: "upgrade",
                            target: "controller",
                            conditions: [],
                            validates: [],
                        },
                    ]
                },
                builder: {
                    body: {
                        parts: [WORK, CARRY, MOVE, MOVE],
                        max: true
                    },
                    max: "Math.ceil(constructionSites().length/2)",
                    conditions: [
                        "constructionSites().length > 0"
                    ],
                    tasks: [


                        // build construction site
                        {
                            action: "build",
                            target: "closestConstructionSite()",
                            conditions: [],
                            validates: [],
                        },

                        // upgrade room controller
                        {
                            action: "upgrade",
                            target: "controller",
                            conditions: [],
                            validates: [],
                        },

                        // harvest source
                        {
                            action: "harvest",
                            target: "closestSource()",
                            conditions: [],
                            validates: [
                                "target.energy > 0",
                            ],
                        },
                    ]
                },
                // mule: {
                //     body: {
                //         parts: [CARRY, CARRY, MOVE, MOVE],
                //         max: true
                //     },
                //     max: "containers().length >=2 ? 1 : 0",
                //     conditions: [
                //         "creepsByRole('harvester').length > 4",
                //     ],
                //     tasks: [
                //         // transfer to spawn
                //         {
                //             action: "transfer",
                //             target: "closestSpawn()",
                //             conditions: [],
                //             validates: [],
                //         },
                //     ]
                // },
            },
        }
    },
}
