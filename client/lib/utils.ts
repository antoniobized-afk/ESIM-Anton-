import {
  getCountryCode as resolveCountryCode,
  getCountryName as resolveCountryName,
} from '@shared/country-display';

/**
 * Форматирование цены
 * Бэкенд возвращает цены в рублях
 */
export const formatPrice = (price: number | string): string => {
  const num = Number(price) || 0;
  return Math.round(num).toLocaleString('ru-RU');
};

/**
 * Форматирование объёма данных
 * Бэкенд должен возвращать правильный формат ("500 MB", "20 GB")
 * Но на случай багов - исправляем на клиенте
 */
export const formatDataAmount = (amount: string): string => {
  if (!amount) return '';
  
  // Если уже правильный формат - возвращаем как есть
  const match = amount.match(/^(\d+)\s*(MB|GB)$/i);
  if (!match) return amount;
  
  const value = parseInt(match[1], 10);
  const unit = match[2].toUpperCase();
  
  // Проверяем на баги бэкенда:
  // Если "500 GB" но значение < 100 - это норм (500 GB = 500 гигабайт)
  // Если "1024 GB" - это скорее всего баг, должно быть "1 GB"
  // Если "20480 GB" - это баг, должно быть "20 GB"
  
  if (unit === 'GB') {
    if (value >= 1000) {
      // Баг: значение в MB показано как GB
      // 1024 GB -> 1 GB, 20480 GB -> 20 GB
      const correctGB = Math.round(value / 1024);
      return `${correctGB} GB`;
    }
    if (value >= 100 && value < 1000) {
      // Баг: значение в MB показано как GB  
      // 500 GB -> 500 MB
      return `${value} MB`;
    }
  }
  
  return amount;
};

export const getCountryCode = resolveCountryCode;

/**
 * URL картинки флага через CDN (работает на всех устройствах).
 * На Android/WebView SVG с некоторых CDN может отображаться некорректно,
 * поэтому используем PNG-версии.
 */
export const getFlagUrl = (country: string): string => {
  const code = getCountryCode(country).toLowerCase();
  if (code === 'xx') return '';
  
  // Проксируем через свой домен (rewrite в next.config.js) чтобы
  // избежать блокировки внешних картинок на Android.
  return `/flags/${code}.png`;
};

export const getCountryName = resolveCountryName;

/**
 * Флаг страны по ISO коду или названию (для старого кода)
 * @deprecated Используй getFlagUrl для картинок
 */
export const getCountryEmoji = (country: string): string => {
  if (!country) return '🌍';
  
  const code = getCountryCode(country);
  if (code === 'XX') return '🌍';
  
  const offset = 127397;
  try {
    return String.fromCodePoint(
      code.charCodeAt(0) + offset,
      code.charCodeAt(1) + offset
    );
  } catch {
    return '🌍';
  }
};
