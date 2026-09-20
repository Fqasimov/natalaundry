<script setup>
import { RouterLink } from "vue-router";
import LogoMark from "./LogoMark.vue";
import { t } from "../i18n.js";
import { site } from "../site.js";

const year = new Date().getFullYear();
</script>

<template>
  <footer class="foot">
    <div class="shell">
      <div class="top">
        <div class="about">
          <div class="brand">
            <LogoMark :size="38" />
            <span>Nata Laundry</span>
          </div>
          <p class="tagline">{{ t.footer.tagline }}</p>
          <div class="social">
            <a :href="site.social.instagram" target="_blank" rel="noopener" aria-label="Instagram">IG</a>
            <a :href="site.social.facebook" target="_blank" rel="noopener" aria-label="Facebook">FB</a>
            <a :href="site.whatsapp" target="_blank" rel="noopener" aria-label="WhatsApp">WA</a>
          </div>
        </div>

        <div class="col">
          <h3>{{ t.footer.servicesTitle }}</h3>
          <ul>
            <li v-for="s in t.services.items" :key="s.name">{{ s.name }}</li>
          </ul>
        </div>

        <div class="col">
          <h3>{{ t.footer.helpTitle }}</h3>
          <ul>
            <li><a :href="`tel:${site.phone}`">{{ site.phoneDisplay }}</a></li>
            <li><a :href="`mailto:${site.email}`">{{ site.email }}</a></li>
            <li><a :href="site.whatsapp" target="_blank" rel="noopener">WhatsApp</a></li>
          </ul>
        </div>

        <div class="col">
          <h3>{{ t.footer.legalTitle }}</h3>
          <ul>
            <li><RouterLink to="/terms">{{ t.footer.terms }}</RouterLink></li>
            <li><RouterLink to="/privacy">{{ t.footer.privacy }}</RouterLink></li>
          </ul>
        </div>
      </div>

      <div class="rule" />

      <div class="bottom">
        <p>© {{ year }} Nata Laundry. {{ t.footer.rights }}</p>
        <!-- Stated plainly: this site sells nothing, and a visitor should not
             hunt for a basket that does not exist. -->
        <p class="note">{{ t.footer.note }}</p>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.foot {
  background: var(--midnight);
  color: rgba(255, 255, 255, 0.72);
  padding-block: clamp(52px, 7vw, 84px) 36px;
}

.top {
  display: grid;
  grid-template-columns: 1.7fr 1fr 1fr 1fr;
  gap: clamp(28px, 4vw, 56px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  color: #fff;
  font-weight: 800;
  font-size: 1.1rem;
  letter-spacing: -0.02em;
}

.tagline {
  margin-top: 16px;
  max-width: 38ch;
  font-size: 0.93rem;
  line-height: 1.65;
}

.social {
  display: flex;
  gap: 8px;
  margin-top: 22px;
}

.social a {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #fff;
  transition:
    background 0.28s var(--ease),
    transform 0.32s var(--spring);
}

.social a:hover {
  background: var(--moonstone);
  transform: translateY(-2px);
}

.col h3 {
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 15px;
}

.col li {
  font-size: 0.93rem;
  padding-block: 6px;
}

.col a {
  transition: color 0.22s var(--ease);
}

.col a:hover {
  color: #fff;
}

.rule {
  height: 1px;
  background: rgba(255, 255, 255, 0.14);
  margin-block: clamp(34px, 5vw, 54px) 24px;
}

.bottom {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 0.85rem;
}

.note {
  color: rgba(255, 255, 255, 0.5);
}

@media (max-width: 860px) {
  .top {
    grid-template-columns: 1fr 1fr;
  }
  .about {
    grid-column: 1 / -1;
  }
}

@media (max-width: 520px) {
  .top {
    grid-template-columns: 1fr;
  }
}
</style>
