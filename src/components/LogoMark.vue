<script setup>
/*
  The brand mark as vector rather than the 445 KB PNG the app ships.

  Redrawn from assets/images/nata-logo.png: a blue disc, a white teardrop, and
  a pale crescent inside the drop's lower left. At 2 KB it is sharp at any size,
  recolourable, and — the reason it exists — animatable, which a raster logo is
  not.

  `animate` drives the loader: the drop falls in, the disc ripples once.
*/
defineProps({
  size: { type: Number, default: 40 },
  animate: { type: Boolean, default: false },
});
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 100 100"
    role="img"
    aria-label="Nata Laundry"
    :class="{ mark: true, 'mark--animate': animate }"
  >
    <defs>
      <linearGradient :id="`disc-${size}`" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stop-color="#3D8FF2" />
        <stop offset="1" stop-color="#1A5FD0" />
      </linearGradient>
      <clipPath :id="`clip-${size}`"><circle cx="50" cy="50" r="50" /></clipPath>
    </defs>

    <circle cx="50" cy="50" r="50" :fill="`url(#disc-${size})`" />

    <!-- The ripple is clipped to the disc so it never escapes the circle. -->
    <g :clip-path="`url(#clip-${size})`">
      <circle class="ripple" cx="50" cy="62" r="6" fill="none" stroke="#fff" stroke-width="1.6" />
    </g>

    <g class="drop">
      <!-- Teardrop: apex at the top, a true semicircle at the bottom. -->
      <path
        d="M50 17 C50 17 77 51 77 64 A27 27 0 1 1 23 64 C23 51 50 17 50 17 Z"
        fill="#FFFFFF"
      />
      <!-- The inner highlight, a crescent inside the lower left. -->
      <path
        d="M41 48 C33 57 32 68 37 76 C39 79 43 80 45 78 C47 76 46 73 44 70 C40 64 40 56 43 51 C44 49 43 47 41 48 Z"
        fill="#B9D2F7"
      />
    </g>
  </svg>
</template>

<style scoped>
.mark {
  display: block;
  overflow: visible;
}

.ripple {
  opacity: 0;
}

/* Static everywhere except the loader — a logo that moves in the header is a
   logo nobody can read. */
.mark--animate .drop {
  animation: drop-fall 2.1s var(--spring) infinite;
  transform-origin: 50px 50px;
}

.mark--animate .ripple {
  animation: ripple-out 2.1s var(--ease) infinite;
}

@keyframes drop-fall {
  0% {
    transform: translateY(-62px) scale(0.82);
    opacity: 0;
  }
  22% {
    opacity: 1;
  }
  42% {
    transform: translateY(0) scale(1);
  }
  /* The squash on landing is what sells it as a liquid rather than a shape
     that simply stopped. */
  50% {
    transform: translateY(2px) scaleX(1.1) scaleY(0.9);
  }
  62% {
    transform: translateY(0) scaleX(0.97) scaleY(1.03);
  }
  74%,
  100% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

@keyframes ripple-out {
  0%,
  46% {
    r: 6;
    opacity: 0;
  }
  54% {
    opacity: 0.55;
  }
  88%,
  100% {
    r: 46;
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mark--animate .drop,
  .mark--animate .ripple {
    animation: none;
  }
}
</style>
