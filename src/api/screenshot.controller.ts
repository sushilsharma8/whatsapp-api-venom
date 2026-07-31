import {Controller, Get, Inject, Res} from '@nestjs/common';
import {ApiTags} from "@nestjs/swagger";
import {Readable} from "stream";
import {Response} from 'express';


@Controller('api')
@ApiTags('screenshot')
export class ScreenshotController {
    // ponytail: no venom-bot import — Nest metadata would load undici before listen
    constructor(@Inject('WHATSAPP') private whatsapp: any) {
    }

    @Get('/screenshot')
    async screenshot(@Res() res: Response,) {
        const status = typeof this.whatsapp.__status === 'function'
            ? this.whatsapp.__status()
            : { ready: false, phase: 'idle' }
        if (!status.ready) {
            res.status(503).json({
                ok: false,
                phase: status.phase,
                message: 'WhatsApp not ready yet. Scan QR via GET /api/qr first.',
            })
            return
        }
        const buffer = await this.whatsapp.page.screenshot();
        const stream = new Readable();
        stream.push(buffer);
        stream.push(null);

        res.set({
            'Content-Type': 'image/png',
            'Content-Length': buffer.length,
        });
        stream.pipe(res)
    }
}
