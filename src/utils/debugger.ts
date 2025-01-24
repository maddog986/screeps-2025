export default class Debugger {
    private debugEnabled: boolean = false;
    private debugPrefix: string = '';
    private debugLevel: 'basic' | 'informative' | 'detailed' = 'basic';

    /**
     * Initializes debugging settings for the class.
     * Call this method after your class's constructor.
     * @param debugEnabled - Whether debugging is enabled.
     * @param debugPrefix - Prefix for debug messages (e.g., class name or context).
     * @param debugLevel - Debug level ('basic', 'informative', 'detailed').
     */
    constructor(debugEnabled: boolean, debugPrefix: string = '', debugLevel: 'basic' | 'informative' | 'detailed' = 'basic') {
        this.debugEnabled = debugEnabled
        this.debugPrefix = debugPrefix
        this.debugLevel = debugLevel
    }

    /**
     * Logs a debug message if debugging is enabled and meets the debug level requirement.
     * @param args - Any number of arguments to log, with an optional debug level as the last argument.
     */
    protected debug(...args: any[]): void {
        if (!this.debugEnabled) return

        const levels = ['basic', 'informative', 'detailed']

        // Extract the level if the last argument is a valid level, default to 'basic'.
        let level: 'basic' | 'informative' | 'detailed' = 'basic'
        if (typeof args[args.length - 1] === 'string' && levels.includes(args[args.length - 1])) {
            level = args.pop()
        }

        if (levels.indexOf(level) > levels.indexOf(this.debugLevel)) return

        const timestamp = new Date().toISOString()
        const prefix = this.debugPrefix ? `[${this.debugPrefix}]` : ''
        const formattedMessage = `${timestamp} ${prefix} [${level.toUpperCase()}]:`

        let color: string
        switch (level) {
            case 'informative':
                color = 'color: blue'
                console.info(`%c${formattedMessage}`, color, ...args)
                break
            case 'detailed':
                color = 'color: green'
                console.info(`%c${formattedMessage}`, color)
                args.forEach(arg => {
                    if (typeof arg === 'object') {
                        console.info(`%c${JSON.stringify(arg, null, 2)}`, color)
                    } else {
                        console.info(`%c${arg}`, color)
                    }
                })
                break
            default:
                color = 'color: gray'
                console.log(`%c${formattedMessage}`, color, ...args)
        }
    }

    /**
     * Enables or disables debugging.
     * @param enabled - Whether debugging should be enabled.
     */
    public setDebug(enabled: boolean): void {
        this.debugEnabled = enabled
    }

    /**
     * Updates the prefix for debug messages.
     * @param prefix - The new debug prefix.
     */
    public setDebugPrefix(prefix: string): void {
        this.debugPrefix = prefix
    }

    /**
     * Sets the debug level.
     * @param level - The new debug level ('basic', 'informative', 'detailed').
     */
    public setDebugLevel(level: 'basic' | 'informative' | 'detailed'): void {
        this.debugLevel = level
    }
}
