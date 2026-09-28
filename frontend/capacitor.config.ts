import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gowtham.pg',
  appName: 'PGManagement',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    iosScheme: 'http'
  }
};

export default config;
