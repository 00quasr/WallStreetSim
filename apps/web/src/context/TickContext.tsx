'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useTick, type UseTickReturn } from '../hooks/useTick';

const TickContext = createContext<UseTickReturn | null>(null);

interface TickProviderProps {
  children: ReactNode;
}

export function TickProvider({ children }: TickProviderProps) {
  const tickData = useTick();

  return (
    <TickContext.Provider value={tickData}>
      {children}
    </TickContext.Provider>
  );
}

export function useTickContext(): UseTickReturn {
  const context = useContext(TickContext);
  if (!context) {
    throw new Error('useTickContext must be used within a TickProvider');
  }
  return context;
}
