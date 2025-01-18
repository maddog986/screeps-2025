if (!Memory.cache) {
    Memory.cache = {}
}

export const cache = {
    getItem(key: string, expires: number = -1, callback: Function): any {
        const cached = Memory.cache[key]

        if (cached) {
            if (cached.expires === -1 || cached.expires > Game.time) {
                if (cached.value) {
                    return cached.value
                }
            }

            delete Memory.cache[key]
        }

        Memory.cache[key] = {
            value: callback(),
            expires: expires === -1 ? -1 : Game.time + expires
        }

        return Memory.cache[key].value
    }
}
