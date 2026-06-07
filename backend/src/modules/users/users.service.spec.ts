import { ConflictException } from '@nestjs/common';
import { AuthIdentityProvider } from '@prisma/client';
import { UsersService } from './users.service';

function makeService() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    userIdentity: {
      findUnique: jest.fn(),
    },
  };

  return {
    prisma,
    service: new UsersService(prisma as any, {} as any),
  };
}

describe('UsersService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updateEmail запрещает email, занятый EMAIL identity другого user', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.userIdentity.findUnique.mockResolvedValue({ userId: 'other_user' });

    await expect(service.updateEmail('user_1', 'Owner@Example.com')).rejects.toThrow(
      ConflictException,
    );

    expect(prisma.userIdentity.findUnique).toHaveBeenCalledWith({
      where: {
        provider_providerSubject: {
          provider: AuthIdentityProvider.EMAIL,
          providerSubject: 'owner@example.com',
        },
      },
      select: { userId: true },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('updateEmail разрешает email, если EMAIL identity принадлежит тому же user', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.userIdentity.findUnique.mockResolvedValue({ userId: 'user_1' });
    prisma.user.update.mockResolvedValue({ id: 'user_1', email: 'owner@example.com' });

    const result = await service.updateEmail('user_1', ' Owner@Example.com ');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { email: 'owner@example.com' },
    });
    expect(result).toEqual({ id: 'user_1', email: 'owner@example.com' });
  });

  it('updateEmail остается идемпотентным для существующего users.email этого user', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'user_1' })
      .mockResolvedValueOnce({ id: 'user_1', email: 'owner@example.com' });
    prisma.userIdentity.findUnique.mockResolvedValue(null);

    const result = await service.updateEmail('user_1', 'owner@example.com');

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'user_1', email: 'owner@example.com' });
  });
});
