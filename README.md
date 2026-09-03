# Lumen AI Trading — React Native

A performance-oriented React Native / Expo foundation for the Lumen simulated AI trading dashboard.

## Stack

- Expo SDK 57 / React Native 0.86
- TypeScript
- React Context + `useSyncExternalStore`-style store boundaries
- AsyncStorage for persisted paper-trading state
- `react-native-svg` for lightweight chart primitives
- Backend-only AI integration boundary

## Architecture

`src/domain` contains pure trading calculations and order rules.
`src/services` contains persistence, market-feed and AI client boundaries.
`src/store` contains the app store and derived selectors.
`src/components` contains memoized presentation components.
`src/screens` contains screen composition.

The market loop is AppState-aware and updates the store without forcing the entire screen tree to re-render. Market data and portfolio persistence are intentionally separated from UI state.

## AI security

The mobile app does not contain an Anthropic API key. Configure `EXPO_PUBLIC_AI_API_URL` to point at your server-side AI gateway.

## Run

```bash
npm install
npx expo start
```

For native builds, use the Expo/EAS workflow appropriate for your environment.

## Source migration

The original single-file browser prototype was split into domain logic, state, services, and React Native components. It remains a simulated paper-trading environment unless a real market feed/backend is explicitly connected.
