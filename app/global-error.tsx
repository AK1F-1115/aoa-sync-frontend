'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Global error boundary — last resort fallback.
 * Catches errors that escape the route-level error.tsx boundaries.
 * Styled minimally (no Polaris) since AppProvider may not be available here.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('[AOA Sync] Global unhandled error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: '#f6f6f7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <div
          style={{
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            padding: '32px',
            maxWidth: '480px',
            width: '100%',
            textAlign: 'center',
          }}
        >
          <h2 style={{ color: '#d72c0d', margin: '0 0 12px' }}>
            Something went wrong
          </h2>
          <p style={{ color: '#444', marginBottom: '24px' }}>
            {error.message || 'An unexpected error occurred.'}
          </p>
          {error.digest && (
            <p style={{ color: '#888', fontSize: '12px', marginBottom: '16px' }}>
              Error ID: {error.digest}
            </p>
          )}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#008060',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 20px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Reload page
            </button>
            <button
              onClick={reset}
              style={{
                background: '#fff',
                color: '#333',
                border: '1px solid #ccc',
                borderRadius: '6px',
                padding: '10px 20px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
