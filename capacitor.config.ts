import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vortex.trade',
  appName: 'VortexWeb',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
