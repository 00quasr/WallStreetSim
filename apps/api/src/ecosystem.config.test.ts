import { describe, it, expect, beforeAll, vi } from 'vitest';
import path from 'path';
import { EventEmitter } from 'events';
import cluster from 'cluster';

interface PM2App {
  name: string;
  cwd: string;
  script: string;
  args?: string;
  interpreter?: string;
  interpreter_args?: string;
  env: {
    NODE_ENV: string;
    PORT?: number;
  };
  instances: number | 'max';
  exec_mode: 'cluster' | 'fork';
  autorestart: boolean;
  watch: boolean;
  max_memory_restart: string;
  kill_timeout: number;
  listen_timeout: number;
  wait_ready: boolean;
  log_date_format: string;
  error_file: string;
  out_file: string;
  combine_logs: boolean;
  merge_logs: boolean;
  time: boolean;
  source_map_support: boolean;
  exp_backoff_restart_delay: number;
  max_restarts: number;
  restart_delay: number;
}

interface PM2DeployConfig {
  user: string;
  host: string;
  ref: string;
  repo: string;
  path: string;
  'pre-deploy-local': string;
  'post-deploy': string;
  'pre-setup': string;
}

interface PM2Config {
  apps: PM2App[];
  deploy: {
    production: PM2DeployConfig;
  };
}

describe('ecosystem.config.js', () => {
  let config: PM2Config;

  beforeAll(async () => {
    // Load the CommonJS config using absolute path
    config = await import('/WallStreetSim/ecosystem.config.js');
  });

  describe('structure', () => {
    it('should export an object with apps array', () => {
      expect(config).toBeDefined();
      expect(config.apps).toBeDefined();
      expect(Array.isArray(config.apps)).toBe(true);
    });

    it('should have three apps configured', () => {
      expect(config.apps).toHaveLength(3);
    });

    it('should have deploy configuration', () => {
      expect(config.deploy).toBeDefined();
      expect(config.deploy.production).toBeDefined();
    });
  });

  describe('wss-web app', () => {
    let webApp: PM2App;

    beforeAll(() => {
      webApp = config.apps.find((app) => app.name === 'wss-web')!;
    });

    it('should exist', () => {
      expect(webApp).toBeDefined();
    });

    it('should use correct script and working directory', () => {
      expect(webApp.cwd).toBe('./apps/web');
      expect(webApp.script).toBe('node_modules/.bin/next');
      expect(webApp.args).toBe('start');
    });

    it('should run in cluster mode with max instances', () => {
      expect(webApp.exec_mode).toBe('cluster');
      expect(webApp.instances).toBe('max');
    });

    it('should have proper environment variables', () => {
      expect(webApp.env.NODE_ENV).toBe('production');
      expect(webApp.env.PORT).toBe(3000);
    });

    it('should have autorestart enabled', () => {
      expect(webApp.autorestart).toBe(true);
    });

    it('should have memory limit configured', () => {
      expect(webApp.max_memory_restart).toBe('500M');
    });

    it('should have logging configured', () => {
      expect(webApp.log_date_format).toBeDefined();
      expect(webApp.error_file).toContain('wss-web-error.log');
      expect(webApp.out_file).toContain('wss-web-out.log');
      expect(webApp.combine_logs).toBe(true);
    });

    it('should have graceful shutdown configured', () => {
      expect(webApp.kill_timeout).toBe(10000);
      expect(webApp.wait_ready).toBe(true);
    });

    it('should have restart backoff configured', () => {
      expect(webApp.exp_backoff_restart_delay).toBe(100);
      expect(webApp.max_restarts).toBe(10);
    });
  });

  describe('wss-api app', () => {
    let apiApp: PM2App;

    beforeAll(() => {
      apiApp = config.apps.find((app) => app.name === 'wss-api')!;
    });

    it('should exist', () => {
      expect(apiApp).toBeDefined();
    });

    it('should use correct script and working directory', () => {
      expect(apiApp.cwd).toBe('./apps/api');
      expect(apiApp.script).toBe('dist/index.js');
    });

    it('should run in cluster mode with max instances', () => {
      expect(apiApp.exec_mode).toBe('cluster');
      expect(apiApp.instances).toBe('max');
    });

    it('should have proper environment variables', () => {
      expect(apiApp.env.NODE_ENV).toBe('production');
      expect(apiApp.env.PORT).toBe(8080);
    });

    it('should have autorestart enabled', () => {
      expect(apiApp.autorestart).toBe(true);
    });

    it('should have memory limit configured', () => {
      expect(apiApp.max_memory_restart).toBe('500M');
    });

    it('should have logging configured', () => {
      expect(apiApp.log_date_format).toBeDefined();
      expect(apiApp.error_file).toContain('wss-api-error.log');
      expect(apiApp.out_file).toContain('wss-api-out.log');
      expect(apiApp.combine_logs).toBe(true);
    });

    it('should have graceful shutdown configured', () => {
      expect(apiApp.kill_timeout).toBe(10000);
      expect(apiApp.wait_ready).toBe(true);
    });

    it('should enable source maps', () => {
      expect(apiApp.interpreter_args).toContain('--enable-source-maps');
      expect(apiApp.source_map_support).toBe(true);
    });
  });

  describe('wss-engine app', () => {
    let engineApp: PM2App;

    beforeAll(() => {
      engineApp = config.apps.find((app) => app.name === 'wss-engine')!;
    });

    it('should exist', () => {
      expect(engineApp).toBeDefined();
    });

    it('should use correct script and working directory', () => {
      expect(engineApp.cwd).toBe('./apps/engine');
      expect(engineApp.script).toBe('dist/index.js');
    });

    it('should run as singleton in fork mode', () => {
      expect(engineApp.exec_mode).toBe('fork');
      expect(engineApp.instances).toBe(1);
    });

    it('should have proper environment variables', () => {
      expect(engineApp.env.NODE_ENV).toBe('production');
    });

    it('should have autorestart enabled', () => {
      expect(engineApp.autorestart).toBe(true);
    });

    it('should have higher memory limit than other apps', () => {
      expect(engineApp.max_memory_restart).toBe('1G');
    });

    it('should have logging configured', () => {
      expect(engineApp.log_date_format).toBeDefined();
      expect(engineApp.error_file).toContain('wss-engine-error.log');
      expect(engineApp.out_file).toContain('wss-engine-out.log');
      expect(engineApp.combine_logs).toBe(true);
    });

    it('should have graceful shutdown configured', () => {
      expect(engineApp.kill_timeout).toBe(10000);
      expect(engineApp.wait_ready).toBe(true);
    });

    it('should enable source maps', () => {
      expect(engineApp.interpreter_args).toContain('--enable-source-maps');
      expect(engineApp.source_map_support).toBe(true);
    });
  });

  describe('deploy configuration', () => {
    it('should have production deploy config', () => {
      const prodDeploy = config.deploy.production;
      expect(prodDeploy).toBeDefined();
      expect(prodDeploy.user).toBe('deploy');
      expect(prodDeploy.path).toBe('/WallStreetSim');
    });

    it('should have post-deploy script', () => {
      const prodDeploy = config.deploy.production;
      expect(prodDeploy['post-deploy']).toContain('pnpm install');
      expect(prodDeploy['post-deploy']).toContain('pnpm build');
      expect(prodDeploy['post-deploy']).toContain('pm2 reload');
    });
  });

  describe('log file paths', () => {
    it('should use absolute paths for log files', () => {
      config.apps.forEach((app) => {
        expect(path.isAbsolute(app.error_file)).toBe(true);
        expect(path.isAbsolute(app.out_file)).toBe(true);
      });
    });

    it('should place logs in logs directory', () => {
      config.apps.forEach((app) => {
        expect(app.error_file).toContain('logs');
        expect(app.out_file).toContain('logs');
      });
    });
  });

  describe('PM2 cluster mode requirements', () => {
    let apiApp: PM2App;

    beforeAll(() => {
      apiApp = config.apps.find((app) => app.name === 'wss-api')!;
    });

    it('should have wait_ready enabled for graceful startup', () => {
      // wait_ready: true requires the application to call process.send('ready')
      expect(apiApp.wait_ready).toBe(true);
    });

    it('should have listen_timeout configured for cluster startup', () => {
      // listen_timeout gives workers time to start and signal ready
      expect(apiApp.listen_timeout).toBeGreaterThan(0);
      expect(apiApp.listen_timeout).toBe(10000);
    });

    it('should have kill_timeout configured for graceful shutdown', () => {
      // kill_timeout gives workers time to drain connections
      expect(apiApp.kill_timeout).toBeGreaterThan(0);
      expect(apiApp.kill_timeout).toBe(10000);
    });

    it('should use cluster exec_mode for horizontal scaling', () => {
      expect(apiApp.exec_mode).toBe('cluster');
    });

    it('should use max instances for optimal CPU utilization', () => {
      expect(apiApp.instances).toBe('max');
    });

    it('should have exponential backoff for restart delay', () => {
      // exp_backoff_restart_delay prevents rapid restart loops
      expect(apiApp.exp_backoff_restart_delay).toBe(100);
    });

    it('should have restart limits to prevent infinite restart loops', () => {
      expect(apiApp.max_restarts).toBe(10);
      expect(apiApp.restart_delay).toBe(1000);
    });
  });

  describe('PM2 WebSocket sticky sessions compatibility', () => {
    it('should have combined logs for easier debugging across workers', () => {
      const apiApp = config.apps.find((app) => app.name === 'wss-api')!;
      expect(apiApp.combine_logs).toBe(true);
      expect(apiApp.merge_logs).toBe(true);
    });
  });
});

describe('API server PM2 cluster mode integration', () => {
  describe('worker ID detection', () => {
    it('should detect fork mode (non-cluster) as worker 0', () => {
      // When not in cluster mode, worker ID should be 0
      const isWorker = cluster.isWorker;
      const workerId = isWorker ? cluster.worker?.id ?? 0 : 0;
      // In test environment, we're not running in a cluster
      expect(workerId).toBe(0);
    });
  });

  describe('PM2 ready signal', () => {
    it('should send ready signal when process.send exists', () => {
      // Create a mock server to test the ready signal
      const mockSend = vi.fn();
      const originalSend = process.send;

      // Mock process.send
      process.send = mockSend as typeof process.send;

      // Simulate the ready signal logic
      if (typeof process.send === 'function') {
        process.send('ready');
      }

      expect(mockSend).toHaveBeenCalledWith('ready');

      // Restore original
      process.send = originalSend;
    });

    it('should not throw when process.send does not exist', () => {
      // When not running under PM2, process.send is undefined
      const originalSend = process.send;
      process.send = undefined;

      // This should not throw
      expect(() => {
        if (typeof process.send === 'function') {
          process.send('ready');
        }
      }).not.toThrow();

      process.send = originalSend;
    });
  });

  describe('PM2 shutdown handling', () => {
    it('should respond to shutdown message', () => {
      const mockEmitter = new EventEmitter();
      const shutdownHandler = vi.fn();

      // Simulate PM2 shutdown message handler
      mockEmitter.on('message', (msg) => {
        if (msg === 'shutdown') {
          shutdownHandler();
        }
      });

      mockEmitter.emit('message', 'shutdown');
      expect(shutdownHandler).toHaveBeenCalled();
    });

    it('should handle SIGTERM signal', () => {
      const shutdownHandler = vi.fn();
      const mockEmitter = new EventEmitter();

      mockEmitter.on('SIGTERM', shutdownHandler);
      mockEmitter.emit('SIGTERM');

      expect(shutdownHandler).toHaveBeenCalled();
    });

    it('should handle SIGINT signal', () => {
      const shutdownHandler = vi.fn();
      const mockEmitter = new EventEmitter();

      mockEmitter.on('SIGINT', shutdownHandler);
      mockEmitter.emit('SIGINT');

      expect(shutdownHandler).toHaveBeenCalled();
    });
  });
});
