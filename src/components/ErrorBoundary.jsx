import { Component } from 'react';

/**
 * React error boundary.
 * Catches render/lifecycle errors in a subtree so the rest of the app
 * remains functional instead of white-screening.
 *
 * Usage:
 *   <ErrorBoundary label="Analytics">
 *     <AnalyticsDashboard />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary:${this.props.label || 'unknown'}]`, error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--text-secondary, #888)',
        }}>
          <p style={{ marginBottom: '0.75rem' }}>
            Something went wrong{this.props.label ? ` in ${this.props.label}` : ''}.
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: '0.4rem 1rem',
              borderRadius: '6px',
              border: '1px solid var(--border, #ccc)',
              background: 'transparent',
              cursor: 'pointer',
              color: 'inherit',
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
