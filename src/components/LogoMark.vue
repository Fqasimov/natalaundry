<script setup>
/*
  The brand mark as vector rather than the 445 KB PNG the app ships.

  Redrawn from assets/images/nata-logo.png: a blue disc, a white teardrop, and
  a pale crescent inside the drop's lower left. At ~2 KB it is sharp at any
  size, recolourable, and — the reason it exists — animatable, which a raster
  logo is not.

  Two modes:

  * default — disc, drop and highlight. Used in the header and footer, where
    the drop needs the disc behind it to be visible at all on a light page.
  * `bare`  — the white drop alone, no disc. Used by the loader, which supplies
    its own blue field, so a disc there would just be a circle drawn on top of
    a circle.

  `animate` drives the loader: the drop itself rises into place and liquid
  bands travel through it. It animates the mark, not the space around it.
*/
defineProps({
  size: { type: Number, default: 40 },
  animate: { type: Boolean, default: false },
  bare: { type: Boolean, default: false },
});

// Unique per instance: two SVGs on one page sharing a gradient or clip id
// means the second silently inherits the first's.
const uid = Math.random().toString(36).slice(2, 8);
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
      <linearGradient :id="`disc-${uid}`" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stop-color="#3D8FF2" />
        <stop offset="1" stop-color="#1A5FD0" />
      </linearGradient>

      <!-- Everything liquid is clipped to the drop, so the bands travel
           *through* the shape instead of sliding past it. -->
      <clipPath :id="`drop-${uid}`">
        <path d="M50 17 C50 17 77 51 77 64 A27 27 0 1 1 23 64 C23 51 50 17 50 17 Z" />
      </clipPath>

      <!--
        Blur in user units, not CSS pixels, so the softness scales with the
        mark instead of being tuned for one size. Hard-edged bands read as
        stripes painted on the drop; blurred, they read as light moving
        through it.
      -->
      <filter :id="`soft-${uid}`" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3.4" />
      </filter>
    </defs>

    <circle v-if="!bare" cx="50" cy="50" r="50" :fill="`url(#disc-${uid})`" />

    <g class="drop">
      <!-- Teardrop: apex at the top, a true semicircle at the bottom. -->
      <path
        d="M50 17 C50 17 77 51 77 64 A27 27 0 1 1 23 64 C23 51 50 17 50 17 Z"
        fill="#FFFFFF"
      />

      <g :clip-path="`url(#drop-${uid})`">
        <!--
          The ripple the generated clip had: soft horizontal bands crossing the
          drop, as if its surface were settling. Drawn as wide, very flat
          ellipses rather than wave paths — at this size the difference is
          invisible and the ellipses cost nothing to animate.
        -->
        <g class="waves" :filter="`url(#soft-${uid})`">
          <ellipse cx="50" cy="30" rx="48" ry="4.5" fill="#9DC0F2" opacity="0.62" />
          <ellipse cx="50" cy="56" rx="48" ry="3.6" fill="#9DC0F2" opacity="0.45" />
          <ellipse cx="50" cy="82" rx="48" ry="5" fill="#9DC0F2" opacity="0.58" />
        </g>

        <!-- The inner highlight, a crescent inside the lower left. -->
        <path
          class="glint"
          d="M41 48 C33 57 32 68 37 76 C39 79 43 80 45 78 C47 76 46 73 44 70 C40 64 40 56 43 51 C44 49 43 47 41 48 Z"
          fill="#B9D2F7"
        />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.mark {
  display: block;
  overflow: visible;
}

/* Static everywhere except the loader — a logo that moves in the header is a
   logo nobody can read. */
.waves {
  opacity: 0;
}

.mark--animate .drop {
  transform-origin: 50px 58px;
  animation: drop-settle 3.4s var(--spring) infinite;
}

.mark--animate .waves {
  opacity: 1;
  animation: wave-rise 3.4s linear infinite;
}

.mark--animate .glint {
  animation: glint-breathe 3.4s var(--ease) infinite;
}

/*
  The drop arrives and settles. It is the mark itself moving — rising, landing,
  wobbling as a liquid would — rather than something falling onto it.
*/
@keyframes drop-settle {
  0% {
    transform: translateY(20px) scale(0.72);
    opacity: 0;
  }
  18% {
    opacity: 1;
  }
  34% {
    transform: translateY(0) scale(1.04);
  }
  /* Squash, then the counter-stretch. Without the second beat it reads as a
     shape that stopped, not a liquid that landed. */
  46% {
    transform: translateY(1px) scaleX(1.07) scaleY(0.93);
  }
  58% {
    transform: translateY(0) scaleX(0.975) scaleY(1.03);
  }
  70% {
    transform: scale(1);
  }
  88% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: translateY(6px) scale(0.94);
    opacity: 0;
  }
}

/* The bands travel the height of the drop exactly once, so the loop has no
   seam: band 3 lands where band 2 began. */
@keyframes wave-rise {
  0%,
  22% {
    transform: translateY(0);
    opacity: 0;
  }
  32% {
    opacity: 1;
  }
  84% {
    opacity: 1;
  }
  100% {
    transform: translateY(-26px);
    opacity: 0;
  }
}

@keyframes glint-breathe {
  0%,
  30% {
    opacity: 0;
  }
  52% {
    opacity: 1;
  }
  88% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mark--animate .drop,
  .mark--animate .waves,
  .mark--animate .glint {
    animation: none;
  }
  .mark--animate .waves {
    opacity: 0;
  }
}
</style>
