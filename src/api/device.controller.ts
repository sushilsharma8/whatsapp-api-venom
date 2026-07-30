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
            : { ready: false, error: null }
        return {
            ok: true,
            whatsapp: status,
        }
    }

    @Post('/start-whatsapp')
    startWhatsapp() {
        this.whatsappService.start()
        return {
            ok: true,
            message: 'WhatsApp startup requested. Check /api/health and deployment logs for the QR code.',
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
