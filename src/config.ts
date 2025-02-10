declare global {
    interface RoomConfig {
        debug?: DebugConfig[]
        build?: {
            show_build: boolean
            show_build_levels: boolean
            build_frequency: number
            max_constructions: number
            auto_build_roads_level: number
            auto_build_containers: number
            spawnPos: { x: number, y: number }
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

    type DebugConfig = 'manageSpawns' | 'manageTowers' | 'manageCreeps' | 'manageConstruction' | 'manageRoles' | 'manageLinks'

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

const bunker1 = {                // build orders
    2: [
        '     C   ',
        '    A    ',
        '         ',
    ],
    2.1: [
        ' EE  CEE ',
        '    A    ',
        '       E ', // 5 extensions max
    ],
    3: [
        ' EEE ETE ',
        ' EE  CEE ',
        '    A    ',
        '       E ',
        '         ', // 10 extensions max
    ],
    4: [
        '  EE EE  ',
        ' EEE ETE ',
        ' EE  CEE ',
        '    A    ',
        ' EEC  EE ',
        ' E E E   ',
        '         ', // 20 extensions max
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

export const CONFIG: Config = {
    visuals: {                                 // visuals
        enabled: true,                         // enable/disable visuals
        show_matrix: false,                    // show pathfinding matrix
        show_transfers: false,                 // show transfers
        show_assignments: true,               // show assignments
        creep_travel: false,                   // show creep paths
    },

    rooms: {
        default: {                             // room name
            debug: ['manageCreeps'], //['manageRoles','manageSpawns', 'manageTowers', 'manageCreeps', 'manageConstruction']
            build: {                           // building
                show_build: false,             // show build orders
                show_build_levels: false,      // show build levels
                build_frequency: 20,           // ticks between build orders
                max_constructions: 3,          // max number of construction sites to place
                auto_build_roads_level: 4,     // build roads at this level
                auto_build_containers: 1,      // build containers at this level
                spawnPos: { x: 25, y: 25 },
                build_orders: bunker1
            }
        },
        W8N3: {                             // room name
            debug: ['manageCreeps'], //['manageRoles','manageSpawns', 'manageTowers', 'manageCreeps', 'manageConstruction']
            build: {                           // building
                show_build: false,             // show build orders
                show_build_levels: false,      // show build levels
                build_frequency: 20,           // ticks between build orders
                max_constructions: 3,          // max number of construction sites to place
                auto_build_roads_level: 4,     // build roads at this level
                auto_build_containers: 1,      // build containers at this level
                spawnPos: { x: 18, y: 16 },
                build_orders: bunker1
            }
        },
        W7N3: {                             // room name
            //debug: [], //['manageRoles','manageSpawns', 'manageTowers', 'manageCreeps', 'manageConstruction']
            build: {                           // building
                show_build: false,             // show build orders
                show_build_levels: false,      // show build levels
                build_frequency: 20,           // ticks between build orders
                max_constructions: 3,          // max number of construction sites to place
                auto_build_roads_level: 4,     // build roads at this level
                auto_build_containers: 1,      // build containers at this level
                spawnPos: { x: 33, y: 10 },
                build_orders: bunker1
            }
        },
        W7N4: {                             // room name
            //debug: [], //['manageRoles','manageSpawns', 'manageTowers', 'manageCreeps', 'manageConstruction']
            build: {                           // building
                show_build: false,             // show build orders
                show_build_levels: false,      // show build levels
                build_frequency: 20,           // ticks between build orders
                max_constructions: 3,          // max number of construction sites to place
                auto_build_roads_level: 4,     // build roads at this level
                auto_build_containers: 1,      // build containers at this level
                spawnPos: { x: 35, y: 28 },
                build_orders: bunker1
            }
        }
    }
}
