import { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { MyContext } from '../types';
import { config } from '../config';
import { api } from '../api';
import { resolveFreshBotSessionUser } from '../user-session';

// URL Mini App
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://client-production-bc6d.up.railway.app';
const ADMIN_PANEL_URL = process.env.ADMIN_PANEL_URL || 'https://admin-production-7c43.up.railway.app';

// Список Telegram ID админов
const ADMIN_IDS = [316662303, 8141463258, 323857366];

function isAdmin(userId: number | undefined): boolean {
  return userId !== undefined && ADMIN_IDS.includes(userId);
}

// Экранирование спецсимволов для Markdown
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

export function setupCommands(bot: Bot<MyContext>) {
  // /start
  bot.command('start', async (ctx) => {
    const userId = ctx.from?.id;
    const firstName = escapeMarkdown(ctx.from?.first_name || 'друг');
    const payload = ctx.match; // Получаем payload (например, "ref_12345")

    // Payload разобран до find-or-create: ma_ не может сначала завершить
    // регистрацию как direct через общий middleware.
    if (userId) {
      try {
        const user = await resolveFreshBotSessionUser(ctx);
        if (!user) throw new Error('Не удалось получить canonical Telegram user');

        const marketingStartParam =
          typeof payload === 'string' && payload.startsWith('ma_') ? payload : undefined;
        try {
          await api.marketingAttribution.captureTelegramBotTouch({
            userId: user.userId,
            telegramId: String(userId),
            startParam: marketingStartParam,
            sourceEventKey: marketingStartParam
              ? `telegram-bot:${ctx.update.update_id}`
              : undefined,
          });
        } catch (error) {
          console.error('Ошибка сохранения marketing attribution:', error);
        }

        // Если есть реферальный код
        if (payload && typeof payload === 'string' && payload.startsWith('ref_')) {
          const referralCode = payload.replace('ref_', '');
          console.log(`🔗 Обработка реферальной ссылки: ${referralCode} для пользователя ${userId}`);

          try {
            await api.referrals.register(user.userId, BigInt(userId), referralCode);
            console.log('✅ Реферал успешно зарегистрирован');
          } catch (error) {
            console.error('❌ Ошибка регистрации реферала:', error);
          }
        }
      } catch (error) {
        console.error('Error in start command user processing:', error);
      }
    }

    const keyboard = new InlineKeyboard()
      .webApp('🌍 Открыть каталог', MINI_APP_URL)
      .row()
      .webApp('👤 Мой профиль', `${MINI_APP_URL}/profile`)
      .webApp('📦 Мои eSIM', `${MINI_APP_URL}/my-esim`)
      .row()
      .webApp('🎁 Рефералы', `${MINI_APP_URL}/referrals`)
      .text('❓ Помощь', 'help');

    // Добавляем кнопку админпанели для админов
    if (isAdmin(userId)) {
      keyboard.row().webApp('⚙️ Админпанель', ADMIN_PANEL_URL);
    }

    await ctx.reply(
      `👋 Привет, ${firstName}!\n\n` +
      `Добро пожаловать в *Mojo mobile* — твой надежный партнер для мобильного интернета по всему миру! 🌐\n\n` +
      `🔥 *Что мы предлагаем:*\n` +
      `• Более 100 стран\n` +
      `• Моментальная активация\n` +
      `• Выгодные цены\n` +
      `• Круглосуточная поддержка\n\n` +
      `👇 Нажми кнопку чтобы открыть приложение:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  });

  // Команда /catalog - открыть Mini App напрямую
  bot.command('catalog', async (ctx) => {
    const keyboard = new InlineKeyboard()
      .webApp('🌍 Открыть каталог', MINI_APP_URL);

    await ctx.reply(
      '🌍 **Каталог Mojo mobile**\n\nНажми кнопку чтобы открыть каталог:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  });

  // Команда /profile
  bot.command('profile', async (ctx) => {
    const keyboard = new InlineKeyboard()
      .webApp('👤 Открыть профиль', `${MINI_APP_URL}/profile`);

    await ctx.reply(
      '👤 **Мой профиль**\n\nНажми кнопку чтобы открыть профиль:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  });

  // Команда /orders
  bot.command('orders', async (ctx) => {
    const keyboard = new InlineKeyboard()
      .webApp('📦 Открыть Мои eSIM', `${MINI_APP_URL}/my-esim`);

    await ctx.reply(
      '📦 **Мои eSIM**\n\nЗдесь вы найдете все ваши купленные eSIM и QR-коды для активации:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  });

  // Команда /referrals
  bot.command('referrals', async (ctx) => {
    const keyboard = new InlineKeyboard()
      .webApp('🎁 Открыть рефералы', `${MINI_APP_URL}/referrals`);

    await ctx.reply(
      '🎁 **Реферальная программа**\n\nНажми кнопку чтобы открыть:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  });

  // Обработка кнопки "Помощь"
  bot.callbackQuery('help', async (ctx) => {
    await ctx.answerCallbackQuery();

    await ctx.editMessageText(
      `❓ **Помощь**\n\n` +
      `**Как купить eSIM?**\n` +
      `1. Нажми "Открыть каталог"\n` +
      `2. Выбери страну и тариф\n` +
      `3. Оплати заказ\n` +
      `4. Получи QR-код для активации\n\n` +
      `**Как активировать eSIM?**\n` +
      `1. Настройки → Сотовая связь\n` +
      `2. Добавить eSIM\n` +
      `3. Сканируй QR-код\n\n` +
      `**Команды:**\n` +
      `/start - Главное меню\n` +
      `/catalog - Каталог Mojo mobile\n` +
      `/orders - Мои заказы\n` +
      `/profile - Профиль\n` +
      `/referrals - Рефералы\n\n` +
      `Поддержка: @support`,
      {
        parse_mode: 'Markdown',
      }
    );
  });

  // /help
  bot.command('help', async (ctx) => {
    let helpText = `❓ **Помощь**\n\n` +
      `Доступные команды:\n` +
      `/start - Главное меню\n` +
      `/help - Помощь\n` +
      `/catalog - Каталог Mojo mobile\n` +
      `/profile - Мой профиль\n` +
      `/orders - Мои заказы`;

    if (isAdmin(ctx.from?.id)) {
      helpText += `\n/admin - Админпанель`;
    }

    await ctx.reply(helpText, { parse_mode: 'Markdown' });
  });

  // /admin - только для админов
  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply('⛔ У вас нет доступа к админпанели.');
      return;
    }

    const keyboard = new InlineKeyboard()
      .webApp('⚙️ Открыть админпанель', ADMIN_PANEL_URL);

    await ctx.reply(
      `🔐 **Админпанель**\n\n` +
      `Привет, админ! Нажми кнопку чтобы открыть панель управления:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  });
}
