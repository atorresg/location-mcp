import { z } from 'zod/v4';

const OUTPUT_FORMAT = z.enum(['text', 'json'])
  .describe('Output format. "text" returns a human-readable summary; "json" returns the raw structured data.')
  .default('text');

export const GEOLOCATE_IP = {
  name: 'geolocate_ip',
  description: 'Look up geolocation data for an IP address (country, city, region, latitude, longitude, timezone, ISP, currency, etc.). If no IP is provided, automatically detects the public IP of the host running this server and geolocates that.',
  schema: z.object({
    ip: z.string()
      .describe('The IPv4 or IPv6 address to look up. If omitted, the server auto-detects its own public IP.')
      .optional(),
    format: OUTPUT_FORMAT,
  }),
} as const;

export const REVERSE_GEOCODE = {
  name: 'reverse_geocode',
  description: 'Reverse geocode a latitude/longitude pair into a human-readable address with administrative details (city, region, country, postal code, country code, etc.).',
  schema: z.object({
    latitude: z.number()
      .min(-90)
      .max(90)
      .describe('Latitude in decimal degrees. Range: -90 (South) to 90 (North). Example: 40.7128'),
    longitude: z.number()
      .min(-180)
      .max(180)
      .describe('Longitude in decimal degrees. Range: -180 (West) to 180 (East). Example: -74.0060'),
    format: OUTPUT_FORMAT,
  }),
} as const;

export const GET_MY_IP = {
  name: 'get_my_ip',
  description: 'Detect and return the public IP address of the host running this MCP server. Useful when the LLM needs to know the public-facing IP of the machine it is operating on.',
  schema: z.object({
    format: OUTPUT_FORMAT,
  }),
} as const;
