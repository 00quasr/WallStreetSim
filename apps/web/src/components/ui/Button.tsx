'use client';

import { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: ButtonProps) {
  const variants = {
    primary: 'border-terminal-text text-terminal-text hover:bg-terminal-text hover:text-terminal-bg',
    secondary: 'border-terminal-dim text-terminal-dim hover:border-terminal-text hover:text-terminal-text',
    danger: 'border-terminal-red text-terminal-red hover:bg-terminal-red hover:text-terminal-bg',
  };

  return (
    <button
      className={`
        border px-4 py-2 font-mono text-sm transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]}
        ${className}
      `}
      {...props}
    >
      [{children}]
    </button>
  );
}
