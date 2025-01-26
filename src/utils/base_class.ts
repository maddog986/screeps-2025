import ContextBuilder from 'utils/context_builder'
import Debuggable from './debugger'

export default class BaseClass extends Debuggable {
    room: Room
    context: ContextBuilder

    constructor(room: Room, prefix: string | undefined = undefined, baseContext: ContextBuilder | undefined = undefined) {
        // enable debugging for this class
        super(prefix ? prefix : room.name)

        this.room = room
        this.context = baseContext ? baseContext : new ContextBuilder(room)

        this.log(`${this.constructor.name} initialized.`)
    }

    setContext(name: string, value: any) {
        this.context.setContext(name, value)
    }

    getContext(name: string, resolve: Boolean = false) {
        const contextValue = this.context.getContext(name)

        if (resolve && typeof contextValue === 'function') {
            return contextValue()
        }

        return contextValue
    }

    run() {

    }
}
