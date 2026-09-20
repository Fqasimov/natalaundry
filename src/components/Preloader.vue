<script setup>
import { onMounted, ref } from "vue";
import LogoMark from "./LogoMark.vue";

/*
  The opening loader.

  Layered deliberately. The SVG mark animates from the first frame at no
  network cost; the generated video fades in over it only once it can actually
  play. That ordering is what keeps a *loading* screen from being the slowest
  thing on the page — and it means the site degrades correctly on a phone that
  blocks autoplay, on a slow connection, and if loader.mp4 is ever removed.

  The video is a Higgsfield render of the mark. Deleting public/loader.mp4 is a
  supported way to turn it off: the SVG underneath is a complete animation, not
  a placeholder.
*/
const done = ref(false);
const videoReady = ref(false);
const video = ref(null);

// A minimum on screen, so the loader does not flash-and-vanish on a fast
// connection, and a hard ceiling, so nobody ever waits on it.
const MIN_MS = 1500;
const MAX_MS = 3200;

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

function onCanPlay() {
  videoReady.value = true;
  // Muted autoplay is allowed everywhere; a rejected promise here just means
  // the SVG keeps playing, which is a perfectly good outcome.
  video.value?.play?.().catch(() => {});
}

// `canplaythrough` can fire before Vue attaches the listener — a cached video
// is often already buffered by the time the component mounts, and the event is
// then missed entirely, leaving the clip permanently hidden. readyState is the
// state rather than the notification, so check it directly as well.
onMounted(() => {
  if (video.value && video.value.readyState >= 3) onCanPlay();
});
</script>

<template>
  <Transition name="veil">
    <div v-if="!done" class="veil" aria-hidden="true">
      <div class="stage">
        <LogoMark :size="150" animate />
        <video
          ref="video"
          class="clip"
          :class="{ 'clip--in': videoReady }"
          src="/loader.mp4"
          muted
          playsinline
          autoplay
          preload="auto"
          @canplaythrough="onCanPlay"
          @loadeddata="onCanPlay"
        />
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
  gap: 40px;
  background: var(--surface);
}

.stage {
  position: relative;
  width: 150px;
  height: 150px;
  display: grid;
  place-items: center;
}

/*
  The render cannot carry alpha, so it is masked to a circle over the SVG disc.

  Two corrections for what the model actually produced rather than what it was
  asked for. It rendered the mark on BLACK despite the prompt asking for white,
  and the disc's edge came out faceted and blocky. `scale(1.14)` pushes both
  past the mask: the disc fills the circle, and the black surround and the ragged
  rim are cropped away instead of showing as a dark ring.

  The SVG sits underneath at full opacity, so even mid-fade there is a clean
  mark on screen rather than a gap.
*/
.clip {
  position: absolute;
  inset: 0;
  width: 150px;
  height: 150px;
  object-fit: cover;
  border-radius: 50%;
  transform: scale(1.14);
  opacity: 0;
  transition: opacity 0.5s var(--ease);
}

.clip--in {
  opacity: 1;
}

.bar {
  width: 128px;
  height: 2px;
  border-radius: 2px;
  background: var(--alice);
  overflow: hidden;
}

.bar span {
  display: block;
  height: 100%;
  width: 40%;
  border-radius: inherit;
  background: var(--moonstone);
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
