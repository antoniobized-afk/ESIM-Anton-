const configuredApiOrigin = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

const API_ORIGIN = configuredApiOrigin.replace(/\/+$/, '')
export const API_BASE_URL = `${API_ORIGIN}/api`
