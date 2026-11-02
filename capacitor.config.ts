import type { CapacitorConfig } from '@capacitor/cli';

// The Android app opens the Relax&Bite site inside a full-screen app window.
//
// While building:
//   - Emulator: uses http://10.0.2.2:4321, which always means "this computer".
//   - Your own phone: set CAP_SERVER_URL to your computer's Wi-Fi address,
//     e.g.  $env:CAP_SERVER_URL="http://192.168.0.105:4321"; npx cap sync android
// For the Play Store: set CAP_SERVER_URL to the live Netlify address (https).
const serverUrl = process.env.CAP_SERVER_URL || 'http://10.0.2.2:4321';

const config: CapacitorConfig = {
  appId: 'com.relaxandbite.app',
  appName: 'Relax&Bite',
  webDir: 'app-shell',
  // Behind the pages while one loads (the app is white)
  backgroundColor: '#ffffff',
  // Lets the pages know they're inside the app (must match SITE.appUserAgent in src/data/site.ts)
  appendUserAgent: 'RelaxBiteApp',
  server: {
    url: serverUrl,
    // Allows plain http only for your computer during development
    cleartext: serverUrl.startsWith('http://'),
    androidScheme: 'https',
    // Paystack's payment page opens inside the app (not the phone's browser),
    // so the customer comes straight back to their order
    allowNavigation: ['checkout.paystack.com', '*.paystack.com', '*.paystack.co'],
  },
  android: {
    backgroundColor: '#ffffff',
    allowMixedContent: false,
    // Keep the pages clear of the phone's status bar and navigation bar
    // (Android 15+ draws apps edge to edge); the bars show the app's dark colour
    adjustMarginsForEdgeToEdge: 'force',
  },
  plugins: {
    // Newer Capacitor: dark icons on the white bars
    SystemBars: {
      style: 'LIGHT',
    },
    // Order notifications for vendors, riders and admins (needs
    // npm install @capacitor/push-notifications and android/app/google-services.json)
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
