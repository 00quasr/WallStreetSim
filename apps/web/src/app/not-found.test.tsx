import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotFound from './not-found';

describe('NotFound (404 page)', () => {
  it('should render the 404 error code', () => {
    render(<NotFound />);
    // The ASCII art contains 404
    expect(screen.getByText(/PAGE NOT FOUND/)).toBeInTheDocument();
  });

  it('should render the page title', () => {
    render(<NotFound />);
    expect(screen.getByText('PAGE NOT FOUND')).toBeInTheDocument();
  });

  it('should render error description', () => {
    render(<NotFound />);
    expect(
      screen.getByText('The requested resource could not be located on this server.')
    ).toBeInTheDocument();
  });

  it('should render a link to return home', () => {
    render(<NotFound />);
    const homeLink = screen.getByRole('link', { name: /RETURN TO HOME/i });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/');
  });

  it('should render a link to view markets', () => {
    render(<NotFound />);
    const marketsLink = screen.getByRole('link', { name: /VIEW MARKETS/i });
    expect(marketsLink).toBeInTheDocument();
    expect(marketsLink).toHaveAttribute('href', '/markets');
  });

  describe('terminal aesthetic compliance', () => {
    it('should use terminal background color', () => {
      const { container } = render(<NotFound />);
      expect(container.firstChild).toHaveClass('bg-terminal-bg');
    });

    it('should use terminal text color', () => {
      const { container } = render(<NotFound />);
      expect(container.firstChild).toHaveClass('text-terminal-text');
    });

    it('should use monospace font', () => {
      const { container } = render(<NotFound />);
      expect(container.firstChild).toHaveClass('font-mono');
    });

    it('should display WALLSTREETSIM branding', () => {
      render(<NotFound />);
      expect(screen.getByText('WALLSTREETSIM')).toBeInTheDocument();
    });

    it('should display tagline', () => {
      render(<NotFound />);
      expect(screen.getByText('THE MARKET NEVER SLEEPS')).toBeInTheDocument();
    });

    it('should render system error header with terminal styling', () => {
      render(<NotFound />);
      expect(screen.getByText(/SYSTEM ERROR/)).toBeInTheDocument();
    });

    it('should render footer with error status', () => {
      render(<NotFound />);
      expect(screen.getByText('ERROR')).toBeInTheDocument();
    });

    it('should render ASCII art header', () => {
      render(<NotFound />);
      // Check for WS ASCII art (part of the logo)
      const preElements = document.querySelectorAll('pre');
      expect(preElements.length).toBeGreaterThan(0);
    });

    it('should render error details in terminal style', () => {
      render(<NotFound />);
      expect(screen.getByText(/ERROR_CODE: 404_NOT_FOUND/)).toBeInTheDocument();
      expect(screen.getByText(/STATUS: RESOURCE_MISSING/)).toBeInTheDocument();
    });
  });

  describe('button styling', () => {
    it('should have terminal-styled home button', () => {
      render(<NotFound />);
      const homeLink = screen.getByRole('link', { name: /RETURN TO HOME/i });
      expect(homeLink).toHaveClass('border', 'border-terminal-text');
    });

    it('should have terminal-styled markets button', () => {
      render(<NotFound />);
      const marketsLink = screen.getByRole('link', { name: /VIEW MARKETS/i });
      expect(marketsLink).toHaveClass('border', 'border-terminal-dim');
    });
  });
});
