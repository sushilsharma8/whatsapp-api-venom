import {Controller, Get, Inject, Post} from '@nestjs/common';
import {ApiTags} from "@nestjs/swagger";
import {WhatsappService} from "../whatsapp.service";


@Controller('api')
@ApiTags('device')
export class DeviceController {
    // ponytail: no venom-bot import — Nest metadata would load undici before listen
    constructor(
        @Inject('WHATSAPP') private whatsapp: any,
        private readonly whatsappService: WhatsappService,
    ) {
    }

    @Get('/health')
    health() {
        const status = typeof this.whatsapp.__status === 'function'
            ? this.whatsapp.__status()
            : { ready: false, phase: 'idle', error: null, qr: null }
        // Keep health payload light — full QR is on GET /api/qr
        return {
            ok: true,
            whatsapp: {
                ready: status.ready,
                phase: status.phase,
                error: status.error,
                hasQr: !!(status.qr && status.qr.ascii),
            },
        }
    }

    @Get('/qr')
    qr() {
        const status = typeof this.whatsapp.__status === 'function'
            ? this.whatsapp.__status()
            : { ready: false, phase: 'idle', qr: null }
        if (status.ready) {
            return { ok: true, phase: 'ready', message: 'Already linked — no QR needed.', qr: null }
        }
        if (!status.qr?.ascii && !status.qr?.base64) {
            return {
                ok: false,
                phase: status.phase,
                message: 'No QR yet. POST /api/start-whatsapp first, then retry.',
                qr: null,
            }
        }
        return { ok: true, phase: status.phase, qr: status.qr }
    }

    @Post('/start-whatsapp')
    startWhatsapp() {
        this.whatsappService.start()
        return {
            ok: true,
            message: 'WhatsApp startup requested. Poll GET /api/qr (or /api/health) until hasQr/ready.',
        }
    }

    @Post('/killServiceWorker')
    killServiceWorker() {
        return this.whatsapp.killServiceWorker()
    }

    @Post('/restartService')
    restartService() {
        return this.whatsapp.restartService()
    }

    @Get('/getHostDevice')
    getHostDevice() {
        return this.whatsapp.getHostDevice()
    }

    @Get('/getConnectionState')
    getConnectionState() {
        return this.whatsapp.getConnectionState()
    }

    @Get('/getBatteryLevel')
    getBatteryLevel() {
        return this.whatsapp.getBatteryLevel()
    }

    @Get('/isConnected')
    isConnected() {
        return this.whatsapp.isConnected()
    }

    @Get('/getWAVersion')
    getWAVersion() {
        return this.whatsapp.getWAVersion()
    }

}
