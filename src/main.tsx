import React from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './styles.css';
import { Provider } from './store';
import { Shell, useRoute } from './Shell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Dashboard, Markets, Portfolio, Orders, Strategies, Alerts, WalletPage, SettingsPage } from './pages';

function App() {
  const r = useRoute();
  const page =
    r === '/'
      ? <Dashboard />
      : r === '/markets'
      ? <Markets />
      : r === '/portfolio'
      ? <Portfolio />
      : r === '/orders'
      ? <Orders />
      : r === '/strategies'
      ? <Strategies />
      : r === '/alerts'
      ? <Alerts />
      : r === '/wallet'
      ? <WalletPage />
      : <SettingsPage />;

  return (
    <ErrorBoundary fallbackTitle="Lumen Trading Terminal">
      <Provider>
        <Shell>{page}</Shell>
      </Provider>
    </ErrorBoundary>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
