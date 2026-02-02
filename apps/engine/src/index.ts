import { TickEngine } from './tick-engine';
import { createLogger, formatTick, formatTimestamp, formatPercent, formatCurrency, safeValidateEnv } from '@wallstreetsim/utils';
import type { TickUpdate, MarketEvent, OrderProcessedEvent } from '@wallstreetsim/types';

// Validate environment variables at startup
const envResult = safeValidateEnv();
if (!envResult.success) {
  console.error('Environment validation failed:');
  for (const issue of envResult.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}
const env = envResult.data;

const logger = createLogger({ service: 'engine' });

async function main() {
  logger.info('');
  logger.info('╔═══════════════════════════════════════════════════════╗');
  logger.info('║         WALLSTREETSIM - TICK ENGINE                   ║');
  logger.info('║         THE MARKET NEVER SLEEPS                       ║');
  logger.info('╚═══════════════════════════════════════════════════════╝');
  logger.info('');

  const engine = new TickEngine({
    tickIntervalMs: env.TICK_INTERVAL_MS,
    enableEvents: true,
    eventChance: 0.005,
  });

  // Event handlers
  engine.on('tick', (update: TickUpdate) => {
    const movers = update.priceUpdates
      .filter(u => Math.abs(u.changePercent) > 1)
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, 3);

    if (movers.length > 0 || update.tick % 60 === 0) {
      logger.info({
        timestamp: formatTimestamp(update.timestamp),
        tick: formatTick(update.tick),
        marketOpen: update.marketOpen,
      }, `Tick ${formatTick(update.tick)} ${update.marketOpen ? '📈 OPEN' : '🌙 CLOSED'}`);

      if (movers.length > 0) {
        logger.info('  Top Movers:');
        movers.forEach(m => {
          const arrow = m.changePercent > 0 ? '▲' : '▼';
          const color = m.changePercent > 0 ? '\x1b[32m' : '\x1b[31m';
          logger.info(`    ${color}${arrow} ${m.symbol.padEnd(6)} $${m.newPrice.toFixed(2).padStart(8)} ${formatPercent(m.changePercent)}\x1b[0m`);
        });
      }

      if (update.trades.length > 0) {
        logger.info({ tradeCount: update.trades.length }, 'Trades executed');
      }
    }
  });

  engine.on('event', (event: MarketEvent) => {
    const emoji = event.impact > 0 ? '📰' : '⚠️';
    logger.info({
      type: event.type,
      impact: formatPercent(event.impact * 100),
      duration: event.duration,
      symbol: event.symbol,
    }, `${emoji} EVENT: ${event.headline}`);
  });

  engine.on('marketStatus', ({ open, tick }: { open: boolean; tick: number }) => {
    if (open) {
      logger.info({ tick: formatTick(tick) }, '🔔 MARKET OPEN');
    } else {
      logger.info({ tick: formatTick(tick) }, '🔔 MARKET CLOSED');
    }
  });

  engine.on('orderProcessed', (event: OrderProcessedEvent) => {
    const sideColor = event.side === 'BUY' ? '\x1b[32m' : '\x1b[31m';
    const statusIcon = event.status === 'filled' ? '✓' :
                       event.status === 'partial' ? '◐' :
                       event.status === 'open' ? '○' : '?';
    const priceStr = event.avgFillPrice
      ? formatCurrency(event.avgFillPrice)
      : event.price
        ? formatCurrency(event.price)
        : 'MARKET';
    const fillStr = event.filledQuantity > 0
      ? ` [${event.filledQuantity}/${event.quantity}]`
      : '';
    logger.info(
      `  ${sideColor}${statusIcon} ${event.side.padEnd(4)} ${event.symbol.padEnd(6)} ` +
      `${event.quantity.toString().padStart(5)} @ ${priceStr.padStart(12)} ` +
      `${event.status.toUpperCase()}${fillStr}\x1b[0m`
    );
  });

  engine.on('error', (error: Error) => {
    logger.error({ err: error }, 'ENGINE ERROR');
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await engine.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Initialize and start
  try {
    await engine.initialize();
    engine.start();

    logger.info('Engine running. Press Ctrl+C to stop.');
  } catch (error) {
    logger.error({ err: error }, 'Failed to start engine');
    process.exit(1);
  }
}

main();
