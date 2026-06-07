import { AuthCallbackUrlService } from './auth-callback-url.service';

describe('AuthCallbackUrlService', () => {
  const configService = {
    get: jest.fn(),
  };

  const service = new AuthCallbackUrlService(configService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('использует production BACKEND_URL как стабильную OAuth callback base', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'BACKEND_URL') return 'https://api.example.com';
      return undefined;
    });

    const url = service.getOAuthCallbackUrl('google', {
      headers: { host: 'proxy.example.net' },
      protocol: 'https',
    } as any);

    expect(url).toBe('https://api.example.com/api/auth/oauth/google/callback');
  });

  it('для localhost BACKEND_URL предпочитает request host из proxy headers', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'BACKEND_URL') return 'http://localhost:3000';
      return undefined;
    });

    const url = service.getOAuthCallbackUrl('yandex', {
      headers: {
        'x-forwarded-host': 'railway.example.com',
        'x-forwarded-proto': 'https',
      },
      protocol: 'http',
    } as any);

    expect(url).toBe('https://railway.example.com/api/auth/oauth/yandex/callback');
  });

  it('дает безопасный local fallback без request и BACKEND_URL', () => {
    configService.get.mockReturnValue(undefined);

    const url = service.getOAuthCallbackUrl('vk');

    expect(url).toBe('http://localhost:3000/api/auth/oauth/vk/callback');
  });

  it('getFrontendUrl читает FRONTEND_URL или возвращает local fallback', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'FRONTEND_URL') return 'https://app.example.com';
      return undefined;
    });

    expect(service.getFrontendUrl()).toBe('https://app.example.com');

    configService.get.mockReturnValue(undefined);

    expect(service.getFrontendUrl()).toBe('http://localhost:3002');
  });
});
