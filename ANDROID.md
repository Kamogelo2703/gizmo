# Android APK (ZETA SCALPER AI)

The Android app is a Capacitor shell that loads the **live production site**:

`https://www.apex-ea.com`

That means MetaAPI, PayPal, Chart Scanner (OpenAI), licenses, mentors, and every other backend/API/secret stay on Vercel — exactly like the website. Nothing sensitive is baked into the APK.

## Download

- Sideload file: `public/ZETA-SCALPER-AI.apk`
- After deploy: https://www.apex-ea.com/ZETA-SCALPER-AI.apk

## Rebuild

```bash
cp android/keystore/signing.properties.example android/keystore/signing.properties
# set passwords + ensure apexea-release.jks exists under android/keystore/
npm run android:apk
```

APK output: `android/app/build/outputs/apk/release/app-release.apk`
