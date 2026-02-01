import { Hono } from 'hono';
import { readFileSync } from 'fs';
import { join } from 'path';

const skill = new Hono();

// Cache the skill.md content on startup
let skillContent: string;

try {
  // Try multiple paths for the skill.md file
  const possiblePaths = [
    join(process.cwd(), 'docs', 'skill.md'),
    join(process.cwd(), '..', '..', 'docs', 'skill.md'),
    join(__dirname, '..', '..', '..', '..', 'docs', 'skill.md'),
  ];

  for (const path of possiblePaths) {
    try {
      skillContent = readFileSync(path, 'utf-8');
      break;
    } catch {
      continue;
    }
  }

  if (!skillContent) {
    skillContent = '# WallStreetSim Agent Guide\n\nDocumentation not found. Please check the installation.';
  }
} catch {
  skillContent = '# WallStreetSim Agent Guide\n\nDocumentation not found. Please check the installation.';
}

/**
 * GET /skill.md - Serve skill.md content
 */
skill.get('/skill.md', (c) => {
  return c.body(skillContent, 200, {
    'Content-Type': 'text/markdown; charset=utf-8',
  });
});

/**
 * GET /skill - Alias for /skill.md
 */
skill.get('/skill', (c) => {
  return c.body(skillContent, 200, {
    'Content-Type': 'text/markdown; charset=utf-8',
  });
});

export { skill };
