import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono flex flex-col">
      {/* Scanline effect */}
      <div className="scanline" />

      {/* Header */}
      <header className="border-b border-terminal-dim p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <pre className="text-xs leading-none text-terminal-highlight hidden md:block">
{`██╗    ██╗███████╗
██║    ██║██╔════╝
██║ █╗ ██║███████╗
██║███╗██║╚════██║
╚███╔███╔╝███████║
 ╚══╝╚══╝ ╚══════╝`}
            </pre>
            <div>
              <h1 className="text-terminal-highlight text-lg">WALLSTREETSIM</h1>
              <p className="text-terminal-dim text-xs">THE MARKET NEVER SLEEPS</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="border border-terminal-red bg-terminal-bg max-w-2xl w-full">
          {/* Error header */}
          <div className="border-b border-terminal-dim px-4 py-3 flex items-center justify-between">
            <span className="text-terminal-red text-sm">
              ┌─[ SYSTEM ERROR ]
            </span>
            <span className="text-terminal-red text-xs">●</span>
          </div>

          {/* Error content */}
          <div className="p-6 text-center">
            <pre className="text-terminal-red text-4xl md:text-6xl font-bold mb-4">
{`   ██╗  ██╗ ██████╗ ██╗  ██╗
   ██║  ██║██╔═████╗██║  ██║
   ███████║██║██╔██║███████║
   ╚════██║████╔╝██║╚════██║
        ██║╚██████╔╝     ██║
        ╚═╝ ╚═════╝      ╚═╝`}
            </pre>

            <div className="text-terminal-text text-lg mb-2">
              PAGE NOT FOUND
            </div>

            <div className="text-terminal-dim text-sm mb-6">
              The requested resource could not be located on this server.
            </div>

            <pre className="text-terminal-dim text-xs mb-6 text-left inline-block">
{`> ERROR_CODE: 404_NOT_FOUND
> TIMESTAMP: ${new Date().toISOString().split('T')[0]}
> STATUS: RESOURCE_MISSING
> ACTION: REDIRECTING TO HOME...`}
            </pre>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/"
                className="border border-terminal-text px-6 py-2 hover:bg-terminal-text hover:text-terminal-bg transition-colors"
              >
                [ RETURN TO HOME ]
              </Link>
              <Link
                href="/markets"
                className="border border-terminal-dim text-terminal-dim px-6 py-2 hover:border-terminal-text hover:text-terminal-text transition-colors"
              >
                [ VIEW MARKETS ]
              </Link>
            </div>
          </div>

          {/* Footer border */}
          <div className="px-4 pb-2 text-terminal-dim text-xs">
            └{'─'.repeat(50)}┘
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-terminal-dim p-4 text-center text-xs text-terminal-dim">
        <span>[ SYSTEM STATUS: </span>
        <span className="text-terminal-red">ERROR</span>
        <span> ] [ MARKET: </span>
        <span className="text-terminal-highlight">OPEN</span>
        <span> ]</span>
      </footer>
    </div>
  );
}
