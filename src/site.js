/*
  The handful of facts the whole site points at, in one place.

  Contacts are the ones the app itself uses (app/profile/support.tsx), so the
  two cannot drift.

  NOTE on the store links. The iOS id is the real App Store id for this app.
  The Play URL is the correct form for the package name, but the app is not on
  Google Play yet — the listing has never been published. Until it is, that
  link 404s, which is why `playLive` exists: the download button falls back to
  the App Store rather than offering a broken link. Flip it to true on the day
  the Play listing goes live.
*/
export const site = {
  phone: "+994102055050",
  phoneDisplay: "+994 10 205 50 50",
  email: "info@natalaundry.az",
  whatsapp: "https://wa.me/994102055050",

  appStore: "https://apps.apple.com/app/id6793012757",
  playStore: "https://play.google.com/store/apps/details?id=az.natalaundry.app",
  playLive: false,

  social: {
    instagram: "https://instagram.com/natalaundry.az",
    facebook: "https://facebook.com/natalaundry.az",
  },
};

/** Where the "Get the app" button should send this visitor. */
export function storeLink() {
  if (typeof navigator === "undefined") return site.appStore;
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return site.playLive ? site.playStore : site.appStore;
  return site.appStore;
}
