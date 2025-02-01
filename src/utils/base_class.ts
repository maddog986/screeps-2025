import BaseContext from 'utils/base_context'

export default class BaseClass<TContext extends Record<string, any> = {}> extends BaseContext<TContext> {
    constructor(room: Room, prefix: string | undefined = undefined) {
        // enable debugging for this class
        super(room, prefix ? prefix : room.name)

        this.log(`**${this.constructor.name} initialized.**`)
    }
}
