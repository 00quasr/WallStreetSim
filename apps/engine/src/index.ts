import { TickEngine } from './tick-engine';
import { formatTick, formatTimestamp, formatPercent, formatCurrency } from '@wallstreetsim/utils';
import type { TickUpdate, MarketEvent, PriceUpdate, OrderProcessedEvent } from '@wallstreetsim/types';

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║         WALLSTREETSIM - TICK ENGINE                   ║');
  console.log('║         THE MARKET NEVER SLEEPS                       ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');

  const engine = new TickEngine({
    tickIntervalMs: parseInt(process.env.TICK_INTERVAL_MS || '1000', 10),
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
      console.log(`\n[${formatTimestamp(update.timestamp)}] Tick ${formatTick(update.tick)} ${update.marketOpen ? '📈 OPEN' : '🌙 CLOSED'}`);

      if (movers.length > 0) {
        console.log('  Top Movers:');
        movers.forEach(m => {
          const arrow = m.changePercent > 0 ? '▲' : '▼';
          const color = m.changePercent > 0 ? '\x1b[32m' : '\x1b[31m';
          console.log(`    ${color}${arrow} ${m.symbol.padEnd(6)} $${m.newPrice.toFixed(2).padStart(8)} ${formatPercent(m.changePercent)}\x1b[0m`);
        });
      }

      if (update.trades.length > 0) {
        console.log(`  Trades: ${update.trades.length}`);
      }
    }
  });

  engine.on('event', (event: MarketEvent) => {
    const emoji = event.impact > 0 ? '📰' : '⚠️';
    console.log(`\n${emoji} EVENT: ${event.headline}`);
    console.log(`   Type: ${event.type}, Impact: ${formatPercent(event.impact * 100)}, Duration: ${event.duration} ticks`);
    if (event.symbol) {
      console.log(`   Symbol: ${event.symbol}`);
    }
  });

  engine.on('marketStatus', ({ open, tick }: { open: boolean; tick: number }) => {
    if (open) {
      console.log(`\n🔔 MARKET OPEN - Tick ${formatTick(tick)}`);
    } else {
      console.log(`\n🔔 MARKET CLOSED - Tick ${formatTick(tick)}`);
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
    console.log(
      `  ${sideColor}${statusIcon} ${event.side.padEnd(4)} ${event.symbol.padEnd(6)} ` +
      `${event.quantity.toString().padStart(5)} @ ${priceStr.padStart(12)} ` +
      `${event.status.toUpperCase()}${fillStr}\x1b[0m`
    );
  });

  engine.on('error', (error: Error) => {
    console.error('\n❌ ENGINE ERROR:', error.message);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n\nShutting down...');
    await engine.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Initialize and start
  try {
    await engine.initialize();
    engine.start();

    console.log('\nEngine running. Press Ctrl+C to stop.\n');
  } catch (error) {
    console.error('Failed to start engine:', error);
    process.exit(1);
  }
}

main();
