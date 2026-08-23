import type { ImageSourcePropType } from "react-native";

/**
 * The rendered gift-box still, if one has been added to the repo.
 *
 * Left null on purpose. The image is generated in Higgsfield and lives on
 * their CDN, which this project's build cannot reach, so the file has to be
 * downloaded and committed by hand. A `require` pointing at a file that is not
 * there is a build error, not a blank image — so the switch is explicit.
 *
 * To use it:
 *   1. Save the render to `assets/images/gift-box.png`
 *   2. Replace the line below with:
 *        export const GIFT_BOX_IMAGE: ImageSourcePropType | null =
 *          require("../assets/images/gift-box.png");
 *
 * Until then the gift screens draw the box with <GiftBoxAnimation />, which
 * needs no asset at all. The reveal itself always uses the drawn box: it has
 * to animate against the prize the server actually drew, which a fixed clip
 * cannot do.
 */
export const GIFT_BOX_IMAGE: ImageSourcePropType | null = null;
