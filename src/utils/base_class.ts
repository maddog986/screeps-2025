import ContextBuilder from 'utils/context_builder'

export default class BaseClass extends ContextBuilder {
    constructor(room: Room, prefix: string | undefined = undefined) {
        // enable debugging for this class
        super(room, prefix ? prefix : room.name)

        this.log(`${this.constructor.name} initialized.`)
    }
}
