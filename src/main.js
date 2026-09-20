import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import Home from "./views/Home.vue";
import { reveal } from "./reveal.js";
import "./styles/base.css";

// Terms and Privacy are lazy: the landing page is what almost everyone loads,
// and the legal pages are long text nobody should pay for up front.
const routes = [
  { path: "/", name: "home", component: Home },
  { path: "/terms", name: "terms", component: () => import("./views/Terms.vue") },
  { path: "/privacy", name: "privacy", component: () => import("./views/Privacy.vue") },
  // The old site served these as .html files, and the Play Console
  // declaration may still point at one. Redirect rather than 404.
  { path: "/terms.html", redirect: "/terms" },
  { path: "/privacy.html", redirect: "/privacy" },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.hash) return { el: to.hash, behavior: "smooth", top: 88 };
    return { top: 0 };
  },
});

createApp(App).use(router).directive("reveal", reveal).mount("#app");
