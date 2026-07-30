/** Must load before venom-bot / undici (Node 18 lacks global File). */
try {
    if (typeof (globalThis as any).File === 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { File } = require('node:buffer')
        if (File) {
            ;(globalThis as any).File = File
        }
    }
} catch {
    // ignore — Node too old / no buffer.File
}
