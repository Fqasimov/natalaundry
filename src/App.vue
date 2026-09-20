<script setup>
import { RouterView } from "vue-router";
import Preloader from "./components/Preloader.vue";
import SiteHeader from "./components/SiteHeader.vue";
import SiteFooter from "./components/SiteFooter.vue";
</script>

<template>
  <Preloader />
  <SiteHeader />

  <!--
    `mode="out-in"` so the two pages never overlap: a cross-fade between two
    full-height documents shows both scrollbars at once and jumps the layout.
  -->
  <RouterView v-slot="{ Component }">
    <Transition name="page" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>

  <SiteFooter />
</template>

<style>
.page-enter-active {
  transition:
    opacity 0.42s var(--ease),
    transform 0.58s var(--spring);
}

.page-leave-active {
  transition:
    opacity 0.2s var(--ease),
    transform 0.2s var(--ease);
}

.page-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active {
    transition: opacity 0.15s linear;
  }
  .page-enter-from,
  .page-leave-to {
    transform: none;
  }
}
</style>
