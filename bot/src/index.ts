import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { config } from './config';
import { setupCommands } from './commands';
import { setupScenes } from './scenes';
import { api } from './api';
import { MyContext } from './types';
import { ensureBotSessionUser, isStartCommand } from './user-session';

console.log(`
╔═══════════════════════════════════════╗
║   eSIM Telegram Bot                   ║
║   Запуск...                           ║
╚═══════════════════════════════════════╝
`);

// Создаем бота
const bot = new Bot<MyContext>(config.botToken);

// Middleware
bot.use(session({
  initial: (): any => ({
    userId: null,
    currentScene: null,
  }),
}));

bot.use(conversations());

// `/start` сам разбирает payload до find-or-create: так ma_ launch не
// превращается в direct registration раньше trusted capture.
bot.use(async (ctx, next) => {
  if (!isStartCommand(ctx) && ctx.from) {
    try {
      const user = await ensureBotSessionUser(ctx);
      if (user?.initializedInSession) {
        await api.marketingAttribution.captureTelegramBotTouch({
          userId: user.userId,
          telegramId: String(ctx.from.id),
        });
      }
    } catch (error) {
      console.error('Ошибка регистрации пользователя:', error);
    }
  }
  await next();
});

// Команды и сценарии
setupCommands(bot);
setupScenes(bot);

// Запуск бота
bot.start({
  onStart: () => {
    console.log(`
✅ Бот успешно запущен!
🤖 Username: @${bot.botInfo.username}
🔗 Link: https://t.me/${bot.botInfo.username}
    `);
  },
});

// Обработка ошибок
bot.catch((err) => {
  console.error('❌ Ошибка бота:', err);
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('\n⏳ Остановка бота...');
  bot.stop();
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('\n⏳ Остановка бота...');
  bot.stop();
  process.exit(0);
});
