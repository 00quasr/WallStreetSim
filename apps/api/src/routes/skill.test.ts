import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock fs before importing the skill module
vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue('# WallStreetSim Agent Guide\n\nTest content'),
}));

// Import after mocking
import { skill } from './skill';

describe('Skill Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/', skill);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /skill.md', () => {
    it('should return skill.md content', async () => {
      const res = await app.request('/skill.md');

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('WallStreetSim');
    });

    it('should return content-type text/markdown', async () => {
      const res = await app.request('/skill.md');

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/markdown');
    });

    it('should include charset in content-type', async () => {
      const res = await app.request('/skill.md');

      expect(res.headers.get('Content-Type')).toContain('charset=utf-8');
    });
  });

  describe('GET /skill', () => {
    it('should return skill.md content (alias)', async () => {
      const res = await app.request('/skill');

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('WallStreetSim');
    });

    it('should return content-type text/markdown', async () => {
      const res = await app.request('/skill');

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/markdown');
    });

    it('should return same content as /skill.md', async () => {
      const res1 = await app.request('/skill.md');
      const res2 = await app.request('/skill');

      const text1 = await res1.text();
      const text2 = await res2.text();

      expect(text1).toBe(text2);
    });
  });
});

describe('Skill Content Validation', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/', skill);
  });

  it('should include markdown heading', async () => {
    const res = await app.request('/skill.md');
    const text = await res.text();

    expect(text).toMatch(/^#\s/m);
  });
});
