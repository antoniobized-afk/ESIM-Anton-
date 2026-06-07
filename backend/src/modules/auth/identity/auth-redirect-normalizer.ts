const RETURN_TO_BASE_ORIGIN = 'https://app.mojomobile.ru';

export function normalizeRelativeReturnTo(
  value: string | null | undefined,
  fallback = '/',
): string {
  const normalizedFallback = normalizeFallback(fallback);
  if (!value) return normalizedFallback;

  const decoded = safeDecode(value.trim());
  if (!decoded) return normalizedFallback;
  if (decoded.includes('\\')) return normalizedFallback;
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return normalizedFallback;

  try {
    const url = new URL(decoded, RETURN_TO_BASE_ORIGIN);
    if (url.origin !== RETURN_TO_BASE_ORIGIN) return normalizedFallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return normalizedFallback;
  }
}

function normalizeFallback(fallback: string): string {
  if (!fallback.startsWith('/') || fallback.startsWith('//')) return '/';
  return fallback.includes('\\') ? '/' : fallback;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
