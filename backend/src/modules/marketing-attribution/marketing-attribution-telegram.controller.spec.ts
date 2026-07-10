import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ServiceTokenGuard } from '@/common/auth/service-token.guard';
import { MarketingAttributionTelegramController } from './marketing-attribution-telegram.controller';

describe('MarketingAttributionTelegramController', () => {
  const telegramAttribution = {
    captureBotTouch: jest.fn(),
  };
  const controller = new MarketingAttributionTelegramController(telegramAttribution as never);

  beforeEach(() => jest.clearAllMocks());

  it('принимает bot capture только под ServiceTokenGuard и передаёт DTO owner-у', async () => {
    const dto = {
      userId: 'user_1',
      telegramId: '123456789',
      startParam: 'ma_Campaign123',
      sourceEventKey: 'telegram-bot:101',
    };
    telegramAttribution.captureBotTouch.mockResolvedValue({
      accepted: true,
      registrationFinalized: true,
    });

    await expect(controller.captureBotTouch(dto)).resolves.toEqual({
      accepted: true,
      registrationFinalized: true,
    });

    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        MarketingAttributionTelegramController.prototype.captureBotTouch,
      ),
    ).toEqual([ServiceTokenGuard]);
    expect(telegramAttribution.captureBotTouch).toHaveBeenCalledWith(dto);
  });
});
