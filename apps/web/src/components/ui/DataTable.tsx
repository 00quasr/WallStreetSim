'use client';

import { ReactNode } from 'react';

interface Column<T> {
  key: keyof T;
  label: string;
  align?: 'left' | 'right' | 'center';
  render?: (value: T[keyof T], row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  highlightRow?: (row: T) => boolean;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  highlightRow,
}: DataTableProps<T>) {
  return (
    <div className="font-mono text-sm overflow-x-auto">
      {/* Header */}
      <div className="flex border-b border-terminal-dim pb-1 mb-2">
        {columns.map((col, i) => (
          <div
            key={i}
            className={`flex-1 text-terminal-dim uppercase text-xs ${
              col.align === 'right' ? 'text-right' :
              col.align === 'center' ? 'text-center' : 'text-left'
            }`}
          >
            {col.label}
          </div>
        ))}
      </div>

      {/* Rows */}
      {data.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className={`flex py-1 border-b border-terminal-dim/30 ${
            highlightRow?.(row) ? 'bg-terminal-darkGreen' : ''
          }`}
        >
          {columns.map((col, colIndex) => (
            <div
              key={colIndex}
              className={`flex-1 ${
                col.align === 'right' ? 'text-right' :
                col.align === 'center' ? 'text-center' : 'text-left'
              }`}
            >
              {col.render
                ? col.render(row[col.key], row)
                : String(row[col.key] ?? '')}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
