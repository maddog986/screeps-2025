export interface Cache {
    walkablePositions: {
        [target: string]: {
            [dist: number]: number
        }
    }
}

export const cache: Cache = {
    walkablePositions: {}
}
