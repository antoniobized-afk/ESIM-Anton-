/**
 * Type-safe error message extraction for catch(error: unknown) blocks.
 * Works with Axios errors, standard Error objects, and arbitrary throwables.
 */
const normalizeMessage = (message: unknown): string | undefined => {
  if (typeof message === 'string' && message.trim()) return message
  if (Array.isArray(message)) {
    const parts = message.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    return parts.length > 0 ? parts.join(', ') : undefined
  }

  return undefined
}

export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null) {
    const maybeAxios = error as { response?: { data?: { message?: unknown } }; message?: string }
    return normalizeMessage(maybeAxios.response?.data?.message) || maybeAxios.message || fallback
  }

  return fallback
}

export const getBlobErrorMessage = async (error: unknown, fallback: string): Promise<string> => {
  if (typeof error !== 'object' || error === null) return fallback

  const maybeAxios = error as { response?: { data?: unknown }; message?: string }
  const data = maybeAxios.response?.data

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    const text = await data.text()
    if (!text.trim()) return maybeAxios.message || fallback

    try {
      const parsed = JSON.parse(text) as { message?: unknown; error?: unknown }
      return normalizeMessage(parsed.message) || normalizeMessage(parsed.error) || text
    } catch {
      return text
    }
  }

  return getErrorMessage(error, fallback)
}
