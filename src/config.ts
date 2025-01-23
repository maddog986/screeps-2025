interface Config {
    spawnRate: number
    maxHarvestersPerSource: number
    autoRenewCreepLevel: number
    visuals: {
        enabled: boolean
        show_matrix: boolean
    }
    build: {
        enabled: boolean
        show_build: boolean
        show_build_levels: boolean
        max_constructions: number
        auto_build_roads_level: number
        auto_build_containers: number
        build_orders: {
            [key: string]: {
                [key: number]: string[]
            }
        }
    }
}

export const CONFIG: Config = {
    visuals: {                          // visuals
        enabled: true,                  // enable/disable visuals
        show_matrix: false,             // show pathfinding matrix
    },

    spawnRate: 10,                      // how much of a delay to impose after spawning a creep. allows time to recover energy
    maxHarvestersPerSource: 3,          // limit each source to 3 harvesters
    autoRenewCreepLevel: 200,           // auto renew creeps when below this lifeTime

    build: {
        enabled: false,                  // enable/disable auto building
        show_build: false,               // show build orders
        show_build_levels: false,        // show build levels
        max_constructions: 5,           // max number of construction sites to place
        auto_build_roads_level: 3.6,    // build roads at this level
        auto_build_containers: 3.2,     // build containers at this level
        build_orders: {                 // build orders
            sim: {                      // simulation room
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
                ],
            }
        }
    }
}
