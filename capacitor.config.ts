import type { CapacitorConfig } from '@capacitor/cli';

/** iOS App Store build: wraps the bundled web build in dist/ (never a hosted URL; see App Review 4.2). */
const config: CapacitorConfig = {
  appId: 'com.jamietowater.trowelblazer',
  appName: 'Trowelblazer',
  webDir: 'dist',
  backgroundColor: '#120b09',
  ios: {
    // The game owns every touch: no rubber-band scrolling, no link previews.
    scrollEnabled: false,
    allowsLinkPreview: false,
    contentInset: 'never',
    backgroundColor: '#120b09',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#120b09',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
    },
  },
};

export default config;
