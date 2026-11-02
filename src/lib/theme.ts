// The app has one theme: white, with warm red.

/** Colour of the browser bar and the phone's bars */
export const BAR_COLOUR = '#ffffff';

declare global {
  interface Window {
    /** Added by the Android app (MainActivity) */
    RBNative?: { setTheme?: (theme: string) => void; openInBrowser?: (url: string) => void; pushToken?: () => string };
  }
}
