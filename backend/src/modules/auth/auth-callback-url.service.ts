import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class AuthCallbackUrlService {
  constructor(private readonly configService: ConfigService) {}

  getOAuthCallbackUrl(provider: string, req?: Request): string {
    const envBackendUrl = this.configService.get('BACKEND_URL');
    const configuredBase = this.withApiBase(envBackendUrl);

    const requestBase = req ? this.withApiBase(this.getRequestBaseUrl(req)) : null;
    const shouldUseConfiguredBase =
      Boolean(configuredBase) && !this.isLocalhostUrl(configuredBase as string);

    const base =
      (shouldUseConfiguredBase ? configuredBase : null) ||
      requestBase ||
      configuredBase ||
      'http://localhost:3000/api';

    return `${base}/auth/oauth/${provider}/callback`;
  }

  getFrontendUrl(): string {
    return this.configService.get('FRONTEND_URL') || 'http://localhost:3002';
  }

  private isLocalhostUrl(url: string): boolean {
    return /localhost|127\.0\.0\.1/.test(url);
  }

  private withApiBase(url?: string | null): string | null {
    if (!url) return null;
    const normalized = url.replace(/\/+$/, '');
    return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
  }

  private getRequestBaseUrl(req: Request): string | null {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    if (!host) return null;
    const hostValue = Array.isArray(host) ? host[0] : host;
    const protoValue = Array.isArray(proto) ? proto[0] : proto || 'https';
    return `${protoValue}://${hostValue}`;
  }
}
