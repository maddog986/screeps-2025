interface Config {
    visualizeMatrix: boolean
    spawnRate: number
    buildRotate: number
    buildEnabled: boolean
    buildRoads: number
    buildContainers: number
    buildModifer: number
    buildOrder: {
        [key: string]: {
            [key: number]: string[]
        }
    }
    visuals: {
        enabled: boolean
        show_matrix: boolean
        show_build: boolean
        show_build_levels: boolean
    }
    build: {
        enabled: boolean
        max_constructions: number
    }
}

export const CONFIG: Config = {
    visuals: {
        enabled: true,
        show_matrix: false,
        show_build: true,
        show_build_levels: false
    },
    visualizeMatrix: false,
    spawnRate: 10,

    build: {
        enabled: true,
        max_constructions: 5,
    },

    buildRotate: 0, // 254, 280, 287
    buildEnabled: true,
    buildRoads: 3.8,
    buildContainers: 3.2,
    buildModifer: 40, // how often to check for new builds
    buildOrder: {
        sim: {
            2: [
                '  E . EE ',
                '   .A..  ',
                '         ',
            ],
            2.4: [
                '    .    ',
                '  E . EE ',
                '   .A..  ',
                '         ',
                '         ',
            ],
            2.8: [
                '   E.E   ',
                '  E . EE ',
                '  ..A..  ',
                '    .    ',
                '         ',
            ],
            3: [
                '   E.ET  ',
                '  E . EE ',
                '  ..A... ',
                '    .    ',
                '         ',
            ],
            3.15: [
                '   E.ET  ',
                ' EE . EE ',
                '  ..A... ',
                '  E .  E ',
                '         ',
            ],
            3.3: [
                '   E.ET  ',
                ' EE . EE ',
                '  ..A... ',
                ' EE . EE ',
                '         ',
            ],
            4: [
                '  .. ..  ',
                ' .EE.EE. ',
                '.EEE.ETE.',
                '.EE . EE.',
                ' ...A... ',
                '.EE . EE.',
                '.EEE.EEE.',
                ' .EE.EE. ',
                '  .. ..  ',
            ],
        }
    }
}
