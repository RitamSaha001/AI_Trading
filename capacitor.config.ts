import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.lumen.trading',
  appName: 'Lumen AI Trading',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: [
      '87.76.191.49.nip.io',
      '*.upstox.com',
      'api.upstox.com',
    ],
  },
};

export default config;
