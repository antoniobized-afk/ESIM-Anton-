import { api } from './api';
import { MyContext } from './types';

export type BotSessionUser = {
  userId: string;
  initializedInSession: boolean;
};

async function fetchAndCacheBotUser(ctx: MyContext): Promise<{ userId: string } | null> {
  if (!ctx.from) return null;

  const user = await api.users.findOrCreate(BigInt(ctx.from.id), {
    username: ctx.from.username,
    firstName: ctx.from.first_name,
    lastName: ctx.from.last_name,
  });
  ctx.session.userId = user.id;

  return { userId: user.id };
}

export async function ensureBotSessionUser(
  ctx: MyContext,
): Promise<BotSessionUser | null> {
  if (ctx.session.userId) {
    return { userId: ctx.session.userId, initializedInSession: false };
  }

  const fresh = await fetchAndCacheBotUser(ctx);
  return fresh ? { userId: fresh.userId, initializedInSession: true } : null;
}

// `/start` не доверяет кэшированному ctx.session.userId: сессия теперь
// per-user (getSessionKey = ctx.from.id), но userId в ней мог протухнуть
// после account merge (Phase 18). `/start` всегда резолвит canonical userId
// свежим find-or-create запросом и перезаписывает ctx.session.userId.
export async function resolveFreshBotSessionUser(
  ctx: MyContext,
): Promise<{ userId: string } | null> {
  return fetchAndCacheBotUser(ctx);
}

export function isStartCommand(ctx: MyContext) {
  return /^\/start(?:@\w+)?(?:\s|$)/.test(ctx.message?.text ?? '');
}
