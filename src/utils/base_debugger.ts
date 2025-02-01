import { CONFIG } from 'config'

declare global {
    type DebugLevel = "basic" | "log"
}

export default class BaseDebugger {
    private debugPrefix: string = '';
    private logs: { level: DebugLevel; messages: any[] }[] = [];

    startCpu: number = 0
    _logCpu: number = 0

    constructor(debugPrefix: string = '') {
        this.debugPrefix = `${this.constructor.name}[${debugPrefix}]`
        this.startCpu = Game.cpu.getUsed()
    }

    public log(...args: any[]): void {
        // Extract the level if the last argument is a valid level, default to 'basic'.
        let level: DebugLevel = 'basic'

        if (typeof args[args.length - 1] === 'string' && ["basic", "log"].includes(args[args.length - 1] as any)) {
            level = args.pop() as DebugLevel
        }

        // Store the logs for later display.
        this.logs.push({ level, messages: args })
    }

    public getCurrentCpu(): number {
        return Number((Game.cpu.getUsed() - this.startCpu).toFixed(2))
    }

    public logCpu(): void {
        this._logCpu = Game.cpu.getUsed()
    }

    public getLogCpu(): number {
        return Number((Game.cpu.getUsed() - this._logCpu).toFixed(2))
    }

    public flushLogs(): void {
        if (!CONFIG.debug || this.logs.length === 0) return

        const usedCpu = Game.cpu.getUsed() - this.startCpu

        let output = `<details>` +
            `<summary style='color:white;margin:0;'>[${Game.time}] <strong>${this.debugPrefix} </strong>:</summary>` +
            `<div style='display:flex;flex-direction:column;gap:8px;padding:4px 0;'>`

        output = this.buildLog(this.logs, "basic", output)
        output = this.buildLog(this.logs, "log", output)

        output += `</div></details>`

        // Output the entire log as a single HTML block.
        console.log(output)

        // Clear the logs after flushing.
        this.logs = []
    }

    private buildLog(logs: { level: DebugLevel; messages: any[] }[], display_level: DebugLevel, output: string) {
        logs
            .filter(({ level }) => level === display_level)
            .forEach(({ level, messages }) => {
                messages.forEach(message => {
                    if (typeof message === 'object') {

                        output += `<pre style='overflow:auto;max-height:100px;background:black;padding:2px;border:0;border-radius:3px;color:#d3b886;min-width:500px;margin:0;line-height:1;'><code>` +
                            JSON.stringify(message, null, 2)
                                .replace(/"([^"]+)":/g, '<span style="color:rgb(252 104 104);">"$1"</span>:') // Keys in red
                                .replace(/:\s*"([^"]+)"/g, ': <span style="color:rgb(156, 211, 159);">"$1"</span>') // String values in green
                                .replace(/:\s*(\d+)/g, ': <span style="color:rgb(139, 178, 218);">$1</span>') // Numbers in blue
                                .replace(/:\s*(true|false)/g, ': <span style="color:rgb(255, 188, 87);">$1</span>') // Booleans in orange
                                .replace(/:\s*null/g, ': <span style="color: #9e9e9e;">null</span>') // Null in gray
                            +
                            `</code></pre>`

                    } else if (typeof message === 'string') {
                        // Convert markdown-style text to HTML.
                        const formattedMessage = message
                            .replace(/#([0-9A-Fa-f]{6})\[(.*?)\]/g, '<span style="color:#$1;">$2</span>') // Custom color markdown
                            .replace(/\*\*(.*?)\*\*/g, '<strong style="font-size:13px">$1</strong>') // Bold
                            .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
                            .replace(/`(.*?)`/g, '<code>$1</code>') // Inline code

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
        return output
    }
}
