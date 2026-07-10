const MARKETING_VISITOR_TOKEN_KEY = 'mojo_marketing_visitor_token'
const MARKETING_LAUNCHES_KEY = 'mojo_marketing_launches'

export const MARKETING_ATTRIBUTION_CAPTURED_EVENT = 'mojo:marketing-attribution-captured'

type MarketingLaunch = {
  launchKey: string
  targetPath?: string
}

type MarketingLaunches = Record<string, MarketingLaunch>

function randomOpaqueKey() {
  const bytes = new Uint8Array(32)
  window.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function readLaunches(): MarketingLaunches {
  try {
    const raw = sessionStorage.getItem(MARKETING_LAUNCHES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? parsed as MarketingLaunches : {}
  } catch {
    return {}
  }
}

function writeLaunches(launches: MarketingLaunches) {
  sessionStorage.setItem(MARKETING_LAUNCHES_KEY, JSON.stringify(launches))
}

export function getOrCreateMarketingVisitorToken() {
  const existing = localStorage.getItem(MARKETING_VISITOR_TOKEN_KEY)
  if (existing && /^[A-Za-z0-9_-]{32,128}$/.test(existing)) {
    return existing
  }

  const token = randomOpaqueKey()
  localStorage.setItem(MARKETING_VISITOR_TOKEN_KEY, token)
  return token
}

export function getMarketingVisitorToken() {
  const token = localStorage.getItem(MARKETING_VISITOR_TOKEN_KEY)
  return token && /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : null
}

export function getOrCreateMarketingLaunch(shortCode: string): MarketingLaunch {
  const launches = readLaunches()
  const existing = launches[shortCode]
  if (existing && /^[A-Za-z0-9_-]{32,128}$/.test(existing.launchKey)) {
    return existing
  }

  const launch = { launchKey: randomOpaqueKey() }
  writeLaunches({ ...launches, [shortCode]: launch })
  return launch
}

export function saveMarketingLaunchTarget(shortCode: string, targetPath: string) {
  const launches = readLaunches()
  const launch = launches[shortCode]
  if (!launch) return

  writeLaunches({
    ...launches,
    [shortCode]: { ...launch, targetPath },
  })
}

export function clearMarketingAttributionStorage() {
  localStorage.removeItem(MARKETING_VISITOR_TOKEN_KEY)
  sessionStorage.removeItem(MARKETING_LAUNCHES_KEY)
}
