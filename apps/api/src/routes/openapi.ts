import { Hono } from 'hono';
import { readFileSync } from 'fs';
import { join } from 'path';

const openapi = new Hono();

// Cache the openapi.json content on startup
let openapiContent: object;

try {
  // Try multiple paths for the openapi.json file
  const possiblePaths = [
    join(process.cwd(), 'docs', 'openapi.json'),
    join(process.cwd(), '..', '..', 'docs', 'openapi.json'),
    join(__dirname, '..', '..', '..', '..', 'docs', 'openapi.json'),
  ];

  for (const path of possiblePaths) {
    try {
      const content = readFileSync(path, 'utf-8');
      openapiContent = JSON.parse(content);
      break;
    } catch {
      continue;
    }
  }

  if (!openapiContent) {
    openapiContent = {
      openapi: '3.0.3',
      info: {
        title: 'WallStreetSim API',
        description: 'OpenAPI specification not found. Please check the installation.',
        version: '0.1.0',
      },
      paths: {},
    };
  }
} catch {
  openapiContent = {
    openapi: '3.0.3',
    info: {
      title: 'WallStreetSim API',
      description: 'OpenAPI specification not found. Please check the installation.',
      version: '0.1.0',
    },
    paths: {},
  };
}

/**
 * GET /openapi.json - Serve OpenAPI specification
 */
openapi.get('/openapi.json', (c) => {
  return c.json(openapiContent);
});

/**
 * GET /openapi - Alias for /openapi.json
 */
openapi.get('/openapi', (c) => {
  return c.json(openapiContent);
});

export { openapi };
