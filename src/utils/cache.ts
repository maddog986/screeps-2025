const CacheStorage: Record<string, { value: any; serialized: boolean; expires: number }> = {}

Memory.cache = {}

export function cache(name: string, ttl: number = 1, debug: boolean = false) {
    return function (
        target: any,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value || descriptor.get

        if (typeof originalMethod !== "function") {
            throw new Error(`@cache can only be used on methods or getter properties.`)
        }

        descriptor.value = function (...args: any[]) {
            const context = this as { cache?: () => string } // Assert `this` type
            const contextKey = typeof context.cache === "function" ? context.cache() : "global"

            // Serialize args for cache key (handle RoomPosition and primitives)
            const serializedArgs = args.map(arg => {
                if (arg instanceof RoomPosition) {
                    return `${arg.x},${arg.y},${arg.roomName}`
                }
                if (arg instanceof PathFinder.CostMatrix) {
                    return `costmatrix`
                }
                if (arg instanceof Room) {
                    return arg.name
                }
                if (arg instanceof RoomObject) {
                    return `${arg.pos.x},${arg.pos.y},${arg.pos.roomName}`
                }
                return JSON.stringify(arg)
            })
            const cacheKey = `${name}:${contextKey}:${serializedArgs.join(":")}`
            const cached = CacheStorage[cacheKey]

            // Check if the cached value is valid
            if (cached && cached.expires >= Game.time) {
                if (debug) console.log(`Cache hit for ${cacheKey}, serialized: ${cached.serialized}`)

                // Automatically resolve game objects from cached IDs
                if (cached.serialized) {
                    return (cached.value as string[]).map(id => Game.getObjectById(id)).filter(Boolean)
                }

                return cached.value
            }

            // Measure CPU before executing the method
            const startCpu = Game.cpu.getUsed()

            // Compute the result and determine if it needs serialization
            const result = originalMethod.apply(this, args)
            const serialize_data = Array.isArray(result) && result.every(obj => obj?.id)

            // Measure CPU after execution
            const endCpu = Game.cpu.getUsed()
            const cpuUsed = endCpu - startCpu

            // If the result is an array of game objects, cache their IDs
            const serializedResult = serialize_data
                ? result.map(obj => obj.id) // Cache only IDs
                : result

            CacheStorage[cacheKey] = {
                value: serializedResult,
                serialized: serialize_data,
                expires: Game.time + ttl - 1,
            }

            // Optional: Store in Memory for debugging

            Memory.cache = Memory.cache || {}
            Memory.cache[cacheKey] = {
                key: cacheKey,
                value: serialize_data ? undefined : result,
                ids: serialize_data ? serializedResult : undefined,
                serialized: serialize_data,
                expires: Game.time + ttl - 1,
                computedAt: Game.time,
                cpuUsed, // Store the CPU usage for this computation
            }

            if (debug) {
                console.log(`Cache miss for ${cacheKey}, storing new result.`)
            }

            return result
        }
    }
}
