export default class Debuggable {
    private debugEnabled: boolean = false;
    private debugPrefix: string = '';
    private debugLevel: 'basic' | 'informative' | 'detailed' = 'basic';
    private logs: { level: 'basic' | 'informative' | 'detailed'; messages: any[] }[] = [];

    /**
     * Constructs the Debuggable instance with initial settings.
     * @param debugEnabled - Whether debugging is enabled.
     * @param debugPrefix - Prefix for debug messages (e.g., class name or context).
     * @param debugLevel - Debug level ('basic', 'informative', 'detailed').
     */
    constructor(debugEnabled: boolean = false, debugPrefix: string = '', debugLevel: 'basic' | 'informative' | 'detailed' = 'detailed') {
        this.debugEnabled = debugEnabled
        this.debugPrefix = debugPrefix
        this.debugLevel = debugLevel
    }

    /**
     * Logs a debug message if debugging is enabled and meets the debug level requirement.
     * @param args - Any number of arguments to log, with an optional debug level as the last argument.
     */
    public debug(...args: any[]): void {
        if (!this.debugEnabled) return

        const levels: ('basic' | 'informative' | 'detailed')[] = ['basic', 'informative', 'detailed']

        // Extract the level if the last argument is a valid level, default to 'basic'.
        let level: 'basic' | 'informative' | 'detailed' = 'basic'
        if (typeof args[args.length - 1] === 'string' && levels.includes(args[args.length - 1] as any)) {
            level = args.pop() as 'basic' | 'informative' | 'detailed'
        }

        if (levels.indexOf(level) > levels.indexOf(this.debugLevel)) return

        // Store the logs for later display.
        this.logs.push({ level, messages: args })
    }

    /**
     * Displays all logs for the current instance as a single formatted HTML block with markdown, filtered by a specified level.
     * @param flushLevel - The level to flush logs for ('basic', 'informative', 'detailed').
     */
    public flushLogs(flushLevel: 'basic' | 'informative' | 'detailed' = 'detailed'): void {
        if (!this.debugEnabled || this.logs.length === 0) return

        const levelHierarchy: Record<'basic' | 'informative' | 'detailed', number> = {
            basic: 1,
            detailed: 2,
            informative: 3,
        }

        let output = `<details>` +
            `<summary style='color:white;margin:0;'>[${Game.time}] <strong>${this.debugPrefix} </strong>:</summary>` +
            `<div style='display:flex;flex-direction:column;gap:8px;margin-top:4px;'>`

        this.logs
            .filter(({ level }) => levelHierarchy[level] <= levelHierarchy[flushLevel])
            .forEach(({ level, messages }) => {
                messages.forEach(message => {
                    if (typeof message === 'object') {
                        output += `<pre style='background:black;padding:2px;border:0;border-radius:3px;color:#d3b886;min-width:500px;margin:0;line-height:1;'><code>${JSON.stringify(message, null, 2)}</code></pre>`
                    } else if (typeof message === 'string') {
                        // Convert markdown-style text to HTML.
                        const formattedMessage = message
                            .replace(/#([0-9A-Fa-f]{6})\[(.*?)\]/g, '<span style="color:#$1;">$2</span>')   // Custom color markdown
                            .replace(/\*\*(.*?)\*\*/g, '<strong style="font-size:13px">$1</strong>')        // Bold
                            .replace(/\*(.*?)\*/g, '<em>$1</em>')                                           // Italic
                            .replace(/`(.*?)`/g, '<code>$1</code>')                                         // Inline code

                        output += `<p style='margin:0'>${formattedMessage}</p>`
                    } else {
                        try {
                            output += `<p style='margin:0'>${message}</p>`
                        } catch (e) {
                            console.log(`Error formatting debug message: ${e}`)
                        }
                    }
                })
            })

        output += `</div></details>`

        // Output the entire log as a single HTML block.
        console.log(output)

        // Clear the logs after flushing.
        this.logs = []
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
