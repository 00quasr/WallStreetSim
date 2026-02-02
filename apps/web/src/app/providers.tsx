'use client';

import { ReactNode } from 'react';
import { TickProvider } from '../context/TickContext';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return <TickProvider>{children}</TickProvider>;
}
