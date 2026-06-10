#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import {
  GEOLOCATE_IP,
  GET_MY_IP,
  REVERSE_GEOCODE,
} from './tools.js';
import {
  getPublicIp,
  Location,
  lookupIp,
  ProviderError,
  reverseGeocode,
} from './providers.js';

// === Formatters ===

function formatLocationText(loc: Location): string {
  const lines: string[] = [];
  if (loc.ip) lines.push(`IP address: ${loc.ip}`);
  if (loc.display_name) {
    lines.push(`Address: ${loc.display_name}`);
  } else {
    const city = loc.city || 'unknown city';
    const region = loc.region || 'unknown region';
    const country = loc.country || 'unknown country';
    lines.push(`Location: ${city}, ${region}, ${country}`);
  }
  if (loc.postal_code) lines.push(`Postal code: ${loc.postal_code}`);
  lines.push(`Coordinates: ${loc.latitude}, ${loc.longitude}`);
  lines.push(`Timezone: ${loc.timezone}`);
  if (loc.utc_offset) lines.push(`UTC offset: ${loc.utc_offset}`);
  if (loc.isp) lines.push(`ISP: ${loc.isp}`);
  if (loc.company_name && loc.company_name !== loc.isp) {
    lines.push(`Organization: ${loc.company_name}`);
  }
  if (loc.asn !== undefined) lines.push(`ASN: ${loc.asn}`);
  if (loc.currency_code) lines.push(`Currency: ${loc.currency_code}`);
  if (typeof loc.is_eu === 'boolean') lines.push(`In EU: ${loc.is_eu}`);
  if (loc.continent) lines.push(`Continent: ${loc.continent}`);
  if (loc.accuracy) lines.push(`Accuracy: ${loc.accuracy}`);

  const flags: string[] = [];
  if (loc.is_vpn) flags.push('VPN');
  if (loc.is_tor) flags.push('Tor');
  if (loc.is_proxy) flags.push('proxy');
  if (loc.is_datacenter) flags.push('datacenter');
  if (loc.is_mobile) flags.push('mobile');
  if (loc.is_crawler) flags.push('crawler');
  if (loc.is_abuser) flags.push('abuser');
  if (flags.length > 0) lines.push(`Network flags: ${flags.join(', ')}`);

  lines.push(`Source: ${loc.source}`);
  return lines.join('\n');
}

function formatLocationJson(loc: Location): string {
  return JSON.stringify(loc, null, 2);
}

function errorMessage(error: unknown): string {
  if (error instanceof ProviderError) return `${error.provider}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

// === Server ===

const server = new McpServer({
  name: 'location-mcp',
  version: '0.1.0',
}, {
  capabilities: {
    tools: {},
    logging: {},
  },
});

// Register geolocate_ip tool
server.registerTool(
  GEOLOCATE_IP.name,
  {
    description: GEOLOCATE_IP.description,
    inputSchema: GEOLOCATE_IP.schema,
  },
  async (args) => {
    try {
      const location = await lookupIp(args.ip);
      return {
        content: [
          {
            type: 'text' as const,
            text: args.format === 'json' ? formatLocationJson(location) : formatLocationText(location),
          },
        ],
      };
    } catch (error: unknown) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error looking up IP: ${errorMessage(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// Register reverse_geocode tool
server.registerTool(
  REVERSE_GEOCODE.name,
  {
    description: REVERSE_GEOCODE.description,
    inputSchema: REVERSE_GEOCODE.schema,
  },
  async (args) => {
    try {
      const location = await reverseGeocode(args.latitude, args.longitude);
      return {
        content: [
          {
            type: 'text' as const,
            text: args.format === 'json' ? formatLocationJson(location) : formatLocationText(location),
          },
        ],
      };
    } catch (error: unknown) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error reverse geocoding: ${errorMessage(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// Register get_my_ip tool
server.registerTool(
  GET_MY_IP.name,
  {
    description: GET_MY_IP.description,
    inputSchema: GET_MY_IP.schema,
  },
  async (args) => {
    try {
      const ip = await getPublicIp();
      const text = args.format === 'json'
        ? JSON.stringify({ ip }, null, 2)
        : `The public IP of the host is ${ip}.`;
      return {
        content: [
          {
            type: 'text' as const,
            text,
          },
        ],
      };
    } catch (error: unknown) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error detecting public IP: ${errorMessage(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

async function runServer() {
  try {
    process.stdout.write('Starting Location MCP server...\n');
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error starting Location MCP server: ${message}\n`);
    process.exit(1);
  }
}

runServer().catch(error => {
  const errorMessageText = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error running Location MCP server: ${errorMessageText}\n`);
  process.exit(1);
});
