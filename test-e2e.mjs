#!/usr/bin/env node
// E2E test script: spawns the MCP server over stdio and exercises all 3 tools.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/index.js'],
});

const client = new Client(
  { name: 'location-mcp-test', version: '0.0.1' },
  { capabilities: {} },
);

let failures = 0;

function ok(label) {
  process.stdout.write(`✓ ${label}\n`);
}
function fail(label, msg) {
  process.stdout.write(`✗ ${label}: ${msg}\n`);
  failures += 1;
}

async function callOk(label, fn) {
  try {
    const result = await fn();
    ok(label);
    return result;
  } catch (err) {
    fail(label, err.message);
    return null;
  }
}

async function callExpectError(label, fn) {
  try {
    const result = await fn();
    if (result && result.isError) {
      ok(`${label} (got expected isError)`);
      return result;
    }
    fail(label, 'expected an error response, got success');
    return null;
  } catch (err) {
    ok(`${label} (caught: ${err.message})`);
    return null;
  }
}

async function main() {
  await client.connect(transport);

  // 1. List tools
  const tools = await callOk('List tools', () => client.listTools());
  if (tools) {
    const names = tools.tools.map(t => t.name).sort();
    const expected = ['geolocate_ip', 'get_my_ip', 'reverse_geocode'].sort();
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
      fail('Tool names match', `got ${names.join(',')}, expected ${expected.join(',')}`);
    } else {
      ok(`Found tools: ${names.join(', ')}`);
    }
  }

  // 2. get_my_ip (text)
  const myIpText = await callOk('get_my_ip (text)', () =>
    client.callTool({ name: 'get_my_ip', arguments: {} }),
  );
  if (myIpText) {
    process.stdout.write(`    ${myIpText.content[0].text}\n`);
  }

  // 3. get_my_ip (json)
  const myIpJson = await callOk('get_my_ip (json)', () =>
    client.callTool({ name: 'get_my_ip', arguments: { format: 'json' } }),
  );
  if (myIpJson) {
    try {
      const parsed = JSON.parse(myIpJson.content[0].text);
      if (!parsed.ip || !/^[\d.:a-fA-F]+$/.test(parsed.ip)) {
        fail('get_my_ip returns valid IP', `got ${parsed.ip}`);
      } else {
        ok(`get_my_ip returns valid IP: ${parsed.ip}`);
      }
    } catch (e) {
      fail('get_my_ip (json) parseable', e.message);
    }
  }

  // 4. geolocate_ip for 8.8.8.8 (text)
  const googleText = await callOk('geolocate_ip 8.8.8.8 (text)', () =>
    client.callTool({ name: 'geolocate_ip', arguments: { ip: '8.8.8.8' } }),
  );
  if (googleText) {
    const text = googleText.content[0].text;
    process.stdout.write(`    ${text}\n`);
    if (!/United States/i.test(text)) fail('country=United States', `text was: ${text}`);
  }

  // 5. geolocate_ip for 8.8.8.8 (json)
  const googleJson = await callOk('geolocate_ip 8.8.8.8 (json)', () =>
    client.callTool({ name: 'geolocate_ip', arguments: { ip: '8.8.8.8', format: 'json' } }),
  );
  if (googleJson) {
    try {
      const data = JSON.parse(googleJson.content[0].text);
      process.stdout.write(`    country=${data.country}, city=${data.city}, source=${data.source}\n`);
      if (data.country_code !== 'US') fail('country_code=US', `got ${data.country_code}`);
      if (data.source !== 'ipapi.is') fail('source=ipapi.is', `got ${data.source}`);
      if (data.latitude === undefined || data.longitude === undefined) {
        fail('has coordinates', 'missing lat/lon');
      }
      if (typeof data.is_vpn !== 'boolean') fail('has is_vpn flag', 'missing security flag');
    } catch (e) {
      fail('geolocate_ip (json) parseable', e.message);
    }
  }

  // 6. geolocate_ip with private IP (should error gracefully)
  await callExpectError('geolocate_ip 192.168.1.1 (private IP)', () =>
    client.callTool({ name: 'geolocate_ip', arguments: { ip: '192.168.1.1' } }),
  );

  // 7. reverse_geocode for NYC (text)
  const nycText = await callOk('reverse_geocode NYC (text)', () =>
    client.callTool({
      name: 'reverse_geocode',
      arguments: { latitude: 40.7128, longitude: -74.0060 },
    }),
  );
  if (nycText) {
    const text = nycText.content[0].text;
    process.stdout.write(`    ${text}\n`);
    if (!/United States/i.test(text)) fail('reverse geocode USA', `text was: ${text}`);
  }

  // 8. reverse_geocode for NYC (json)
  const nycJson = await callOk('reverse_geocode NYC (json)', () =>
    client.callTool({
      name: 'reverse_geocode',
      arguments: { latitude: 40.7128, longitude: -74.0060, format: 'json' },
    }),
  );
  if (nycJson) {
    try {
      const data = JSON.parse(nycJson.content[0].text);
      process.stdout.write(`    country=${data.country}, display_name="${(data.display_name ?? '').slice(0, 80)}"\n`);
      if (data.source !== 'nominatim.openstreetmap.org') {
        fail('reverse source=nominatim', `got ${data.source}`);
      }
      if (!data.display_name) fail('reverse has display_name', 'missing');
    } catch (e) {
      fail('reverse_geocode (json) parseable', e.message);
    }
  }

  // 9. Cache test: call geolocate_ip 8.8.8.8 twice, second should be <100ms
  await client.callTool({ name: 'geolocate_ip', arguments: { ip: '8.8.8.8' } });
  const t0 = Date.now();
  await client.callTool({ name: 'geolocate_ip', arguments: { ip: '8.8.8.8' } });
  const elapsed = Date.now() - t0;
  if (elapsed > 100) {
    fail('cache hit <100ms', `2nd call took ${elapsed}ms`);
  } else {
    ok(`cache hit took ${elapsed}ms`);
  }

  // 10. Input validation: bad lat (Zod should reject)
  await callExpectError('reverse_geocode invalid lat=999 (Zod)', () =>
    client.callTool({ name: 'reverse_geocode', arguments: { latitude: 999, longitude: 0 } }),
  );

  // 11. geolocate_ip with omit ip = self-lookup
  const selfResult = await callOk('geolocate_ip (self, no ip)', () =>
    client.callTool({ name: 'geolocate_ip', arguments: {} }),
  );
  if (selfResult) {
    try {
      const data = JSON.parse(selfResult.content[0].text);
      if (!data.ip) fail('self-lookup returns IP', 'missing ip field');
      else ok(`self-lookup returned IP: ${data.ip}`);
    } catch (e) {
      if (!/\d+\.\d+\.\d+\.\d+/.test(selfResult.content[0].text)) {
        fail('self-lookup returns IP', `text: ${selfResult.content[0].text}`);
      }
    }
  }

  await client.close();
  process.stdout.write(`\n${failures === 0 ? '✅ ALL TESTS PASSED' : `❌ ${failures} TEST(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  process.stderr.write(`FATAL: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
