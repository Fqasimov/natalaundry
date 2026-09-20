<script setup>
/*
  A small stroked icon set, drawn here rather than pulled from a library.

  Four service glyphs and a few utility marks is not worth a dependency, and
  the laundry-domain shapes (a washing machine, an iron, a folded duvet) are
  exactly the ones general icon sets do not carry — the app hit the same wall
  and had to reach for MaterialCommunityIcons.

  All paths are drawn on a 24-grid with a 1.6 stroke so they sit together.
*/
defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 24 },
});
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- washing machine -->
    <template v-if="name === 'wash'">
      <rect x="3.5" y="2.8" width="17" height="18.4" rx="3" />
      <path d="M3.5 7.4h17" />
      <circle cx="12" cy="14.4" r="4.4" />
      <path d="M8.4 12.8c1.2 1 2 1 3.2.2s2-.8 3.2.2" />
      <circle cx="17.2" cy="5.1" r=".5" fill="currentColor" />
    </template>

    <!-- dry cleaning: a hanger -->
    <template v-else-if="name === 'dryclean'">
      <path d="M12 8.2V7a2.2 2.2 0 1 1 3.1-2" />
      <path d="M12 8.2 3.6 14.6c-.9.7-.4 2.1.7 2.1h15.4c1.1 0 1.6-1.4.7-2.1L12 8.2Z" />
    </template>

    <!-- iron -->
    <template v-else-if="name === 'iron'">
      <path d="M3 16.5h15.8a2.2 2.2 0 0 0 2.2-2.2c0-3.6-3-6.5-6.6-6.5H8.2A5.2 5.2 0 0 0 3 12.9v3.6Z" />
      <path d="M7.4 7.8V6.4a2 2 0 0 1 2-2h4.4" />
      <path d="M3 19.6h18" />
    </template>

    <!-- duvet / large items -->
    <template v-else-if="name === 'duvet'">
      <path d="M2.8 9.6c0-1.6 1.3-2.9 2.9-2.9h12.6c1.6 0 2.9 1.3 2.9 2.9v7.7H2.8V9.6Z" />
      <path d="M2.8 17.3v2.4M21.2 17.3v2.4" />
      <path d="M7 6.7v10.6M12 6.7v10.6M17 6.7v10.6" />
    </template>

    <!-- route / logistics -->
    <template v-else-if="name === 'route'">
      <circle cx="5.6" cy="5.6" r="2.4" />
      <circle cx="18.4" cy="18.4" r="2.4" />
      <path d="M8 5.6h6.2a3.4 3.4 0 0 1 0 6.8H9.8a3.4 3.4 0 0 0 0 6.8H16" />
    </template>

    <!-- leaf / eco -->
    <template v-else-if="name === 'leaf'">
      <path d="M4.4 19.6c-1.6-5.6 1.6-11.2 8-12.8 2-.5 4-.6 6-.4.3 3.4-.5 6.8-2.4 9.4-2.6 3.6-7.2 4.8-11.6 3.8Z" />
      <path d="M4.4 19.6c2-4.4 5.2-7.6 9.2-9.6" />
    </template>

    <!-- shield / guarantee -->
    <template v-else-if="name === 'shield'">
      <path d="M12 2.9 4.6 6v6c0 4.3 3 8.2 7.4 9.2 4.4-1 7.4-4.9 7.4-9.2V6L12 2.9Z" />
      <path d="m8.8 11.9 2.2 2.2 4.2-4.2" />
    </template>

    <!-- sparkle / expert care -->
    <template v-else-if="name === 'spark'">
      <path d="M12 3.2 13.7 9l5.8 1.7-5.8 1.7L12 18.2l-1.7-5.8L4.5 10.7 10.3 9 12 3.2Z" />
      <path d="M18.8 16.4l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z" />
    </template>

    <!-- check -->
    <template v-else-if="name === 'check'">
      <path d="m4.8 12.6 4.6 4.6 9.8-10.4" />
    </template>

    <!-- chevron -->
    <template v-else-if="name === 'chevron'">
      <path d="m6.4 9.2 5.6 5.6 5.6-5.6" />
    </template>

    <!-- arrow -->
    <template v-else-if="name === 'arrow'">
      <path d="M4.6 12h14.2M13.2 6.4 18.8 12l-5.6 5.6" />
    </template>

    <!-- phone -->
    <template v-else-if="name === 'phone'">
      <path
        d="M8.2 3.6H5.6A2 2 0 0 0 3.6 5.8C3.6 13.4 10.6 20.4 18.2 20.4a2 2 0 0 0 2.2-2v-2.6l-4-1.4-1.9 2.2a14.6 14.6 0 0 1-5.1-5.1l2.2-1.9-3.4-4Z"
      />
    </template>

    <!-- mail -->
    <template v-else-if="name === 'mail'">
      <rect x="2.8" y="5" width="18.4" height="14" rx="2.6" />
      <path d="m3.6 7 7.2 5.2a2 2 0 0 0 2.4 0L20.4 7" />
    </template>

    <!-- pin -->
    <template v-else-if="name === 'pin'">
      <path d="M12 21.4s7-5.6 7-11.1a7 7 0 1 0-14 0c0 5.5 7 11.1 7 11.1Z" />
      <circle cx="12" cy="10.1" r="2.6" />
    </template>

    <!-- chat -->
    <template v-else-if="name === 'chat'">
      <path d="M20.4 11.6c0 4-3.8 7.2-8.4 7.2a9.7 9.7 0 0 1-2.7-.4l-5 1.6 1.7-4.2a6.8 6.8 0 0 1-1.8-4.6c0-4 3.8-7.2 8.4-7.2s8.4 3.2 8.4 7.2Z" />
    </template>
  </svg>
</template>
