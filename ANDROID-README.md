# Relax&Bite Android app (Capacitor + Android Studio)

## One-time setup
1. Install Android Studio (with the Android SDK) from developer.android.com/studio.
2. In VS Code's terminal, in the project folder:

       npm install @capacitor/core @capacitor/android
       npm install -D @capacitor/cli
       npx cap add android

3. Add location permission. Open `android/app/src/main/AndroidManifest.xml` and paste these two lines just above `<application`:

       <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
       <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />

4. For the order tracker on the lock screen, paste these two lines there too:

       <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
       <uses-permission android:name="android.permission.POST_PROMOTED_NOTIFICATIONS" />

## Every time you develop
1. Start the site so your phone can reach it:

       npm run dev -- --host

   Note the "Network" address it prints, for example http://192.168.0.105:4321
2. Put that address in `capacitor.config.ts` (the serverUrl line), then:

       npx cap sync android
       npx cap open android

3. In Android Studio, pick your phone (USB debugging on) or an emulator, and press Run.
   Phone and computer must be on the same Wi-Fi.

## For the Play Store (after the site is on Netlify)
Set the live address and build:

    $env:CAP_SERVER_URL="https://your-site.netlify.app"; npx cap sync android

Then in Android Studio: Build > Generate Signed App Bundle.
The app id `com.relaxandbite.app` can't be changed after the first Play Store upload.
