<script setup>
import { RouterLink } from "vue-router";
import Icon from "./Icon.vue";
import { t } from "../i18n.js";
import { site } from "../site.js";

/*
  Shared chrome for Terms and Privacy. The two pages have identical structure —
  a title, a last-updated line and numbered sections of paragraphs and lists —
  so the layout lives here and each page supplies only its content.

  Google requires the privacy policy to be "active, not editable, accessible
  from anywhere in the world, and accessible from within your app". Static
  prose on a static host satisfies the first three; the app's support screen
  links here for the fourth.
*/
defineProps({
  doc: { type: Object, required: true },
});
</script>

<template>
  <main class="legal">
    <div class="shell">
      <RouterLink to="/" class="back">
        <Icon name="arrow" :size="17" class="back__arrow" />
        {{ t.legal.back }}
      </RouterLink>

      <header class="head">
        <h1>{{ doc.title }}</h1>
        <p class="updated">{{ t.legal.updated }}</p>
      </header>

      <article class="prose">
        <section v-for="(s, i) in doc.sections" :key="i" :id="s.anchor">
          <h2>{{ s.h }}</h2>

          <p v-for="(para, j) in s.p || []" :key="`p${j}`">{{ para }}</p>

          <ul v-if="s.list">
            <li v-for="(item, k) in s.list" :key="`l${k}`">
              <span class="dot" aria-hidden="true" />{{ item }}
            </li>
          </ul>

          <p v-if="s.contactLine" class="contact-line">
            {{ s.contactLine }}
            <a :href="`mailto:${site.email}`">{{ site.email }}</a>
          </p>
        </section>

        <!-- The final section is always "contact us", and the address belongs
             with it rather than being repeated in the content files. -->
        <div class="card">
          <a :href="`mailto:${site.email}`"><Icon name="mail" :size="19" />{{ site.email }}</a>
          <a :href="`tel:${site.phone}`"><Icon name="phone" :size="19" />{{ site.phoneDisplay }}</a>
        </div>
      </article>
    </div>
  </main>
</template>

<style scoped>
.legal {
  padding-block: clamp(34px, 5vw, 60px) clamp(64px, 8vw, 104px);
}

.shell {
  max-width: 800px;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px 8px 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 0.87rem;
  font-weight: 600;
  color: var(--ink-soft);
  transition:
    color 0.24s var(--ease),
    border-color 0.24s var(--ease),
    transform 0.32s var(--spring);
}

.back:hover {
  color: var(--midnight);
  border-color: var(--moonstone);
  transform: translateX(-3px);
}

.back__arrow {
  transform: rotate(180deg);
}

.head {
  margin-block: clamp(26px, 4vw, 44px) clamp(28px, 4vw, 42px);
  padding-bottom: 26px;
  border-bottom: 1px solid var(--divider);
}

.head h1 {
  font-size: clamp(2rem, 4.2vw, 2.9rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.1;
  color: var(--midnight);
}

.updated {
  margin-top: 12px;
  font-size: 0.87rem;
  color: var(--ink-faint);
}

.prose section + section {
  margin-top: clamp(30px, 4vw, 44px);
}

/* scroll-margin so a deep link (the app's deletion link points at one) does
   not land with the heading hidden behind the sticky header. */
.prose section {
  scroll-margin-top: 96px;
}

.prose h2 {
  font-size: 1.18rem;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--midnight);
  margin-bottom: 14px;
}

.prose p {
  font-size: 1rem;
  line-height: 1.75;
  color: var(--ink-soft);
}

.prose p + p {
  margin-top: 14px;
}

.prose ul {
  margin-top: 14px;
  display: grid;
  gap: 11px;
}

.prose li {
  display: flex;
  gap: 12px;
  font-size: 0.98rem;
  line-height: 1.7;
  color: var(--ink-soft);
}

.dot {
  flex: none;
  width: 6px;
  height: 6px;
  margin-top: 11px;
  border-radius: 50%;
  background: var(--moonstone);
}

.contact-line {
  margin-top: 14px;
}

.contact-line a,
.card a {
  color: var(--moonstone-ink);
  font-weight: 600;
}

.contact-line a:hover {
  text-decoration: underline;
}

.card {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: clamp(32px, 4vw, 48px);
  padding: 22px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}

.card a {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: var(--radius-md);
  background: var(--alice);
  transition:
    background 0.26s var(--ease),
    transform 0.32s var(--spring);
}

.card a:hover {
  background: var(--moonstone-soft);
  transform: translateY(-2px);
}
</style>
