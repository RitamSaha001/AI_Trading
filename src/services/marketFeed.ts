import { AppState, AppStateStatus } from 'react-native';
import { TICK_MS } from '../domain/trading';
import { usePortfolioStore } from '../store/portfolio';

let timer: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;
let lastStatus: AppStateStatus = AppState.currentState;

function start() {
  if (timer) return;
  timer = setInterval(() => usePortfolioStore.getState().tick(), TICK_MS);
}

function stop() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

export function startMarketFeed(): () => void {
  start();
  unsubscribe = AppState.addEventListener('change', (status) => {
    lastStatus = status;
    if (status === 'active') start();
    else stop();
  }).remove;

  return () => {
    stop();
    unsubscribe?.();
    unsubscribe = null;
  };
}

export function getMarketFeedStatus() {
  return { running: timer !== null, appState: lastStatus };
}
