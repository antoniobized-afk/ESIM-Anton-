import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtUserGuard } from '@/common/auth/jwt-user.guard';
import { MarketingAttributionWebController } from './marketing-attribution-web.controller';

describe('MarketingAttributionWebController', () => {
  const webAttribution = {
    captureWebTouch: jest.fn(),
    claimWebTouches: jest.fn(),
  };
  const controller = new MarketingAttributionWebController(webAttribution as any);

  beforeEach(() => jest.clearAllMocks());

  it('оставляет public capture без user guard и передаёт DTO owner-у', async () => {
    const dto = {
      campaignCode: 'Campaign123',
      visitorToken: 'a'.repeat(64),
      launchKey: 'b'.repeat(64),
    };
    webAttribution.captureWebTouch.mockResolvedValue({ accepted: true, targetPath: '/catalog' });

    await expect(controller.capture(dto)).resolves.toEqual({ accepted: true, targetPath: '/catalog' });

    expect(Reflect.getMetadata(GUARDS_METADATA, MarketingAttributionWebController.prototype.capture))
      .toBeUndefined();
    expect(webAttribution.captureWebTouch).toHaveBeenCalledWith(dto);
  });

  it('защищает claim user JWT и берёт canonical user id только из guard context', async () => {
    const dto = { visitorToken: 'a'.repeat(64) };
    webAttribution.claimWebTouches.mockResolvedValue({ claimedTouches: 1, registrationFinalized: true });

    await expect(controller.claim(dto, { id: 'user_1', type: 'user' })).resolves.toEqual({
      claimedTouches: 1,
      registrationFinalized: true,
    });

    expect(Reflect.getMetadata(GUARDS_METADATA, MarketingAttributionWebController.prototype.claim))
      .toEqual([JwtUserGuard]);
    expect(webAttribution.claimWebTouches).toHaveBeenCalledWith('user_1', dto);
  });
});
