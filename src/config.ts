interface Config {
    buildOrder: {
        [key: string]: {
            [key: number]: string[]
        }
    }
}

export const CONFIG: Config = {
    buildOrder: {
        sim: {
            2: [
                '   E.E   ',
                '  E . EE ',
                '   .A..  ',
                '         ',
            ],
            3: [
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
