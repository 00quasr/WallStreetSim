'use client';

import { useEffect, useState } from 'react';

export function Loading({ text = 'LOADING' }: { text?: string }) {
  const [frame, setFrame] = useState(0);
  const frames = ['|', '/', '-', '\\'];

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame(f => (f + 1) % frames.length);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-terminal-text font-mono">
      <span className="text-terminal-dim">[</span>
      <span>{frames[frame]}</span>
      <span className="text-terminal-dim">]</span>
      <span className="ml-2">{text}</span>
      <span className="animate-blink">_</span>
    </div>
  );
}
