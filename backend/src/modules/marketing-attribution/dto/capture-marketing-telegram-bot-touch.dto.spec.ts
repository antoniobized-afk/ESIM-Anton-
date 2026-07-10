import { validate } from 'class-validator';
import { CaptureMarketingTelegramBotTouchDto } from './capture-marketing-telegram-bot-touch.dto';

describe('CaptureMarketingTelegramBotTouchDto', () => {
  it('отклоняет нестроковый startParam валидацией вместо runtime TypeError', async () => {
    const dto = new CaptureMarketingTelegramBotTouchDto();
    dto.userId = 'user_1';
    dto.telegramId = '123456789';
    Reflect.set(dto, 'startParam', 123);

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'startParam' }),
      ]),
    );
  });
});
