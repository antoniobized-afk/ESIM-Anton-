import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAdminGuard } from '@/common/auth/jwt-user.guard';
import { MarketingUserTimelineController } from './marketing-user-timeline.controller';
import { MarketingUserTimelineService } from './marketing-user-timeline.service';

describe('MarketingUserTimelineController', () => {
  const timeline = { getUserTimeline: jest.fn() };
  const controller = new MarketingUserTimelineController(
    timeline as unknown as MarketingUserTimelineService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('закрывает timeline route admin JWT guard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, MarketingUserTimelineController);
    expect(guards).toEqual([JwtAdminGuard]);
  });

  it('делегирует canonical userId и пагинацию timeline owner', async () => {
    timeline.getUserTimeline.mockResolvedValue({ userId: 'user_1' });

    await expect(controller.getUserTimeline('user_1', { page: 2, limit: 10 })).resolves.toEqual({
      userId: 'user_1',
    });
    expect(timeline.getUserTimeline).toHaveBeenCalledWith('user_1', { page: 2, limit: 10 });
  });
});
