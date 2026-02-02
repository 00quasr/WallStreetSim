const path = require('path');

// Shared configuration
const LOG_DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss Z';
const KILL_TIMEOUT = 10000; // 10 seconds for graceful shutdown

module.exports = {
  apps: [
    {
      name: 'wss-web',
      cwd: './apps/web',
      script: 'node_modules/.bin/next',
      args: 'start',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      kill_timeout: KILL_TIMEOUT,
      listen_timeout: 10000,
      wait_ready: true,
      log_date_format: LOG_DATE_FORMAT,
      error_file: path.join(__dirname, 'logs', 'wss-web-error.log'),
      out_file: path.join(__dirname, 'logs', 'wss-web-out.log'),
      combine_logs: true,
      merge_logs: true,
      time: true,
      source_map_support: true,
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      restart_delay: 1000
    },
    {
      name: 'wss-api',
      cwd: './apps/api',
      script: 'dist/index.js',
      interpreter: 'node',
      interpreter_args: '--enable-source-maps',
      env: {
        NODE_ENV: 'production',
        PORT: 8080
      },
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      kill_timeout: KILL_TIMEOUT,
      listen_timeout: 10000,
      wait_ready: true,
      log_date_format: LOG_DATE_FORMAT,
      error_file: path.join(__dirname, 'logs', 'wss-api-error.log'),
      out_file: path.join(__dirname, 'logs', 'wss-api-out.log'),
      combine_logs: true,
      merge_logs: true,
      time: true,
      source_map_support: true,
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      restart_delay: 1000
    },
    {
      name: 'wss-engine',
      cwd: './apps/engine',
      script: 'dist/index.js',
      interpreter: 'node',
      interpreter_args: '--enable-source-maps',
      env: {
        NODE_ENV: 'production'
      },
      // Engine must be singleton - only one instance allowed
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      kill_timeout: KILL_TIMEOUT,
      listen_timeout: 15000,
      wait_ready: true,
      log_date_format: LOG_DATE_FORMAT,
      error_file: path.join(__dirname, 'logs', 'wss-engine-error.log'),
      out_file: path.join(__dirname, 'logs', 'wss-engine-out.log'),
      combine_logs: true,
      merge_logs: true,
      time: true,
      source_map_support: true,
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      restart_delay: 1000
    }
  ],

  deploy: {
    production: {
      user: 'deploy',
      host: 'localhost',
      ref: 'origin/main',
      repo: 'git@github.com:user/wallstreetsim.git',
      path: '/WallStreetSim',
      'pre-deploy-local': '',
      'post-deploy': 'pnpm install && pnpm build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
