/*
  `v-reveal` — fade-and-rise as an element enters the viewport.

  The hidden state is applied here, in JS, rather than in the stylesheet. If
  this directive never runs — script blocked, IntersectionObserver missing,
  a bundle that failed — nothing was ever hidden and the page reads normally.
  Declaring the hidden state in CSS is how scroll animation ends up shipping a
  blank page to the one visitor whose browser did not cooperate.

  Usage: v-reveal, or v-reveal="120" to delay by 120ms for a stagger.
*/
const OPTIONS = { threshold: 0.12, rootMargin: "0px 0px -8% 0px" };

export const reveal = {
  mounted(el, binding) {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") return;

    const delay = Number(binding.value) || 0;
    if (delay) el.style.setProperty("--reveal-delay", `${delay}ms`);
    el.classList.add("reveal-ready");

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        // `isIntersecting` alone is not enough. A fast scroll — a wheel jump,
        // a flung touch, or restoring a scroll position — can carry an element
        // from below the viewport to above it between two observation frames,
        // and the observer then never reports it as intersecting at all. Those
        // elements stay at opacity 0 forever, which is exactly what a blank
        // mid-page section is. Anything already above the fold has been
        // scrolled past, so reveal it too.
        const passed = entry.boundingClientRect.bottom < 0;
        if (!entry.isIntersecting && !passed) continue;

        entry.target.classList.remove("reveal-ready");
        entry.target.classList.add("reveal-in");
        // One-shot: re-animating on the way back up is the tell of a site
        // that is animating for its own sake.
        observer.unobserve(entry.target);
      }
    }, OPTIONS);

    observer.observe(el);
    el._revealObserver = observer;
  },

  unmounted(el) {
    el._revealObserver?.disconnect();
    delete el._revealObserver;
  },
};
