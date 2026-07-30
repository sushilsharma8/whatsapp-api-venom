import {Body, Controller, Inject, NotImplementedException, Post} from '@nestjs/common';
import {ApiOperation, ApiTags} from "@nestjs/swagger";
import {
    Chat,
    MessageContactVcard,
    MessageFile,
    MessageImage,
    MessageLinkPreview,
    MessageLocation,
    MessageReply,
    MessageText
} from "./all.dto";

@Controller('api')
@ApiTags('chatting')
export class ChattingController {
    // ponytail: avoid `import { Whatsapp }` — emitDecoratorMetadata would require venom-bot at boot
    constructor(@Inject('WHATSAPP') private whatsapp: any) {
    }

    @Post('/sendContactVcard')
    sendContactVcard(@Body() message: MessageContactVcard) {
        return this.whatsapp.sendContactVcard(message.number + '@c.us', message.contactsId, message.name)
    }

    @Post('/send-message')
    @ApiOperation({summary: 'Send a message message'})
    sendText(@Body() message: MessageText) {
        return this.whatsapp.sendText(message.number + '@c.us', message.message)
    }

    @Post('/send-location')
    sendLocation(@Body() message: MessageLocation) {
        return this.whatsapp.sendLocation(message.number + '@c.us', message.latitude, message.longitude, message.title)
    }

    @Post('/send-linkPreview')
    sendLinkPreview(@Body() message: MessageLinkPreview) {
        return this.whatsapp.sendLinkPreview(
            message.number + '@c.us',
            message.url,
            message.title,
            message.title,
        )
    }

    @Post('/send-image')
    @ApiOperation({summary: 'NOT IMPLEMENTED YET'})
    sendImage(@Body() message: MessageImage) {
        throw new NotImplementedException();
        // TODO: Accept image URL, download it and then send with path
        return this.whatsapp.sendImage(message.number + '@c.us', message.path, message.filename, message.caption)
    }

    @Post('/send-file')
    @ApiOperation({summary: 'NOT IMPLEMENTED YET'})
    sendFile(@Body() message: MessageFile) {
        throw new NotImplementedException();
        // TODO: Accept File URL, download it and then send with path
        return this.whatsapp.sendFile(message.number + '@c.us', message.path, message.filename, message.caption)
    }

    @Post('/reply')
    @ApiOperation({summary: 'Reply to a message message'})
    reply(@Body() message: MessageReply) {
        return this.whatsapp.reply(message.number + '@c.us', message.message, message.reply_to)
    }

    @Post('/send-seen')
    sendSeen(@Body() chat: Chat) {
        return this.whatsapp.markMarkSeenMessage(chat.number + '@c.us')
    }

    @Post('/start-typing')
    startTyping(@Body() chat: Chat) {
        // It's infinitive action
        this.whatsapp.startTyping(chat.number + '@c.us', false)
        return true
    }

    @Post('/stop-typing')
    stopTyping(@Body() chat: Chat) {
        this.whatsapp.markPaused(chat.number + '@c.us', false)
        return true
    }
}
