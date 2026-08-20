# Nata Laundry

Recovery/rebuild of the Nata Laundry Expo app (`az.natalaundry.app`), whose
original source code was lost. The original App Store build's JS was
compiled to Hermes bytecode with no source maps, so it isn't cleanly
decompilable — this project is a **fresh rebuild**, seeded with everything
recoverable from the shipped binary and the live Supabase backend:

- Bundle ID `az.natalaundry.app`, URL scheme `natalaundry`
- Original iOS permission strings (camera, photo library, location, Face ID, mic)
- Stack: Expo + `expo-router` (file-based routing), React Navigation,
  Reanimated, Moti, `react-native-maps`, `react-native-google-places-autocomplete`,
  `@expo-google-fonts/outfit`, Supabase JS client
- Data model reconstructed from the live Supabase project's RLS policies /
  schema — see `types/database.ts` and `SCHEMA_NOTES.md`

## Status

This is a scaffold, not a full rebuild yet. Auth (email/password via
Supabase) and basic Home/Orders/Profile tab navigation work; most real
screens (order booking flow, courier offers, payments, wallet, notifications,
maps/address picker) still need to be built out against the real schema and
whatever UI details we can pin down.

## Setup

```bash
cp .env.example .env
# fill in EXPO_PUBLIC_SUPABASE_ANON_KEY and EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
npm install
npx expo start
```

## Backend

Supabase project: `dzplzvogobqmwaaimkef` (region `ap-northeast-2`).
Schema/RLS/Edge Function source is being pulled manually via the Supabase
dashboard (SQL Editor + Edge Functions tab) since this environment's network
policy blocks the Supabase Management API directly.
