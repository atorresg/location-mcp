/**
 * Geolocation provider layer.
 *
 * Two backends are supported, selected at startup:
 *   - Keyless (default): ipapi.is for IP → location, Nominatim for reverse geocoding.
 *   - With LOCATION_MCP_API_KEY: ipinfo.io for IP → location (Nominatim still used for reverse).
 *
 * Results are cached in-memory with TTL: 24h for IP lookups, 7d for reverse geocoding.
 */

const REQUEST_TIMEOUT_MS = 5000;

const IP_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REVERSE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const API_KEY = process.env['LOCATION_MCP_API_KEY']?.trim();
const USE_IPINFO = typeof API_KEY === 'string' && API_KEY.length > 0;

// === Types ===

export type LocationSource =
  | 'ipapi.is'
  | 'ipinfo.io'
  | 'nominatim.openstreetmap.org';

export type Location = {
  ip?: string;
  latitude: number;
  longitude: number;
  city: string;
  region: string;
  country: string;
  country_code: string;
  postal_code?: string;
  timezone: string;
  utc_offset?: string;
  is_dst?: boolean;
  isp?: string;
  company_name?: string;
  company_domain?: string;
  asn?: number | string;
  currency_code?: string;
  calling_code?: string;
  is_eu?: boolean;
  continent?: string;
  accuracy?: string;
  // Security flags (only from ipapi.is)
  is_vpn?: boolean;
  is_tor?: boolean;
  is_proxy?: boolean;
  is_datacenter?: boolean;
  is_mobile?: boolean;
  is_crawler?: boolean;
  is_abuser?: boolean;
  is_bogon?: boolean;
  // Reverse geocoding only
  display_name?: string;
  source: LocationSource;
};

export class ProviderError extends Error {
  constructor(
    public readonly provider: LocationSource | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

// === Cache ===

type CacheEntry<T> = { data: T; expiresAt: number };
const cache = new Map<string, CacheEntry<Location>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// === IP validation (catches private/reserved ranges) ===

const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^10\./,                       // 10.0.0.0/8
  /^192\.168\./,                 // 192.168.0.0/16
  /^172\.(1[6-9]|2\d|3[01])\./,  // 172.16.0.0/12
  /^127\./,                      // loopback
  /^169\.254\./,                 // link-local
  /^0\./,                        // current network
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./, // 100.64.0.0/10 CGNAT
  /^224\./,                      // multicast
  /^240\./,                      // reserved
  /^::1$/,                       // IPv6 loopback
  /^fc[0-9a-fA-F]{2}:/,          // IPv6 unique local
  /^fe80:/,                      // IPv6 link-local
];

function isPrivateOrReservedIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some(p => p.test(ip));
}

// === HTTP helper ===

async function fetchJson<T>(
  url: string,
  headers?: Record<string, string>,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...(headers ?? {}) },
      signal: controller.signal,
    });
    if (!response.ok) {
      let body = '';
      try { body = (await response.text()).slice(0, 200); } catch { /* ignore */ }
      throw new ProviderError(
        'unknown',
        `HTTP ${response.status} ${response.statusText}${body ? `: ${body}` : ''}`,
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderError('unknown', `Request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderError('unknown', `Network error: ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

// === ipapi.is (default keyless provider) ===

const IPAPI_IS_BASE = 'https://api.ipapi.is/json/';

type IpapiIsLocation = {
  is_eu_member?: boolean;
  calling_code?: string;
  currency_code?: string;
  continent?: string;
  country?: string;
  country_code?: string;
  state?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  zip?: string;
  timezone?: string;
  is_dst?: boolean;
  utcoffset?: string;
  accuracy?: string;
};

type IpapiIsResponse = {
  ip?: string;
  rir?: string;
  is_bogon?: boolean;
  is_mobile?: boolean;
  is_satellite?: boolean;
  is_crawler?: boolean;
  is_datacenter?: boolean;
  is_tor?: boolean;
  is_proxy?: boolean;
  is_vpn?: boolean;
  is_abuser?: boolean;
  company?: { name?: string; domain?: string };
  asn?: number | { asn?: number };
  location?: IpapiIsLocation;
};

function mapIpapiIs(data: IpapiIsResponse, fallbackIp?: string): Location {
  if (data.is_bogon || isPrivateOrReservedIp(data.ip ?? '')) {
    throw new ProviderError(
      'ipapi.is',
      'Private or reserved IP address — cannot be geolocated',
    );
  }
  const loc = data.location;
  if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') {
    throw new ProviderError('ipapi.is', 'Response missing latitude/longitude');
  }
  const asn = typeof data.asn === 'object' && data.asn !== null ? data.asn.asn : data.asn;
  return {
    ip: data.ip ?? fallbackIp,
    latitude: loc.latitude,
    longitude: loc.longitude,
    city: loc.city ?? '',
    region: loc.state ?? '',
    country: loc.country ?? '',
    country_code: loc.country_code ?? '',
    postal_code: loc.zip,
    timezone: loc.timezone ?? 'UTC',
    utc_offset: loc.utcoffset,
    is_dst: loc.is_dst,
    isp: data.company?.name,
    company_name: data.company?.name,
    company_domain: data.company?.domain,
    asn,
    currency_code: loc.currency_code,
    calling_code: loc.calling_code,
    is_eu: loc.is_eu_member,
    continent: loc.continent,
    accuracy: loc.accuracy,
    is_vpn: data.is_vpn,
    is_tor: data.is_tor,
    is_proxy: data.is_proxy,
    is_datacenter: data.is_datacenter,
    is_mobile: data.is_mobile,
    is_crawler: data.is_crawler,
    is_abuser: data.is_abuser,
    is_bogon: data.is_bogon,
    source: 'ipapi.is',
  };
}

async function lookupIpIpapiIs(ip?: string): Promise<Location> {
  if (ip && isPrivateOrReservedIp(ip)) {
    throw new ProviderError('ipapi.is', 'Private or reserved IP address — cannot be geolocated');
  }
  const url = ip
    ? `${IPAPI_IS_BASE}?ip=${encodeURIComponent(ip)}`
    : IPAPI_IS_BASE;
  const data = await fetchJson<IpapiIsResponse>(url);
  return mapIpapiIs(data, ip);
}

// === ipinfo.io (optional, requires API key) ===

const IPINFO_BASE = 'https://ipinfo.io';

type IpinfoResponse = {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  postal?: string;
  loc?: string;
  timezone?: string;
  org?: string;
  bogon?: boolean;
};

function mapIpinfo(data: IpinfoResponse, fallbackIp?: string): Location {
  if (data.bogon) {
    throw new ProviderError('ipinfo.io', 'Private or reserved IP address — cannot be geolocated');
  }
  if (!data.loc) {
    throw new ProviderError('ipinfo.io', 'Response missing coordinates');
  }
  const [latStr, lonStr] = data.loc.split(',');
  const latitude = Number(latStr);
  const longitude = Number(lonStr);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new ProviderError('ipinfo.io', 'Invalid coordinates in response');
  }
  return {
    ip: data.ip ?? fallbackIp,
    latitude,
    longitude,
    city: data.city ?? '',
    region: data.region ?? '',
    country: data.country ?? '',
    country_code: data.country ?? '',
    postal_code: data.postal,
    timezone: data.timezone ?? 'UTC',
    isp: data.org,
    source: 'ipinfo.io',
  };
}

async function lookupIpIpinfo(ip?: string): Promise<Location> {
  if (!API_KEY) {
    throw new ProviderError('ipinfo.io', 'API key not configured (set LOCATION_MCP_API_KEY)');
  }
  if (ip && isPrivateOrReservedIp(ip)) {
    throw new ProviderError('ipinfo.io', 'Private or reserved IP address — cannot be geolocated');
  }
  const url = ip
    ? `${IPINFO_BASE}/${encodeURIComponent(ip)}/json?token=${API_KEY}`
    : `${IPINFO_BASE}/json?token=${API_KEY}`;
  const data = await fetchJson<IpinfoResponse>(url);
  return mapIpinfo(data, ip);
}

// === Nominatim reverse geocoding ===

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const NOMINATIM_USER_AGENT = 'location-mcp/0.1.0 (https://github.com/atorresg/location-mcp)';

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  county?: string;
  state?: string;
  region?: string;
  country?: string;
  country_code?: string;
  postcode?: string;
};

type NominatimResponse = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: NominatimAddress;
  extratags?: { timezone?: string };
  error?: string;
};

function mapNominatim(data: NominatimResponse, lat: number, lon: number): Location {
  if (data.error) {
    throw new ProviderError('nominatim.openstreetmap.org', data.error);
  }
  const addr = data.address ?? {};
  const city =
    addr.city ?? addr.town ?? addr.village ?? addr.hamlet ?? addr.municipality ?? '';
  const region = addr.state ?? addr.region ?? addr.county ?? '';
  return {
    latitude: lat,
    longitude: lon,
    city,
    region,
    country: addr.country ?? '',
    country_code: (addr.country_code ?? '').toUpperCase(),
    postal_code: addr.postcode,
    timezone: data.extratags?.timezone ?? 'UTC',
    display_name: data.display_name,
    source: 'nominatim.openstreetmap.org',
  };
}

async function reverseGeocodeNominatim(lat: number, lon: number): Promise<Location> {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new ProviderError('nominatim.openstreetmap.org', 'Latitude must be between -90 and 90');
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new ProviderError('nominatim.openstreetmap.org', 'Longitude must be between -180 and 180');
  }
  const url =
    `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lon}` +
    '&accept-language=en&zoom=18&addressdetails=1';
  const data = await fetchJson<NominatimResponse>(url, {
    'User-Agent': NOMINATIM_USER_AGENT,
    'Referer': 'https://github.com/atorresg/location-mcp',
  });
  return mapNominatim(data, lat, lon);
}

// === Public API ===

export async function lookupIp(ip?: string): Promise<Location> {
  const cacheKey = ip ? `ip:${ip}` : 'ip:self';
  const cached = getCached<Location>(cacheKey);
  if (cached) return cached;

  const result = USE_IPINFO ? await lookupIpIpinfo(ip) : await lookupIpIpapiIs(ip);
  setCached(cacheKey, result, IP_CACHE_TTL_MS);
  return result;
}

export async function reverseGeocode(lat: number, lon: number): Promise<Location> {
  // Round to 4 decimal places for cache key (~11m precision)
  const cacheKey = `rev:${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = getCached<Location>(cacheKey);
  if (cached) return cached;

  const result = await reverseGeocodeNominatim(lat, lon);
  setCached(cacheKey, result, REVERSE_CACHE_TTL_MS);
  return result;
}

export async function getPublicIp(): Promise<string> {
  // Self-lookup is the same as lookupIp() — providers return the caller's IP when none is specified.
  const location = await lookupIp();
  if (!location.ip) {
    throw new ProviderError('unknown', 'Provider did not return an IP address');
  }
  return location.ip;
}
