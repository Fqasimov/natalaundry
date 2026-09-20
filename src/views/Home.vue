<script setup>
import { ref } from "vue";
import Icon from "../components/Icon.vue";
import { t } from "../i18n.js";
import { site, storeLink } from "../site.js";

const SERVICE_ICONS = ["wash", "dryclean", "iron", "duvet"];
const FEATURE_ICONS = ["route", "leaf", "shield", "spark"];

// One open at a time. Index rather than a boolean per item, so closing the
// previous one is the same operation as opening the next.
const openFaq = ref(0);
const toggle = (i) => (openFaq.value = openFaq.value === i ? -1 : i);
</script>

<template>
  <main>
    <!-- ── hero ──────────────────────────────────────────────────────────── -->
    <section class="hero">
      <div class="hero__glow" aria-hidden="true" />
      <div class="shell hero__grid">
        <div class="hero__copy">
          <p class="rating" v-reveal>
            <span class="stars" aria-hidden="true">★★★★★</span>
            {{ t.hero.rating }}
          </p>
          <h1 class="h-display" v-reveal="70">{{ t.hero.title }}</h1>
          <p class="lead hero__lead" v-reveal="140">{{ t.hero.lead }}</p>

          <div class="hero__actions" v-reveal="210">
            <a class="btn btn--solid" :href="storeLink()" target="_blank" rel="noopener">
              {{ t.hero.primary }}
              <Icon name="arrow" :size="18" />
            </a>
            <a class="btn btn--ghost" href="#efficiency">{{ t.hero.secondary }}</a>
          </div>

          <dl class="hero__stats" v-reveal="280">
            <div>
              <dt>{{ t.hero.statCycleValue }}</dt>
              <dd>{{ t.hero.statCycle }}</dd>
            </div>
            <div>
              <dt>{{ t.hero.statCleanedValue }}</dt>
              <dd>{{ t.hero.statCleaned }}</dd>
            </div>
            <div>
              <dt>{{ t.efficiency.yearsValue }}</dt>
              <dd>{{ t.efficiency.yearsLabel }}</dd>
            </div>
          </dl>
        </div>

        <!-- A composed panel rather than a stock photo: it shows the product
             doing its job, and it is text, so it translates. -->
        <div class="hero__panel" v-reveal="160">
          <div class="card card--status">
            <span class="tick"><Icon name="check" :size="16" /></span>
            <div>
              <strong>{{ t.hero.cardStatus }}</strong>
              <small>{{ t.hero.cardTime }}</small>
            </div>
          </div>

          <div class="card card--order">
            <div class="order__row">
              <span class="order__id">{{ t.efficiency.orderLabel }}</span>
              <span class="badge">{{ t.efficiency.orderReady }}</span>
            </div>
            <div class="track" aria-hidden="true">
              <span class="track__fill" />
            </div>
            <div class="order__row order__row--foot">
              <span>{{ t.efficiency.orderDelivering }}</span>
              <span class="muted">{{ t.efficiency.orderEta }}</span>
            </div>
          </div>

          <div class="card card--water">
            <span class="water__label">{{ t.efficiency.waterLabel }}</span>
            <strong class="water__value">{{ t.efficiency.waterValue }}</strong>
            <small class="muted">{{ t.efficiency.waterNote }}</small>
          </div>
        </div>
      </div>
    </section>

    <!-- ── services ──────────────────────────────────────────────────────── -->
    <section id="services" class="section">
      <div class="shell">
        <p class="eyebrow" v-reveal>{{ t.services.eyebrow }}</p>
        <h2 class="h-section head" v-reveal="60">{{ t.services.title }}</h2>

        <ul class="grid grid--4">
          <li
            v-for="(s, i) in t.services.items"
            :key="s.name"
            class="tile"
            v-reveal="i * 90"
          >
            <span class="tile__icon"><Icon :name="SERVICE_ICONS[i]" :size="26" /></span>
            <h3>{{ s.name }}</h3>
            <p>{{ s.body }}</p>
          </li>
        </ul>
      </div>
    </section>

    <!-- ── efficiency ────────────────────────────────────────────────────── -->
    <section id="efficiency" class="section section--tint">
      <div class="shell">
        <div class="split">
          <h2 class="h-section" v-reveal>{{ t.efficiency.title }}</h2>
          <p class="lead" v-reveal="80">{{ t.efficiency.lead }}</p>
        </div>

        <ul class="grid grid--4 grid--features">
          <li
            v-for="(f, i) in t.efficiency.items"
            :key="f.name"
            class="feature"
            v-reveal="i * 90"
          >
            <span class="feature__icon"><Icon :name="FEATURE_ICONS[i]" :size="22" /></span>
            <h3>{{ f.name }}</h3>
            <p>{{ f.body }}</p>
          </li>
        </ul>

        <ul class="chips" v-reveal="120">
          <li v-for="c in t.efficiency.chips" :key="c">
            <Icon name="check" :size="15" />{{ c }}
          </li>
        </ul>
      </div>
    </section>

    <!-- ── about ─────────────────────────────────────────────────────────── -->
    <section id="about" class="section">
      <div class="shell about">
        <div class="about__copy">
          <h2 class="h-section" v-reveal>{{ t.about.title }}</h2>
          <p class="lead" v-reveal="70">{{ t.about.body1 }}</p>
          <p class="lead" v-reveal="130">{{ t.about.body2 }}</p>
        </div>

        <div class="about__pillars">
          <article class="pillar" v-reveal="90">
            <span class="pillar__num">1</span>
            <h3>{{ t.about.missionLabel }}</h3>
            <p>{{ t.about.mission }}</p>
          </article>
          <article class="pillar" v-reveal="170">
            <span class="pillar__num">2</span>
            <h3>{{ t.about.visionLabel }}</h3>
            <p>{{ t.about.vision }}</p>
          </article>
        </div>
      </div>
    </section>

    <!-- ── faq ───────────────────────────────────────────────────────────── -->
    <section id="faq" class="section section--tint">
      <div class="shell faq">
        <div class="faq__head">
          <h2 class="h-section" v-reveal>{{ t.faq.title }}</h2>
          <a class="btn btn--ghost" :href="site.whatsapp" target="_blank" rel="noopener" v-reveal="60">
            {{ t.faq.help }}
          </a>
        </div>

        <ul class="faq__list">
          <li
            v-for="(f, i) in t.faq.items"
            :key="f.q"
            class="qa"
            :class="{ 'qa--open': openFaq === i }"
            v-reveal="i * 70"
          >
            <button class="qa__q" :aria-expanded="openFaq === i" @click="toggle(i)">
              <span>{{ f.q }}</span>
              <Icon name="chevron" :size="20" class="qa__chevron" />
            </button>
            <!-- grid-template-rows 0fr → 1fr animates to the content's real
                 height, which a max-height guess never does correctly. -->
            <div class="qa__wrap">
              <div class="qa__inner"><p>{{ f.a }}</p></div>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <!-- ── contact ───────────────────────────────────────────────────────── -->
    <section id="contact" class="section">
      <div class="shell">
        <div class="contact" v-reveal>
          <div class="contact__copy">
            <h2 class="h-section">{{ t.contact.title }}</h2>
            <p class="lead">{{ t.contact.lead }}</p>
          </div>
          <ul class="contact__list">
            <li>
              <a :href="`tel:${site.phone}`">
                <Icon name="phone" :size="20" />
                <span><small>{{ t.contact.phone }}</small>{{ site.phoneDisplay }}</span>
              </a>
            </li>
            <li>
              <a :href="`mailto:${site.email}`">
                <Icon name="mail" :size="20" />
                <span><small>{{ t.contact.email }}</small>{{ site.email }}</span>
              </a>
            </li>
            <li>
              <a :href="site.whatsapp" target="_blank" rel="noopener">
                <Icon name="chat" :size="20" />
                <span><small>{{ t.contact.whatsapp }}</small>{{ site.phoneDisplay }}</span>
              </a>
            </li>
            <li>
              <div class="static">
                <Icon name="pin" :size="20" />
                <span><small>{{ t.contact.address }}</small>{{ t.contact.addressValue }}</span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
/* ── hero ────────────────────────────────────────────────────────────────── */
.hero {
  position: relative;
  padding-block: clamp(56px, 9vw, 112px) clamp(64px, 10vw, 128px);
  overflow: hidden;
}

/* One soft light source behind the headline. Not a gradient mesh — a single
   radial tint is enough to lift the page off flat white. */
.hero__glow {
  position: absolute;
  top: -28%;
  left: 50%;
  width: min(1100px, 130vw);
  aspect-ratio: 1;
  translate: -50% 0;
  background: radial-gradient(
    circle,
    rgba(68, 166, 181, 0.16) 0%,
    rgba(178, 213, 226, 0.09) 38%,
    transparent 68%
  );
  pointer-events: none;
}

.hero__grid {
  position: relative;
  display: grid;
  grid-template-columns: 1.08fr 0.92fr;
  gap: clamp(36px, 5vw, 72px);
  align-items: center;
}

.rating {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 7px 15px 7px 11px;
  margin-bottom: 26px;
  border-radius: var(--radius-pill);
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--ink-soft);
}

.stars {
  color: #f2b71e;
  letter-spacing: 0.06em;
  font-size: 0.8rem;
}

.hero__lead {
  margin-top: 22px;
  max-width: 50ch;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 34px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 14px 26px;
  border-radius: var(--radius-pill);
  font-weight: 700;
  font-size: 0.96rem;
  transition:
    transform 0.32s var(--spring),
    background 0.26s var(--ease),
    box-shadow 0.32s var(--ease),
    border-color 0.26s var(--ease);
}

.btn--solid {
  background: var(--midnight);
  color: #fff;
  box-shadow: var(--shadow-md);
}

.btn--solid:hover {
  background: var(--moonstone-ink);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.btn--solid:active {
  transform: translateY(0) scale(0.985);
}

.btn--solid svg {
  transition: transform 0.36s var(--spring);
}

.btn--solid:hover svg {
  transform: translateX(3px);
}

.btn--ghost {
  background: var(--surface);
  color: var(--midnight);
  border: 1px solid var(--border);
}

.btn--ghost:hover {
  border-color: var(--moonstone);
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.hero__stats {
  display: flex;
  flex-wrap: wrap;
  gap: clamp(22px, 4vw, 48px);
  margin-top: 46px;
  padding-top: 30px;
  border-top: 1px solid var(--divider);
}

.hero__stats dt {
  font-size: clamp(1.5rem, 2.4vw, 1.95rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--midnight);
}

.hero__stats dd {
  margin: 4px 0 0;
  max-width: 22ch;
  font-size: 0.83rem;
  line-height: 1.45;
  color: var(--ink-faint);
}

/* ── hero panel ──────────────────────────────────────────────────────────── */
.hero__panel {
  display: grid;
  gap: 16px;
  align-content: center;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-md);
  transition: transform 0.45s var(--spring);
}

.card:hover {
  transform: translateY(-3px);
}

.card--status {
  display: flex;
  align-items: center;
  gap: 14px;
  justify-self: end;
  width: min(100%, 320px);
}

.tick {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 50%;
  background: var(--moonstone);
  color: #fff;
}

.card--status strong {
  display: block;
  font-size: 0.95rem;
  color: var(--midnight);
}

.card--status small {
  color: var(--ink-faint);
  font-size: 0.82rem;
}

.card--order {
  width: min(100%, 400px);
}

.order__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.order__row--foot {
  margin-top: 12px;
  font-size: 0.85rem;
  color: var(--ink-soft);
}

.order__id {
  font-weight: 700;
  color: var(--midnight);
}

.badge {
  padding: 4px 11px;
  border-radius: var(--radius-pill);
  background: var(--moonstone-soft);
  color: var(--moonstone-ink);
  font-size: 0.74rem;
  font-weight: 700;
}

.track {
  height: 6px;
  margin-top: 16px;
  border-radius: 3px;
  background: var(--alice);
  overflow: hidden;
}

.track__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--moonstone), var(--midnight));
  animation: fill 2.8s var(--ease) infinite;
}

@keyframes fill {
  0% {
    width: 18%;
  }
  60% {
    width: 78%;
  }
  100% {
    width: 78%;
  }
}

.card--water {
  display: grid;
  gap: 3px;
  justify-self: start;
  width: min(100%, 260px);
}

.water__label {
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--moonstone-ink);
}

.water__value {
  font-size: 1.85rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--midnight);
}

.muted {
  color: var(--ink-faint);
  font-size: 0.82rem;
}

/* ── shared section bits ─────────────────────────────────────────────────── */
.section--tint {
  background: linear-gradient(180deg, var(--surface), var(--alice));
}

.head {
  margin-top: 12px;
  margin-bottom: clamp(32px, 4vw, 52px);
}

.grid {
  display: grid;
  gap: 18px;
}

.grid--4 {
  grid-template-columns: repeat(4, 1fr);
}

.tile {
  padding: 28px 24px 30px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  transition:
    transform 0.42s var(--spring),
    box-shadow 0.42s var(--ease),
    border-color 0.3s var(--ease);
}

.tile:hover {
  transform: translateY(-5px);
  box-shadow: var(--shadow-lg);
  border-color: var(--moonstone);
}

.tile__icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  margin-bottom: 20px;
  border-radius: var(--radius-md);
  background: var(--moonstone-soft);
  color: var(--midnight);
  transition:
    background 0.32s var(--ease),
    color 0.32s var(--ease);
}

.tile:hover .tile__icon {
  background: var(--midnight);
  color: #fff;
}

.tile h3 {
  font-size: 1.08rem;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--midnight);
}

.tile p {
  margin-top: 8px;
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--ink-soft);
}

.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: clamp(24px, 4vw, 56px);
  align-items: end;
  margin-bottom: clamp(36px, 5vw, 60px);
}

.grid--features {
  gap: 14px;
}

.feature {
  padding: 24px 22px;
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--border);
  backdrop-filter: blur(6px);
  transition:
    transform 0.42s var(--spring),
    background 0.3s var(--ease);
}

.feature:hover {
  transform: translateY(-4px);
  background: var(--surface);
}

.feature__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  margin-bottom: 16px;
  border-radius: var(--radius-sm);
  background: var(--midnight);
  color: #fff;
}

.feature h3 {
  font-size: 1rem;
  font-weight: 700;
  color: var(--midnight);
}

.feature p {
  margin-top: 7px;
  font-size: 0.89rem;
  line-height: 1.6;
  color: var(--ink-soft);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 32px;
}

.chips li {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 17px;
  border-radius: var(--radius-pill);
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--midnight);
}

.chips svg {
  color: var(--moonstone);
}

/* ── about ───────────────────────────────────────────────────────────────── */
.about {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: clamp(36px, 5vw, 72px);
  align-items: start;
}

.about__copy .lead + .lead {
  margin-top: 18px;
}

.about__copy .h-section {
  margin-bottom: 24px;
}

.about__pillars {
  display: grid;
  gap: 16px;
}

.pillar {
  position: relative;
  padding: 28px 26px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}

.pillar__num {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  margin-bottom: 15px;
  border-radius: 50%;
  background: var(--alice);
  color: var(--moonstone-ink);
  font-size: 0.82rem;
  font-weight: 800;
}

.pillar h3 {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--midnight);
}

.pillar p {
  margin-top: 8px;
  font-size: 0.93rem;
  line-height: 1.62;
  color: var(--ink-soft);
}

/* ── faq ─────────────────────────────────────────────────────────────────── */
.faq__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: clamp(28px, 4vw, 44px);
}

.faq__list {
  display: grid;
  gap: 10px;
}

.qa {
  border-radius: var(--radius-md);
  background: var(--surface);
  border: 1px solid var(--border);
  overflow: hidden;
  transition: border-color 0.28s var(--ease);
}

.qa--open {
  border-color: var(--moonstone);
}

.qa__q {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  width: 100%;
  padding: 20px 22px;
  text-align: start;
  font-size: 1rem;
  font-weight: 600;
  color: var(--midnight);
}

.qa__chevron {
  flex: none;
  color: var(--moonstone-ink);
  transition: transform 0.4s var(--spring);
}

.qa--open .qa__chevron {
  transform: rotate(180deg);
}

.qa__wrap {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.44s var(--ease);
}

.qa--open .qa__wrap {
  grid-template-rows: 1fr;
}

.qa__inner {
  overflow: hidden;
}

.qa__inner p {
  padding: 0 22px 22px;
  font-size: 0.94rem;
  line-height: 1.68;
  color: var(--ink-soft);
}

/* ── contact ─────────────────────────────────────────────────────────────── */
.contact {
  display: grid;
  grid-template-columns: 0.9fr 1.1fr;
  gap: clamp(28px, 4vw, 60px);
  align-items: center;
  padding: clamp(32px, 4vw, 56px);
  border-radius: var(--radius-xl);
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-md);
}

.contact__copy .lead {
  margin-top: 14px;
}

.contact__list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.contact__list a,
.contact__list .static {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 17px 18px;
  border-radius: var(--radius-md);
  background: var(--alice);
  color: var(--midnight);
  font-weight: 600;
  font-size: 0.93rem;
  transition:
    background 0.28s var(--ease),
    transform 0.36s var(--spring);
}

.contact__list a:hover {
  background: var(--moonstone-soft);
  transform: translateY(-2px);
}

.contact__list svg {
  flex: none;
  color: var(--moonstone-ink);
}

.contact__list small {
  display: block;
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin-bottom: 2px;
}

/* ── responsive ──────────────────────────────────────────────────────────── */
@media (max-width: 1000px) {
  .hero__grid,
  .about,
  .contact,
  .split {
    grid-template-columns: 1fr;
  }
  .grid--4 {
    grid-template-columns: repeat(2, 1fr);
  }
  .card--status,
  .card--water {
    justify-self: stretch;
    width: 100%;
  }
  .about__pillars {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 640px) {
  .grid--4,
  .about__pillars,
  .contact__list {
    grid-template-columns: 1fr;
  }
  .hero__stats {
    gap: 20px 28px;
  }
  .btn {
    flex: 1 1 auto;
  }
}
</style>
