# RedPulse Mobile App 🩸

The cross-platform React Native / Expo mobile client for **RedPulse** — the emergency blood donation network connecting recipients with voluntary donors and certified blood banks in real time.

---

## 🌟 Key Features

- **Nearby Blood Banks via OpenStreetMap (OSM)**: Real-time queries for certified blood banks and trauma hospitals within a 30 km radius with phone dialer and driving directions.
- **Interactive Blood Group Compatibility Matrix**: Complete medical compatibility reference with an interactive matcher simulating matches across all 8 blood groups (O-, O+, A-, A+, B-, B+, AB-, AB+).
- **Real-Time Donor Location & MapLibre Tracking**: Recipient tracks accepted donors moving towards the hospital on a live MapLibre map with distance and drive ETA.
- **Integrated Emergency Chat**: Instant, private communication between patient families and matched donors via Supabase Realtime channels.
- **Urgency Escalation**: Critical (30 min alarm), Urgent (2 hrs), and Standard donation tiers.
- **Adaptive Dark & Light Theme**: Polished design system built with accessible contrast, reduced-motion compliance, and continuous-curve cards.

---

## 📱 Technology Stack

- **Framework**: React Native 0.76+ / Expo SDK 52 (Expo Router v4)
- **Maps & Geolocation**: MapLibre React Native (`@maplibre/maplibre-react-native`) + Expo Location
- **State Management & Server Cache**: TanStack React Query v5 + Zustand
- **Realtime & Backend**: Supabase Realtime + Express API
- **UI Components**: Custom high-performance Design System, Lucide/Ionicons, FlashList

---

## 🚀 Getting Started

### 1. Install Dependencies

```bash
cd mobile
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```env
# Point to your deployed backend or local development IP
EXPO_PUBLIC_API_URL=https://your-backend.onrender.com/api/v1

# Supabase configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. Start Development Server

```bash
npx expo start
```

Press **`a`** to launch on an Android emulator or scan the QR code with **Expo Go** on your physical device.

---

## 🏗️ Standalone Production Build (EAS)

To compile an installable standalone Android APK for demonstrations and hackathon testing:

```bash
# Build standalone APK
eas build -p android --profile preview

# Build production bundle for Google Play Store
eas build -p android --profile production
```

---

## 🧪 Testing

```bash
# Run unit test suite
npm test

# Run TypeScript typecheck
npm run typecheck
```
