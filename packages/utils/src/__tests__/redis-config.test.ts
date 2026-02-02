import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Redis Configuration', () => {
  const configPath = join(__dirname, '../../../../config/redis/redis.conf');

  it('config file exists', () => {
    expect(existsSync(configPath)).toBe(true);
  });

  describe('RDB persistence', () => {
    const config = readFileSync(
      join(__dirname, '../../../../config/redis/redis.conf'),
      'utf-8'
    );

    it('has RDB save rules configured', () => {
      expect(config).toMatch(/^save\s+\d+\s+\d+/m);
    });

    it('configures frequent save for high activity (60s / 10000 keys)', () => {
      expect(config).toMatch(/^save\s+60\s+10000/m);
    });

    it('configures medium save for moderate activity (300s / 10 keys)', () => {
      expect(config).toMatch(/^save\s+300\s+10/m);
    });

    it('configures infrequent save for low activity (900s / 1 key)', () => {
      expect(config).toMatch(/^save\s+900\s+1/m);
    });

    it('enables RDB compression', () => {
      expect(config).toMatch(/^rdbcompression\s+yes/m);
    });

    it('enables RDB checksum', () => {
      expect(config).toMatch(/^rdbchecksum\s+yes/m);
    });

    it('stops writes on BGSAVE errors', () => {
      expect(config).toMatch(/^stop-writes-on-bgsave-error\s+yes/m);
    });

    it('sets RDB filename', () => {
      expect(config).toMatch(/^dbfilename\s+dump\.rdb/m);
    });

    it('sets data directory', () => {
      expect(config).toMatch(/^dir\s+\/data/m);
    });
  });

  describe('AOF persistence', () => {
    const config = readFileSync(
      join(__dirname, '../../../../config/redis/redis.conf'),
      'utf-8'
    );

    it('enables AOF', () => {
      expect(config).toMatch(/^appendonly\s+yes/m);
    });

    it('sets AOF filename', () => {
      expect(config).toMatch(/^appendfilename\s+"appendonly\.aof"/m);
    });

    it('configures AOF fsync policy to everysec for balance of safety and performance', () => {
      expect(config).toMatch(/^appendfsync\s+everysec/m);
    });

    it('disables no-appendfsync-on-rewrite for data safety', () => {
      expect(config).toMatch(/^no-appendfsync-on-rewrite\s+no/m);
    });

    it('configures AOF auto-rewrite percentage', () => {
      expect(config).toMatch(/^auto-aof-rewrite-percentage\s+100/m);
    });

    it('configures minimum AOF rewrite size', () => {
      expect(config).toMatch(/^auto-aof-rewrite-min-size\s+64mb/m);
    });

    it('enables loading truncated AOF files', () => {
      expect(config).toMatch(/^aof-load-truncated\s+yes/m);
    });

    it('uses RDB preamble in AOF for faster loading', () => {
      expect(config).toMatch(/^aof-use-rdb-preamble\s+yes/m);
    });
  });

  describe('network configuration', () => {
    const config = readFileSync(
      join(__dirname, '../../../../config/redis/redis.conf'),
      'utf-8'
    );

    it('binds to all interfaces', () => {
      expect(config).toMatch(/^bind\s+0\.0\.0\.0/m);
    });

    it('uses default port 6379', () => {
      expect(config).toMatch(/^port\s+6379/m);
    });

    it('enables TCP keepalive', () => {
      expect(config).toMatch(/^tcp-keepalive\s+300/m);
    });
  });

  describe('general settings', () => {
    const config = readFileSync(
      join(__dirname, '../../../../config/redis/redis.conf'),
      'utf-8'
    );

    it('disables daemonize for Docker compatibility', () => {
      expect(config).toMatch(/^daemonize\s+no/m);
    });

    it('sets log level to notice', () => {
      expect(config).toMatch(/^loglevel\s+notice/m);
    });

    it('configures 16 databases', () => {
      expect(config).toMatch(/^databases\s+16/m);
    });
  });

  describe('client configuration', () => {
    const config = readFileSync(
      join(__dirname, '../../../../config/redis/redis.conf'),
      'utf-8'
    );

    it('sets max clients', () => {
      expect(config).toMatch(/^maxclients\s+10000/m);
    });
  });

  describe('slow log', () => {
    const config = readFileSync(
      join(__dirname, '../../../../config/redis/redis.conf'),
      'utf-8'
    );

    it('logs queries slower than 10ms', () => {
      expect(config).toMatch(/^slowlog-log-slower-than\s+10000/m);
    });

    it('keeps 128 slow queries', () => {
      expect(config).toMatch(/^slowlog-max-len\s+128/m);
    });
  });
});
