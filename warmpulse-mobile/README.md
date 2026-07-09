# WarmPulse Mobile (Android)

React Native (Expo SDK 56) app. Currently: the **hero screen only** (Design D — Bold Minimal), ported 1:1 from the web landing hero. Other screens are added later.

## Stack
- **Expo SDK 56** · React 19 · React Native 0.85 (new architecture)
- **Moti** + react-native-reanimated 4 — entrance + ping animations (framer-motion equivalent)
- **expo-linear-gradient** — gradient CTAs / logo / aurora
- **expo-blur** — glassmorphism (LIVE pill, secondary CTA)
- **react-native-svg** — aurora radial glow
- **@react-native-masked-view/masked-view** — gradient headline text (`Every time.`)
- **lucide-react-native** — icons
- **@expo-google-fonts/outfit** + **/jetbrains-mono** — typography (matches web)

## Run it

```bash
cd warmpulse-mobile
npm run android        # opens on a connected device / running emulator (needs Android SDK)
# or:
npm start              # then press 'a', or scan the QR with Expo Go
```

Fastest path with no local Android SDK: install **Expo Go** from the Play Store, run `npm start`, scan the QR.

## Build an installable APK (cloud, no local Android toolchain)

```bash
npm i -g eas-cli
eas login
eas build --platform android --profile preview     # -> downloadable APK
```

## Layout
```
App.tsx                 Hero screen (Design D)
theme/tokens.ts         wp-* dark theme colors + font names (mirrors hero-theme.css)
components/Aurora.tsx    SVG radial atmospheric glow
components/GradientText  MaskedView + LinearGradient gradient text
```

Theme tokens are kept in sync with `../frontend/src/pages/landing/hero-theme.css`.
