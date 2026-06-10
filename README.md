# Location MCP Server

[![smithery badge](https://smithery.ai/badge/@atorresg/location-mcp)](https://smithery.ai/server/@atorresg/location-mcp)
[![GitHub stars](https://img.shields.io/github/stars/atorresg/location-mcp)](https://github.com/atorresg/location-mcp)
[![MIT licensed](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/atorresg/location-mcp)](https://github.com/atorresg/location-mcp/issues)

A Model Context Protocol (MCP) server that gives LLMs **geolocation awareness**: look up an IP, reverse geocode a coordinate pair, and detect the host's public IP. No API keys required out of the box.

Powered by [ipapi.is](https://ipapi.is), [Nominatim (OpenStreetMap)](https://nominatim.openstreetmap.org/), and optionally [ipinfo.io](https://ipinfo.io).

---

## Tools

- **`geolocate_ip(ip?, format?)`** — Look up geolocation data for an IPv4/IPv6 address (country, city, region, latitude/longitude, timezone, ISP, currency, etc.). If `ip` is omitted, automatically detects the public IP of the host.
- **`reverse_geocode(latitude, longitude, format?)`** — Reverse geocode a coordinate pair into a human-readable address (city, region, country, postal code, country code, timezone).
- **`get_my_ip(format?)`** — Detect and return the public IP address of the host running this MCP server.

All tools accept an optional `format` parameter: `"text"` (default, human-readable summary) or `"json"` (raw structured data for further processing).

---

## Examples

### Look up an IP
> "Where is IP 8.8.8.8 located?"

Returns:
> IP address: 8.8.8.8  
> Location: Mountain View, California, United States  
> Postal code: 94043  
> Coordinates: 37.4056, -122.0775  
> Timezone: America/Los_Angeles  
> UTC offset: -07:00  
> ISP: Google LLC  
> Currency: USD  
> In EU: false  
> Continent: NA  
> Source: ipapi.is

### Detect the host's public IP
> "What's the public IP of the machine running this server?"

Returns:
> The public IP of the host is 203.0.113.42.

### Reverse geocode coordinates
> "What's at 40.7128, -74.0060?"

Returns:
> Address: New York City Hall, 260, Broadway, Tribeca, Lower Manhattan, Manhattan, New York County, New York, 10007, United States  
> Postal code: 10007  
> Coordinates: 40.7128, -74.006  
> Timezone: America/New_York  
> Source: nominatim.openstreetmap.org

### Get raw JSON
Request `format: "json"` to receive the underlying structured data:
```json
{
  "ip": "8.8.8.8",
  "latitude": 37.4056,
  "longitude": -122.0775,
  "city": "Mountain View",
  "region": "California",
  "country": "United States",
  "country_code": "US",
  "postal_code": "94043",
  "timezone": "America/Los_Angeles",
  "utc_offset": "-07:00",
  "is_dst": true,
  "isp": "Google LLC",
  "company_name": "Google LLC",
  "company_domain": "google.com",
  "asn": 15169,
  "currency_code": "USD",
  "calling_code": "1",
  "is_eu": false,
  "continent": "NA",
  "accuracy": "HIGH",
  "is_datacenter": true,
  "is_vpn": true,
  "is_proxy": false,
  "is_tor": false,
  "is_mobile": false,
  "source": "ipapi.is"
}
```

---

## Installation

### Option 1: Via Smithery (recommended)

```bash
npx -y @smithery/cli install @atorresg/location-mcp --client claude-desktop
```

### Option 2: Via npm globally

```bash
npm install -g location-mcp
```

### Option 3: Via npx (no install)

```bash
npx -y location-mcp
```

---

## Configuration

### Optional: Use ipinfo.io (better rate limits)

By default, this server uses **ipapi.is** (keyless) for IP lookups and **Nominatim** (OpenStreetMap, keyless) for reverse geocoding.

To upgrade to [ipinfo.io](https://ipinfo.io) for IP lookups (their own free tier or paid production token), set the `LOCATION_MCP_API_KEY` environment variable to your ipinfo.io token **before starting the server**:

```bash
export LOCATION_MCP_API_KEY=your_ipinfo_token_here
location-mcp
```

Reverse geocoding always uses Nominatim (no equivalent in the free ipinfo tier).

---

## Client Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "location-mcp": {
      "command": "npx",
      "args": ["-y", "location-mcp"]
    }
  }
}
```

For an ipinfo.io upgrade:

```json
{
  "mcpServers": {
    "location-mcp": {
      "command": "npx",
      "args": ["-y", "location-mcp"],
      "env": {
        "LOCATION_MCP_API_KEY": "your_ipinfo_token_here"
      }
    }
  }
}
```

### Cursor

Add to your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "location-mcp": {
      "command": "npx",
      "args": ["-y", "location-mcp"]
    }
  }
}
```

### Windsurf

Add to your `model_config.json`:

```json
{
  "mcpServers": {
    "location-mcp": {
      "command": "npx",
      "args": ["-y", "location-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add location-mcp -- npx -y location-mcp
```

---

## Privacy & Limitations

- **VPN / Tor**: The detected public IP is the **exit node** of any VPN, proxy, or Tor circuit in use by the host. The MCP cannot detect the user's real physical location in that case.
- **Private / reserved IPs**: IPs in private ranges (e.g., `192.168.x.x`, `10.x.x.x`, `127.0.0.1`) and reserved ranges cannot be geolocated. The server returns a clear error.
- **Rate limits**: Keyless tier (ipapi.is) is suitable for light/personal use. For high-volume production use, configure an ipinfo.io API key.
- **Caching**: Results are cached in-memory for 24 hours (IP) and 7 days (reverse geocode). The cache is not persisted across server restarts. The cache is also process-local — no data is shared between MCP instances.
- **No data persistence**: The server does not log, store, or forward IP addresses beyond the in-memory cache.

---

## Attribution

This MCP server wraps the following third-party services:

- **[ipapi.is](https://ipapi.is/)** — IP address geolocation (free tier, keyless, with VPN/Tor/Proxy detection and company data). Used by default for IP lookups.
- **[Nominatim](https://nominatim.openstreetmap.org/)** — Reverse geocoding (OpenStreetMap project). © OpenStreetMap contributors. Used for `reverse_geocode`.
- **[ipinfo.io](https://ipinfo.io)** — IP address geolocation (optional upgrade). Used only when `LOCATION_MCP_API_KEY` is set.

Map data from OpenStreetMap is licensed under the [Open Database License (ODbL)](https://www.openstreetmap.org/copyright).

---

## Development

```bash
# Install dependencies
npm install

# Run in dev mode (hot reload via tsx)
npm run dev

# Lint
npm run lint
npm run lint:fix

# Build (CJS + ESM output)
npm run build
```

The build output goes to `dist/`:
- `dist/index.cjs` — CommonJS bundle
- `dist/index.js` — ESM bundle (executable, `chmod 755`)

---

## License

MIT © [atorresg](https://github.com/atorresg)
