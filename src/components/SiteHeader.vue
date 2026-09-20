<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import LogoMark from "./LogoMark.vue";
import LangSwitch from "./LangSwitch.vue";
import { t } from "../i18n.js";
import { storeLink } from "../site.js";

const route = useRoute();
const stuck = ref(false);
const open = ref(false);

// Threshold rather than any-scroll: a 1px flicker as the header swaps state is
// worse than no state change at all.
const onScroll = () => (stuck.value = window.scrollY > 24);

onMounted(() => {
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
});
onUnmounted(() => window.removeEventListener("scroll", onScroll));

// On the legal pages the section anchors do not exist, so they are routed
// back to the home page with a hash rather than left to scroll nowhere.
const sectionTo = (id) => (route.name === "home" ? { hash: `#${id}` } : { path: "/", hash: `#${id}` });
</script>

<template>
  <header class="bar" :class="{ 'bar--stuck': stuck }">
    <div class="shell row">
      <RouterLink to="/" class="brand" @click="open = false">
        <LogoMark :size="34" />
        <span>Nata Laundry</span>
      </RouterLink>

      <nav class="links" aria-label="Primary">
        <RouterLink :to="sectionTo('services')">{{ t.nav.services }}</RouterLink>
        <RouterLink :to="sectionTo('efficiency')">{{ t.nav.efficiency }}</RouterLink>
        <RouterLink :to="sectionTo('about')">{{ t.nav.about }}</RouterLink>
        <RouterLink :to="sectionTo('faq')">{{ t.nav.faq }}</RouterLink>
      </nav>

      <div class="right">
        <LangSwitch />
        <a class="cta" :href="storeLink()" target="_blank" rel="noopener">
          {{ t.nav.download }}
        </a>
        <button
          class="burger"
          :aria-expanded="open"
          aria-label="Menu"
          @click="open = !open"
        >
          <span :class="{ on: open }" /><span :class="{ on: open }" />
        </button>
      </div>
    </div>

    <Transition name="sheet">
      <nav v-if="open" class="sheet" aria-label="Primary">
        <RouterLink :to="sectionTo('services')" @click="open = false">{{ t.nav.services }}</RouterLink>
        <RouterLink :to="sectionTo('efficiency')" @click="open = false">{{ t.nav.efficiency }}</RouterLink>
        <RouterLink :to="sectionTo('about')" @click="open = false">{{ t.nav.about }}</RouterLink>
        <RouterLink :to="sectionTo('faq')" @click="open = false">{{ t.nav.faq }}</RouterLink>
        <a class="cta cta--wide" :href="storeLink()" target="_blank" rel="noopener">
          {{ t.nav.download }}
        </a>
      </nav>
    </Transition>
  </header>
</template>

<style scoped>
.bar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: transparent;
  transition:
    background 0.4s var(--ease),
    box-shadow 0.4s var(--ease),
    border-color 0.4s var(--ease);
  border-bottom: 1px solid transparent;
}

.bar--stuck {
  /* 0.9, not 0.82. At 0.82 a section heading passing underneath reads as a
     grey smear beside the logo — the blur softens it but does not hide it.
     Still translucent enough that the page is visibly moving behind. */
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: saturate(180%) blur(16px);
  -webkit-backdrop-filter: saturate(180%) blur(16px);
  border-bottom-color: var(--divider);
  box-shadow: var(--shadow-sm);
}

.row {
  display: flex;
  align-items: center;
  gap: 18px;
  height: 72px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 800;
  letter-spacing: -0.02em;
  font-size: 1.02rem;
  color: var(--midnight);
  /* Two words that must stay on one line — wrapped, the mark and the name
     stop reading as a single lockup. */
  white-space: nowrap;
}

.links {
  display: flex;
  gap: 4px;
  margin-inline: auto;
}

.links a {
  position: relative;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  font-size: 0.93rem;
  font-weight: 600;
  color: var(--ink-soft);
  transition:
    color 0.22s var(--ease),
    background 0.22s var(--ease);
}

.links a:hover {
  color: var(--midnight);
  background: var(--alice);
}

.right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cta {
  padding: 10px 18px;
  border-radius: var(--radius-pill);
  background: var(--midnight);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 700;
  white-space: nowrap;
  transition:
    transform 0.3s var(--spring),
    background 0.25s var(--ease),
    box-shadow 0.3s var(--ease);
}

.cta:hover {
  background: var(--moonstone-ink);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.cta:active {
  transform: translateY(0) scale(0.985);
}

.burger {
  display: none;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: var(--surface);
  position: relative;
}

.burger span {
  position: absolute;
  left: 11px;
  width: 18px;
  height: 1.8px;
  border-radius: 2px;
  background: var(--midnight);
  transition: transform 0.36s var(--spring);
}

.burger span:first-child {
  top: 16px;
}
.burger span:last-child {
  top: 22px;
}
.burger span:first-child.on {
  transform: translateY(3px) rotate(45deg);
}
.burger span:last-child.on {
  transform: translateY(-3px) rotate(-45deg);
}

.sheet {
  display: none;
  flex-direction: column;
  gap: 4px;
  padding: 10px var(--gutter) 22px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--divider);
}

.sheet a {
  padding: 13px 4px;
  font-weight: 600;
  color: var(--midnight);
  border-bottom: 1px solid var(--divider);
}

.cta--wide {
  margin-top: 14px;
  text-align: center;
  border-bottom: none;
  color: #fff;
}

.sheet-enter-active,
.sheet-leave-active {
  transition:
    opacity 0.3s var(--ease),
    transform 0.42s var(--spring);
  transform-origin: top;
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 1040 rather than 900: Russian and Azerbaijani nav labels ("Эффективность",
   "Çox verilən suallar") are far longer than the English ones, and at 900 they
   wrapped onto two lines and collided with the language switch. The breakpoint
   has to clear the longest translation, not the shortest. */
@media (max-width: 1040px) {
  .links {
    display: none;
  }
  .burger {
    display: block;
  }
  .sheet {
    display: flex;
  }
  .brand span {
    display: none;
  }
  .right {
    margin-inline-start: auto;
  }
}

@media (max-width: 460px) {
  .right > .cta {
    display: none;
  }
}
</style>
