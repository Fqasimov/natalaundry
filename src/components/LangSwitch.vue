<script setup>
import { locale, setLocale, LOCALE_LIST } from "../i18n.js";

/*
  Three languages, so a segmented control rather than a dropdown: every option
  is visible, it is one tap instead of two, and the active one is legible at a
  glance. The sliding indicator is a single translated element, not a border
  moving between buttons, which keeps it smooth on a repaint.
*/
const index = () => LOCALE_LIST.findIndex((l) => l.locale === locale.value);
</script>

<template>
  <div class="switch" role="group" aria-label="Language">
    <span class="pill" :style="{ transform: `translateX(${index() * 100}%)` }" />
    <button
      v-for="l in LOCALE_LIST"
      :key="l.locale"
      class="opt"
      :class="{ 'opt--on': locale === l.locale }"
      :aria-pressed="locale === l.locale"
      :title="l.label"
      @click="setLocale(l.locale)"
    >
      {{ l.short }}
    </button>
  </div>
</template>

<style scoped>
.switch {
  position: relative;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: var(--alice);
  border: 1px solid var(--border);
}

.pill {
  position: absolute;
  top: 3px;
  left: 3px;
  width: calc((100% - 6px) / 3);
  height: calc(100% - 6px);
  border-radius: var(--radius-pill);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  transition: transform 0.42s var(--spring);
}

.opt {
  position: relative;
  z-index: 1;
  padding: 5px 11px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
  border-radius: var(--radius-pill);
  transition: color 0.25s var(--ease);
}

.opt--on {
  color: var(--midnight);
}
</style>
