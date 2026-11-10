import React, { ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { SubjectProvider } from './context/SubjectContext';
import { registerSW } from 'virtual:pwa-register';

// Register service worker for PWA offline capabilities and Android installability with safe error guards
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('Axion caught unhandled promise rejection:', event.reason);
  });

  if ('serviceWorker' in navigator) {
    try {
      registerSW({
        immediate: true,
        onNeedRefresh() {
          console.log('Axion PWA update ready');
        },
        onOfflineReady() {
          console.log('Axion PWA offline ready');
        },
        onRegisterError(error: any) {
          console.warn('Axion Service Worker registration skipped or failed:', error);
        }
      });
    } catch (swErr) {
      console.warn('Service worker setup caught exception:', swErr);
    }
  }
}

class ErrorBoundary extends React.Component<any, any> {
  state = { hasError: false, error: null };

  constructor(props: {children: ReactNode}) {
    super(props);
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'white', backgroundColor: '#990000', fontFamily: 'monospace', position: 'fixed', inset: 0, zIndex: 9999 }}>
          <h1>React Error Boundary caught an error:</h1>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error?.toString()}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: 20 }}>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SubjectProvider>
        <App />
      </SubjectProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
