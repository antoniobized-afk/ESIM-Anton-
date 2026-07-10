import { api } from './api';
import { MyContext } from './types';

export type BotSessionUser = {
  userId: string;
  initializedInSession: boolean;
};

export async function ensureBotSessionUser(
  ctx: MyContext,
): Promise<BotSessionUser | null> {
  if (ctx.session.userId) {
    return { userId: ctx.session.userId, initializedInSession: false };
  }
  if (!ctx.from) return null;

  const user = await api.users.findOrCreate(BigInt(ctx.from.id), {
    username: ctx.from.username,
    firstName: ctx.from.first_name,
    lastName: ctx.from.last_name,
  });
  ctx.session.userId = user.id;

  return { userId: user.id, initializedInSession: true };
}

export function isStartCommand(ctx: MyContext) {
  return /^\/start(?:@\w+)?(?:\s|$)/.test(ctx.message?.text ?? '');
}
