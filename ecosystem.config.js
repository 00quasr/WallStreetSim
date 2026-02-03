const path = require('path');

// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Shared configuration
const LOG_DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss Z';
const KILL_TIMEOUT = 10000; // 10 seconds for graceful shutdown

// Shared environment variables for all services that need DB/Redis
const sharedEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  API_SECRET: process.env.API_SECRET,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  CLICKHOUSE_URL: process.env.CLICKHOUSE_URL,
};

module.exports = {
  apps: [
    {
      name: 'wss-web',
      cwd: './apps/web',
      script: 'npx',
      args: 'next start',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
        NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      kill_timeout: KILL_TIMEOUT,
      listen_timeout: 10000,
      wait_ready: false,
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
        PORT: 8080,
        ...sharedEnv,
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
        NODE_ENV: 'production',
        ...sharedEnv,
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
