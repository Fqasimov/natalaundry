# Over-the-air updates

## The one thing to understand first

**An OTA update cannot reach an app that has no updates client in it.**

The build currently on the App Store and Play (1.0.3) was made without
`expo-updates`. There is no code in that binary that knows how to look for an
update, so nothing published here will ever arrive on it. That is not a
configuration mistake to fix — it is what the installed binary is.

So the sequence is:

1. Ship **one** store build containing `expo-updates` (the config in
   `app.config.ts` is now ready for it).
2. From then on, JS-only changes reach that build over the air, in seconds,
   with no review.

Everything below is about step 2. Step 1 is a normal release.

## What can and cannot go OTA

An update replaces the **JavaScript bundle and its assets**. It cannot change
native code. In practice:

| Change | OTA? |
|---|---|
| Screens, layout, copy, i18n, styles | yes |
| Business logic in `lib/`, pricing tables | yes |
| Images, fonts under `assets/` | yes |
| Adding or removing an `expo-*` native module | **no — build** |
| `app.config.ts` native sections (plugins, permissions, Info.plist) | **no — build** |
| Anything in `supabase/*.sql` or `backend/` | neither — that is server-side |

`runtimeVersion` is set to the **fingerprint** policy, which computes the
version from the native dependencies. This is the guard that makes the table
above enforced rather than remembered: add a native module and the fingerprint
changes, so the new bundle is simply never offered to older binaries. With the
`appVersion` policy the same update would install happily and then crash on the
first screen that touched the missing module.

Worth being concrete about that, because it already applies: the referral
screen's Copy button uses `expo-clipboard`, added on 2026-09-14. **Everything
in that change set needs a build, not an OTA**, for that one reason.

## First-time setup (needs an EAS account; once only)

```bash
npm install -g eas-cli
eas login
eas init                 # writes extra.eas.projectId into app.config.ts
eas update:configure     # writes updates.url
```

Then build once per platform so there is something for updates to land on:

```bash
eas build --profile production --platform all
```

`eas.json` already declares a `channel` on every build profile
(`development` / `preview` / `production`) — a build with no channel can never
receive an update, because the channel is what a publish targets.

## Publishing an update

```bash
# staging first — preview builds are on their own channel
eas update --branch preview --message "what changed"

# then production
eas update --branch production --message "what changed"
```

Check what a device would actually get:

```bash
eas update:list --branch production
```

Rolling one back is a republish of the previous one, not a delete:

```bash
eas update:republish --branch production --group <previous-group-id>
```

## Before every publish

Same checks as any push, because an OTA skips review entirely and lands on real
phones in seconds:

1. `npx tsc --noEmit`
2. `cd backend && php artisan test` — if anything server-side moved
3. Confirm the change is JS-only. If `package.json` gained or lost a native
   module, or `app.config.ts`'s native sections changed, it is a build.

An OTA has no staged rollout on the free tier. `preview` first is the only
safety net there is.

## This container cannot publish

For the record, so nobody retries it: the agent proxy blocks `expo.dev`,
there is no `EXPO_TOKEN`, and the project is not linked to an EAS project.
Publishing is done from a machine with an EAS login.
