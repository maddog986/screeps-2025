declare global {
    interface RoomConfig {
        debug: {
            enabled: boolean
            keys: DebugConfig[]
        }
        maxUpgraders: number
        maxBuilders: number
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

    type DebugConfig = 'manageSpawns' | 'manageTowers' | 'manageCreeps' | 'manageConstruction' | 'manageRefillables' | 'manageRoles'

    interface Config {
        visuals: {
            enabled: boolean
            show_matrix: boolean
            creep_travel: boolean
            show_transfers: boolean
            show_assignments: boolean
        }

        rooms: {
            [key: string]: RoomConfig
        }
    }
}

export const CONFIG: Config = {
    visuals: {                                 // visuals
        enabled: true,                         // enable/disable visuals
        show_matrix: false,                    // show pathfinding matrix
        show_transfers: false,                 // show transfers
        show_assignments: true,               // show assignments
        creep_travel: false,                   // show creep paths
    },

    rooms: {
        W7N3: {                             // room name
            debug: {
                enabled: true,
                keys: ['manageRoles']
            },
            maxUpgraders: 4,                   // max number of upgraders
            maxBuilders: 2,                    // max number of builders
            build: {                           // building
                enabled: true,                 // enable/disable auto building
                show_build: true,             // show build orders
                show_build_levels: false,      // show build levels
                build_frequency: 50,           // ticks between build orders
                max_constructions: 3,          // max number of construction sites to place
                auto_build_roads_level: 0,     // build roads at this level
                auto_build_containers: 0,      // build containers at this level
                build_orders: {                // build orders
                    2: [
                        '     C   ',
                        '    A    ',
                        '         ',
                    ],
                    2.05: [
                        '  E  CEE ',
                        '    A    ',
                        '         ',
                    ],
                    2.1: [
                        '   E E   ',
                        '  E  CEE ',
                        '    A    ',
                        '         ',
                        '         ',
                    ],
                    3: [
                        '   E ET  ',
                        '  E  CEE ',
                        '    A    ',
                        '         ',
                        '         ',
                    ],
                    3.05: [
                        '   E ET  ',
                        ' EE  CEE ',
                        '    A    ',
                        '  E   E  ',
                        '         ',
                    ],
                    3.2: [
                        '   E ET  ',
                        ' EE  CEE ',
                        '    A    ',
                        ' EE   EE ',
                        '         ',
                    ],
                    3.4: [
                        '  RR RR  ',
                        ' RRRRRRR ',
                        '   RRR   ',
                        '   RRRRR ',
                    ],
                    4: [
                        '  .. ..  ',
                        ' .  .  . ',
                        '.EEE.ETE.',
                        '.EE .CEE.',
                        ' ...A... ',
                        '.EEC. EE.',
                        '.E E.EEE.',
                        ' .E .  . ',
                        '  .. ..  ',
                    ],
                    5: [
                        '  .. ..  ',
                        ' .EE.EE. ',
                        '.EEE.ETE.',
                        '.EE .CEE.',
                        ' ...A... ',
                        '.EEC. EE.',
                        '.ETE.EEE.',
                        ' .EE.EE. ',
                        '  .. ..  ',
                    ]
                }
            }
        },
        W4N3: {                             // room name
            debug: {
                enabled: false,
                keys: []
            },
            maxUpgraders: 4,                   // max number of upgraders
            maxBuilders: 2,                    // max number of builders
            build: {                           // building
                enabled: false,                 // enable/disable auto building
                show_build: true,             // show build orders
                show_build_levels: false,      // show build levels
                build_frequency: 50,           // ticks between build orders
                max_constructions: 3,          // max number of construction sites to place
                auto_build_roads_level: 0,     // build roads at this level
                auto_build_containers: 0,      // build containers at this level
                build_orders: {                // build orders
                }
            }
        },
        W5N3: {                             // room name
            debug: {
                enabled: false,
                keys: []
            },
            maxUpgraders: 4,                   // max number of upgraders
            maxBuilders: 2,                    // max number of builders
            build: {                           // building
                enabled: false,                 // enable/disable auto building
                show_build: true,             // show build orders
                show_build_levels: false,      // show build levels
                build_frequency: 50,           // ticks between build orders
                max_constructions: 3,          // max number of construction sites to place
                auto_build_roads_level: 0,     // build roads at this level
                auto_build_containers: 0,      // build containers at this level
                build_orders: {                // build orders
                }
            }
        },
        default: {                             // room name
            debug: {
                enabled: false,
                keys: ['manageCreeps', 'manageRoles'] //['manageRoles','manageSpawns', 'manageTowers', 'manageCreeps', 'manageConstruction', 'manageRefillables']
            },
            maxUpgraders: 4,                   // max number of upgraders
            maxBuilders: 2,                    // max number of builders
            build: {                           // building
                enabled: false,                 // enable/disable auto building
                show_build: false,             // show build orders
                show_build_levels: false,      // show build levels
                build_frequency: 50,           // ticks between build orders
                max_constructions: 3,          // max number of construction sites to place
                auto_build_roads_level: 4,     // build roads at this level
                auto_build_containers: 0,      // build containers at this level
                build_orders: {                // build orders
                    2: [
                        '     C   ',
                        '    A    ',
                        '         ',
                    ],
                    2.05: [
                        '  E  CEE ',
                        '    A    ',
                        '         ',
                    ],
                    2.1: [
                        '   E E   ',
                        '  E  CEE ',
                        '    A    ',
                        '         ',
                        '         ',
                    ],
                    3: [
                        '   E ET  ',
                        '  E  CEE ',
                        '    A    ',
                        '         ',
                        '         ',
                    ],
                    3.05: [
                        '   E ET  ',
                        ' EE  CEE ',
                        '    A    ',
                        '  E   E  ',
                        '         ',
                    ],
                    3.2: [
                        '   E ET  ',
                        ' EE  CEE ',
                        '    A    ',
                        ' EE   EE ',
                        '         ',
                    ],
                    3.4: [
                        '  RR RR  ',
                        ' RRRRRRR ',
                        '   RRR   ',
                        '   RRRRR ',
                    ],
                    4: [
                        '  .. ..  ',
                        ' .  .  . ',
                        '.EEE.ETE.',
                        '.EE .CEE.',
                        ' ...A... ',
                        '.EEC. EE.',
                        '.E E.EEE.',
                        ' .E .  . ',
                        '  .. ..  ',
                    ],
                    5: [
                        '  .. ..  ',
                        ' .EE.EE. ',
                        '.EEE.ETE.',
                        '.EE .CEE.',
                        ' ...A... ',
                        '.EEC. EE.',
                        '.ETE.EEE.',
                        ' .EE.EE. ',
                        '  .. ..  ',
                    ]
                }
            }
        }
    }
}
