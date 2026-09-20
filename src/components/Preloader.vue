<script setup>
import { onMounted, ref } from "vue";
import LogoMark from "./LogoMark.vue";

/*
  The opening loader: the brand blue edge to edge, with the white drop alone in
  the middle. No disc — the field *is* the disc, so drawing another circle
  inside it would only put an edge where there should not be one.

  Layered deliberately. The SVG mark animates from the first frame at no
  network cost; the generated clip fades in over it only once it can actually
  play. That ordering is what keeps a *loading* screen from being the slowest
  thing on the page, and it means the site degrades correctly on a phone that
  blocks autoplay, on a slow connection, and if loader.mp4 is ever removed.

  THE GENERATED CLIP IS NOT USED HERE, and that was a judgement made by looking
  at the composite rather than by reasoning about it. public/loader.mp4 is a
  blue disc on black containing its own droplet at its own scale; laid over
  this one it ghosted a second, larger drop around the real mark, and the soft
  mask left a faintly visible square. It made the screen look blurry rather
  than liquid. The effect it was bought for — the ripple travelling through the
  drop — is reproduced in LogoMark.vue instead, where it is sharp at any size
  and costs no bytes.

  The file is kept in public/ rather than deleted: it is the artefact those
  credits paid for, and putting it back is a two-line change.
*/
const done = ref(false);

// A minimum on screen, so the loader does not flash-and-vanish on a fast
// connection, and a hard ceiling, so nobody ever waits on it.
const MIN_MS = 1900;
const MAX_MS = 3400;

onMounted(() => {
  const started = performance.now();
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    const elapsed = performance.now() - started;
    setTimeout(() => (done.value = true), Math.max(0, MIN_MS - elapsed));
  };

  if (document.readyState === "complete") finish();
  else window.addEventListener("load", finish, { once: true });

  // The ceiling is not a fallback, it is the contract: a stalled font or a
  // dead CDN must never hold the page behind a splash.
  setTimeout(finish, MAX_MS);
});
</script>

<template>
  <Transition name="veil">
    <div v-if="!done" class="veil" aria-hidden="true">
      <div class="stage">
        <LogoMark class="glyph" :size="180" animate bare />
      </div>
      <div class="bar"><span /></div>
    </div>
  </Transition>
</template>

<style scoped>
.veil {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 46px;
  /* The mark's own gradient, opened out to fill the screen. Radial rather than
     linear so the brightest point sits behind the drop, which is where the
     disc's highlight was. */
  background:
    radial-gradient(circle at 50% 42%, #4193f5 0%, #2f7ee8 42%, #1a5fd0 100%);
}

.stage {
  position: relative;
  display: grid;
  place-items: center;
}

.glyph {
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 10px 26px rgba(0, 32, 78, 0.22));
}

.bar {
  width: 128px;
  height: 2px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.32);
  overflow: hidden;
}

.bar span {
  display: block;
  height: 100%;
  width: 40%;
  border-radius: inherit;
  background: #fff;
  animation: sweep 1.15s var(--ease) infinite;
}

@keyframes sweep {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(360%);
  }
}

/* Lifts away rather than merely fading — the page underneath is already
   painted, so revealing it reads better than cross-fading to it. */
.veil-leave-active {
  transition:
    opacity 0.6s var(--ease),
    transform 0.8s var(--spring);
}

.veil-leave-to {
  opacity: 0;
  transform: translateY(-14px);
}

@media (prefers-reduced-motion: reduce) {
  .bar span {
    animation: none;
    width: 100%;
  }
  .veil-leave-active {
    transition: opacity 0.2s linear;
  }
  .veil-leave-to {
    transform: none;
  }
}
</style>
