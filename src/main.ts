import './file-polyfill'
import * as http from 'http'

/**
 * Bind PORT immediately (before Nest/venom load) so Railway never 502s during boot.
 * Nest Express app is attached as the request handler once ready.
 */
async function bootstrap() {
    const port = Number(process.env.PORT || process.env.WHATSAPP_API_PORT || 3000)
    let expressApp: ((req: http.IncomingMessage, res: http.ServerResponse) => void) | null = null

    const server = http.createServer((req, res) => {
        if (expressApp) {
            expressApp(req, res)
            return
        }
        // Early responses while Nest is still loading
        const url = req.url || '/'
        if (url.startsWith('/api/health') || url === '/' || url.startsWith('/docs')) {
            res.writeHead(200, {'Content-Type': 'application/json'})
            res.end(JSON.stringify({
                ok: true,
                starting: true,
                message: 'HTTP up — WhatsApp/Nest still initializing',
            }))
            return
        }
        res.writeHead(503, {'Content-Type': 'application/json'})
        res.end(JSON.stringify({ok: false, starting: true}))
    })

    await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '0.0.0.0', () => {
            console.log(`Early health server listening on 0.0.0.0:${port}`)
            resolve()
        })
    })

    // Every dependency is loaded only after Railway can reach this process.
    const [{NestFactory}, {AppModule}, swagger, {WhatsappConfigService}] = await Promise.all([
        import('@nestjs/core'),
        import('./app.module'),
        import('@nestjs/swagger'),
        import('./config.service'),
    ])
    const {DocumentBuilder, SwaggerModule} = swagger
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fileUpload = require('express-fileupload')

    const app = await NestFactory.create(AppModule, {
        logger: process.env.DEBUG != undefined ? ['log', 'debug', 'error', 'verbose', 'warn'] :
            ['log', 'error', 'warn'],
    })
    app.use(fileUpload({}))
    app.enableShutdownHooks()

    const options = new DocumentBuilder()
        .setTitle('WhatsApp venom API')
        .setDescription('WhatsApp HTTP API that you can configure in a click!')
        .setExternalDoc("Github WhatsApp API venom", "https://github.com/diazzaid/whatsapp-venom-api")
        .setVersion('1.0')
        .addTag('device', 'Device information')
        .addTag('chatting', 'Chat methods')
        .addApiKey({
            type: 'apiKey',
            description: 'Your secret key',
            name: 'X-VENOM-TOKEN',
        })
        .build()
    const document = SwaggerModule.createDocument(app, options)
    SwaggerModule.setup('', app, document)
    SwaggerModule.setup('docs', app, document)

    await app.init()
    expressApp = app.getHttpAdapter().getInstance()

    const config = app.get(WhatsappConfigService)
    console.log(`WhatsApp HTTP API ready (hostname=${config.hostname}, port=${port})`)
}

bootstrap().catch((err) => {
    console.error('Fatal bootstrap error', err)
    // Keep early server alive if Nest fails — better a partial app than Railway 502
})
