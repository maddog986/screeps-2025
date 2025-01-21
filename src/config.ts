interface Config {
    visualizeRoom: boolean
    visualizeMatrix: boolean
    spawnRate: number
    buildEnabled: boolean
    buildModifer: number
    buildOrder: {
        [key: string]: {
            [key: number]: string[]
        }
    }
}

export const CONFIG: Config = {
    visualizeRoom: true,
    visualizeMatrix: false,
    spawnRate: 10,
    buildEnabled: true,
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
