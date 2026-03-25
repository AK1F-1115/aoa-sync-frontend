'use client';

/**
 * components/ErrorBoundary.tsx
 *
 * React class-based error boundary.
 * Catches unexpected runtime errors in the component tree and shows
 * a graceful Polaris-styled fallback instead of a blank screen.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeComponent />
 *   </ErrorBoundary>
 */

import React from 'react';
import { Page, Layout, Banner, Button } from '@shopify/polaris';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // In production, this is where you'd send to an error tracking service
    // e.g. Sentry.captureException(error, { extra: errorInfo })
    if (process.env.NODE_ENV === 'development') {
      console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    }
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Page title="Something went wrong">
          <Layout>
            <Layout.Section>
              <Banner
                title="An unexpected error occurred"
                tone="critical"
              >
                <p>
                  AOA Sync encountered an unexpected error. Please try reloading
                  the page. If the problem persists, contact support.
                </p>
                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <p>
                    <strong>Dev details:</strong>{' '}
                    <code>{this.state.error.message}</code>
                  </p>
                )}
              </Banner>
            </Layout.Section>
            <Layout.Section>
              <Button onClick={this.handleReset}>Try again</Button>
            </Layout.Section>
          </Layout>
        </Page>
      );
    }

    return this.props.children;
  }
}
