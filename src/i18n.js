import { computed, ref, watch } from "vue";
import az from "./content/az.js";
import ru from "./content/ru.js";
import en from "./content/en.js";

// Small enough not to need vue-i18n: three static dictionaries and no
// pluralisation or date formatting on this site. A library here would be more
// bytes than the copy it serves.
export const LOCALES = { az, ru, en };
export const LOCALE_LIST = [az.meta, ru.meta, en.meta];

const STORAGE_KEY = "nata-locale";

function initial() {
  // Wrapped: localStorage throws outright in a private window on some
  // browsers, and a language preference is not worth a blank page.
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LOCALES[saved]) return saved;
  } catch {
    /* ignore */
  }
  const nav = (navigator.language || "az").slice(0, 2).toLowerCase();
  return LOCALES[nav] ? nav : "az";
}

export const locale = ref(initial());

export const t = computed(() => LOCALES[locale.value]);

export function setLocale(next) {
  if (!LOCALES[next]) return;
  locale.value = next;
}

watch(
  locale,
  (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
    // Screen readers and the browser's own translation prompt both key off
    // this, and it is wrong on every page until it is set.
    document.documentElement.lang = value;
  },
  { immediate: true }
);
