import {Injectable} from "@nestjs/common";
import {ConfigService} from "@nestjs/config";

@Injectable()
export class WhatsappConfigService {
    public files_uri = '/api/files'

    constructor(private configService: ConfigService) {
    }

    get schema(): string {
        return this.configService.get(
            'WHATSAPP_API_SCHEMA',
            this.railwayPublicDomain ? 'https' : 'http',
        )
    }

    get railwayPublicDomain(): string | undefined {
        return this.configService.get('RAILWAY_PUBLIC_DOMAIN')
            || this.configService.get('RAILWAY_STATIC_URL');
    }

    get files_url(): string {
        const host = this.hostname;
        // Public HTTPS URLs (Railway) should not include the internal container port
        if (this.schema === 'https' || host.includes('.')) {
            return `${this.schema}://${host}${this.files_uri}/`;
        }
        return `${this.schema}://${host}:${this.port}${this.files_uri}/`;
    }

    get hostname(): string {
        return this.configService.get(
            'WHATSAPP_API_HOSTNAME',
            this.railwayPublicDomain || 'localhost',
        )
    }

    get port(): string {
        // Railway injects PORT; keep WHATSAPP_API_PORT as an override
        return this.configService.get(
            'WHATSAPP_API_PORT',
            this.configService.get('PORT', '3000'),
        )
    }

    get files_folder(): string {
        return this.configService.get(
            'WHATSAPP_FILES_FOLDER',
            '/tmp/whatsapp-files',
        )
    }

    get files_lifetime(): number {
        return this.configService.get<number>(
            'WHATSAPP_FILES_LIFETIME',
            180,
        )
    }

    get mimetypes(): string[] | null {
        const types = this.configService.get('WHATSAPP_FILES_MIMETYPES', "")
        return types ? types.split(',') : null
    }

    get(name: string): any {
        return this.configService.get(name)
    }
}