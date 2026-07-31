import {Controller, Get, Inject, Post, Res} from '@nestjs/common';
import {ApiTags} from "@nestjs/swagger";
import {Response} from 'express';
import {WhatsappService} from "../whatsapp.service";

function qrPngBuffer(base64: string): Buffer | null {
    const raw = base64.includes(',') ? base64.split(',')[1] : base64
    if (!raw) return null
    try {
        return Buffer.from(raw, 'base64')
    } catch {
        return null
    }
}

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
        // Keep health payload light — scanable QR is GET /api/qr (PNG)
        return {
            ok: true,
            whatsapp: {
                ready: status.ready,
                phase: status.phase,
                error: status.error,
                hasQr: !!(status.qr && (status.qr.base64 || status.qr.ascii)),
            },
        }
    }

    /** PNG you can open in a browser and scan — not JSON (escaped \\n breaks ASCII QR). */
    @Get('/qr')
    qrImage(@Res() res: Response) {
        const status = typeof this.whatsapp.__status === 'function'
            ? this.whatsapp.__status()
            : { ready: false, phase: 'idle', qr: null }
        if (status.ready) {
            res.status(200).json({ ok: true, phase: 'ready', message: 'Already linked — no QR needed.' })
            return
        }
        const buf = status.qr?.base64 ? qrPngBuffer(status.qr.base64) : null
        if (!buf) {
            res.status(404).json({
                ok: false,
                phase: status.phase,
                message: 'No QR yet. POST /api/start-whatsapp first, then open /api/qr in a browser.',
            })
            return
        }
        res.set({
            'Content-Type': 'image/png',
            'Cache-Control': 'no-store',
            'Content-Length': buf.length,
        })
        res.send(buf)
    }

    @Post('/start-whatsapp')
    startWhatsapp() {
        this.whatsappService.start()
        return {
            ok: true,
            message: 'WhatsApp startup requested. Open GET /api/qr in a browser and scan the PNG.',
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
