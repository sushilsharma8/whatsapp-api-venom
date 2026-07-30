import {create, Message, Whatsapp} from "venom-bot";
import {Inject, Injectable, Logger, OnApplicationShutdown} from "@nestjs/common";
import {ConfigService} from "@nestjs/config";
import * as path from "path";
import {WhatsappConfigService} from "./config.service";
import request = require('requestretry');
import mime = require('mime-types');
import fs = require('fs');
import del = require("del");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {promisify} = require('util')
const writeFileAsync = promisify(fs.writeFile)


const SECOND = 1000;

// Railway / CI have no display — headless unless explicitly disabled
const onRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PUBLIC_DOMAIN)
const headless =
    process.env.WHATSAPP_HEADLESS === 'false'
        ? false
        : process.env.WHATSAPP_HEADLESS === 'true' || onRailway

const venomOptions: Record<string, unknown> = {
    session: 'sessionName',
    headless,
    devtools: false,
    debug: false,
    logQR: true,
    disableWelcome: true,
    BrowserFetcher: false,
    folderNameToken: 'tokens',
    mkdirFolderToken: '',
    browserArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--single-process',
    ],
    // 0 = never auto-close while waiting for QR
    autoClose: 0,
    catchQR: (_base64Qr: string, asciiQR: string) => {
        console.log('\nScan this QR with WhatsApp → Linked Devices:\n');
        console.log(asciiQR);
    },
    statusFind: (status: string, session: string) => {
        console.log(`[${session}] status: ${status}`);
    },
}

if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    venomOptions.browserPathExecutable = process.env.PUPPETEER_EXECUTABLE_PATH
}

type WhatsappGate = Whatsapp & { __ready: Promise<Whatsapp> }

/** Start venom in the background so Nest can bind PORT (Railway healthcheck). */
function createWhatsappGate(): WhatsappGate {
    let client: Whatsapp | null = null
    let initError: Error | null = null
    const ready = create(venomOptions as any)
        .then((c: Whatsapp) => {
            client = c
            console.log('[WhatsApp] client ready')
            return c
        })
        .catch((e: Error) => {
            initError = e
            console.error('[WhatsApp] init failed', e)
            throw e
        })

    const resolveProp = (prop: string | symbol) => {
        if (initError) return Promise.reject(initError)
        if (client) return Promise.resolve((client as any)[prop])
        return ready.then((c) => (c as any)[prop])
    }

    // ponytail: Proxy queues calls until venom boots; supports whatsapp.page.screenshot()
    const gate = (getParent: () => Promise<any>): any =>
        new Proxy(function () {}, {
            apply(_t, _this, args) {
                return getParent().then((fn) => {
                    if (typeof fn !== 'function') {
                        throw new Error('WhatsApp property is not a function')
                    }
                    return fn(...args)
                })
            },
            get(_t, prop: string | symbol) {
                if (prop === 'then') return undefined
                return gate(() =>
                    getParent().then((parent) => {
                        const val = parent?.[prop as any]
                        return typeof val === 'function' ? val.bind(parent) : val
                    }),
                )
            },
        })

    return new Proxy({} as WhatsappGate, {
        get(_target, prop: string | symbol) {
            if (prop === '__ready') return ready
            if (prop === 'then') return undefined
            return gate(() => resolveProp(prop))
        },
    })
}

export const whatsappProvider = {
    provide: 'WHATSAPP',
    // Sync factory — do not await create(), or Railway returns 502 while waiting for QR
    useFactory: () => createWhatsappGate(),
}

const ONMESSAGE_HOOK = "onMessage"
const HOOKS = [
    ONMESSAGE_HOOK,
    "onStateChange",
    "onAck",
    // TODO: IMPLEMENTED THESE TOO
    // "onLiveLocation",
    // "onParticipantsChanged",
    "onAddedToGroup"
]
const ENV_PREFIX = "WHATSAPP_HOOK_"


@Injectable()
export class WhatsappService implements OnApplicationShutdown {
    // TODO: Use environment variables
    private RETRY_DELAY = 15
    private RETRY_ATTEMPTS = 3;
    readonly FILES_FOLDER: string
    readonly mimetypes: string[] | null
    readonly files_lifetime: number

    constructor(
        @Inject('WHATSAPP') private whatsapp: WhatsappGate,
        private config: WhatsappConfigService,
        private log: Logger,
    ) {
        this.log.setContext('WhatsappService')

        this.FILES_FOLDER = this.config.files_folder
        this.clean_downloads()
        this.mimetypes = this.config.mimetypes
        this.files_lifetime = this.config.files_lifetime * SECOND

        // Hooks need a live client — attach after background venom init
        this.whatsapp.__ready
            .then(() => this.configureWebhooks())
            .catch((e) => this.log.error(`WhatsApp not ready for webhooks: ${e}`))
    }

    private configureWebhooks() {
        this.log.log('Configuring webhooks...')
        for (const hook of HOOKS) {
            const env_name = ENV_PREFIX + hook.toUpperCase()
            const url = this.config.get(env_name)
            if (!url) {
                this.log.log(`Hook '${hook}' is disabled. Set ${env_name} environment variable to url if you want to enabled it.`)
                continue
            }

            if (hook === ONMESSAGE_HOOK) {
                this.whatsapp[hook](data => this.onMessageHook(data, url))
            } else {
                this.whatsapp[hook](data => this.callWebhook(data, url))
            }
            this.log.log(`Hook '${hook}' was enabled to url: ${url}`)
        }
        this.log.log('Webhooks were configured.')
    }

    private clean_downloads() {
        if (fs.existsSync(this.FILES_FOLDER)) {
            del([`${this.FILES_FOLDER}/*`], {force: true}).then((paths) =>
                console.log('Deleted files and directories:\n', paths.join('\n'))
            )
        } else {
            fs.mkdirSync(this.FILES_FOLDER)
            this.log.log(`Directory '${this.FILES_FOLDER}' created from scratch`)
        }
    }


    private callWebhook(data, url) {
        this.log.log(`Sending POST to ${url}...`)
        this.log.debug(`POST DATA: ${JSON.stringify(data)}`)

        // TODO: Use HttpModule with retry
        request.post(
            url,
            {
                json: data,
                maxAttempts: this.RETRY_ATTEMPTS,
                retryDelay: this.RETRY_DELAY * SECOND,
                retryStrategy: request.RetryStrategies.HTTPOrNetworkError
            },
            (error, res, body) => {
                if (error) {
                    this.log.error(error)
                    return
                }
                this.log.log(`POST request was sent with status code: ${res.statusCode}`)
                this.log.verbose(`Response: ${JSON.stringify(body)}`)
            })
    }

    private async onMessageHook(message: Message, url: string) {
        if (message.isMMS || message.isMedia) {
            this.downloadAndDecryptMedia(message).then(
                (data) => this.callWebhook(data, url)
            );
        } else {
            this.callWebhook(message, url);
        }
    }

    private async downloadAndDecryptMedia(message: Message) {
        return this.whatsapp.decryptFile(message).then(async (buffer) => {
            // Download only certain mimetypes
            if (this.mimetypes !== null && !this.mimetypes.some((type) => message.mimetype.startsWith(type))) {
                this.log.log(`The message ${message.id} has ${message.mimetype} media, skip it.`);
                message.clientUrl = ""
                return message
            }

            this.log.log(`The message ${message.id} has media, downloading it...`);
            const fileName = `${message.id}.${mime.extension(message.mimetype)}`;
            const filePath = path.resolve(`${this.FILES_FOLDER}/${fileName}`)
            this.log.verbose(`Writing file to ${filePath}...`)
            await writeFileAsync(filePath, buffer);
            this.log.log(`The file from ${message.id} has been saved to ${filePath}`);

            message.clientUrl = this.config.files_url + fileName
            this.removeFile(filePath)
            return message
        });
    }

    onApplicationShutdown(signal ?: string): any {
        this.log.log('Close a browser...')
        return this.whatsapp.__ready
            .then((c) => c.close())
            .catch(() => undefined)
    }

    private removeFile(file: string) {
        setTimeout(() => fs.unlink(file, () => {
            this.log.log(`File ${file} was removed`)
        }), this.files_lifetime)

    }
}
