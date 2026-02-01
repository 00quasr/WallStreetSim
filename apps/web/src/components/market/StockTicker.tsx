'use client';

interface Stock {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

interface StockTickerProps {
  stocks: Stock[];
}

export function StockTicker({ stocks }: StockTickerProps) {
  return (
    <div className="border border-terminal-dim overflow-hidden">
      <div className="flex animate-marquee whitespace-nowrap py-2">
        {stocks.map((stock, i) => (
          <div key={i} className="flex items-center mx-6">
            <span className="text-terminal-highlight mr-2">{stock.symbol}</span>
            <span className="text-terminal-text mr-2">${stock.price.toFixed(2)}</span>
            <span className={stock.change >= 0 ? 'text-terminal-highlight' : 'text-terminal-red'}>
              {stock.change >= 0 ? '▲' : '▼'} {Math.abs(stock.changePercent).toFixed(2)}%
            </span>
          </div>
        ))}
        {/* Duplicate for seamless loop */}
        {stocks.map((stock, i) => (
          <div key={`dup-${i}`} className="flex items-center mx-6">
            <span className="text-terminal-highlight mr-2">{stock.symbol}</span>
            <span className="text-terminal-text mr-2">${stock.price.toFixed(2)}</span>
            <span className={stock.change >= 0 ? 'text-terminal-highlight' : 'text-terminal-red'}>
              {stock.change >= 0 ? '▲' : '▼'} {Math.abs(stock.changePercent).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
