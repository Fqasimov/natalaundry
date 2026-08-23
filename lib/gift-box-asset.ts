import type { ImageSourcePropType } from "react-native";

/**
 * The rendered gift box, generated in Higgsfield and committed here.
 *
 * `GIFT_BOX_REVEAL` is an animated WebP rather than an mp4 on purpose:
 * expo-image already renders animated WebP, so the reveal costs no new native
 * dependency, and at 320px/15fps the whole clip is under 200 KB. It is
 * encoded to play **once** and hold on the final burst — the prize is read
 * against that held frame, so it must not loop back to a closed box.
 */
export const GIFT_BOX_IMAGE: ImageSourcePropType =
  require("../assets/images/gift-box.png");

export const GIFT_BOX_REVEAL: ImageSourcePropType =
  require("../assets/images/gift-box-reveal.webp");

/**
 * When the lid is clear and the light has bloomed, in milliseconds.
 *
 * Measured off the clip: the burst lands about 2.6s in. The prize card fades
 * in on that beat, so the reveal reads as the box handing it over rather than
 * a caption appearing over a video.
 */
export const GIFT_BOX_REVEAL_MS = 2600;
