import { useEffect } from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { colors } from "@/theme/tokens";

/**
 * The gift box, drawn and animated rather than played from a video.
 *
 * Built from gradient-filled views instead of a rendered clip: it is a handful
 * of kilobytes rather than megabytes, it stays sharp at any size, it works
 * offline, and the reveal can be timed to the network call that draws the
 * prize instead of hoping a fixed-length video lines up. The blue box with a
 * matching blue satin ribbon follows the reference.
 *
 * Three beats: the box rocks in anticipation, the lid lifts and tips back, and
 * the light behind it blooms as the prize rises out.
 */
type Props = {
  /** Flip to true to open. The box rocks until then. */
  opening: boolean;
  /** Fires once the lid is clear and the prize should be readable. */
  onRevealed?: () => void;
  size?: number;
  /** Rendered inside the box, rising out as the lid opens. */
  children?: React.ReactNode;
};

const BLUE_LIGHT = "#5AADEC";
const BLUE = "#1E77E5";
const BLUE_DEEP = "#0E4FA3";
const RIBBON = "#0B3D82";
const RIBBON_SHEEN = "#4C8FE8";

/**
 * Disc sizes for the fake radial glow, largest first.
 *
 * Many faint discs rather than a few strong ones: with a handful the steps
 * read as concentric rings, and the point is a soft bloom.
 */
const GLOW_STOPS = Array.from({ length: 18 }, (_, i) => 1 - i * 0.052);

export function GiftBoxAnimation({ opening, onRevealed, size = 190, children }: Props) {
  const rock = useSharedValue(0);
  const lift = useSharedValue(0);
  const bloom = useSharedValue(0);
  const prize = useSharedValue(0);

  useEffect(() => {
    if (opening) {
      // One sharp wind-up, then the lid goes.
      cancelAnimation(rock);
      rock.value = withSequence(
        withTiming(1.6, { duration: 90 }),
        withTiming(-1.6, { duration: 90 }),
        withTiming(1.2, { duration: 80 }),
        withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) }),
      );
      lift.value = withDelay(
        330,
        withTiming(1, { duration: 620, easing: Easing.out(Easing.back(1.4)) }),
      );
      bloom.value = withDelay(330, withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }));
      prize.value = withDelay(
        520,
        withTiming(1, { duration: 520, easing: Easing.out(Easing.back(1.2)) }, (finished) => {
          if (finished && onRevealed) runOnJS(onRevealed)();
        }),
      );
      return;
    }

    // Idle: a slow rock with a double-tick, so it reads as something alive
    // rather than a looping wobble.
    rock.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 620, easing: Easing.inOut(Easing.quad) }),
        withTiming(-1, { duration: 620, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.5, { duration: 180 }),
        withTiming(-0.5, { duration: 180 }),
        withTiming(0, { duration: 900 }),
      ),
      -1,
      false,
    );
    lift.value = withTiming(0, { duration: 200 });
    bloom.value = withTiming(0, { duration: 200 });
    prize.value = withTiming(0, { duration: 200 });

    return () => cancelAnimation(rock);
  }, [opening, onRevealed, rock, lift, bloom, prize]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 700 },
      { rotate: `${rock.value * 2.4}deg` },
      { translateY: Math.abs(rock.value) * -3 },
    ],
  }));

  const lidStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 700 },
      { translateY: -lift.value * size * 0.62 },
      { rotateX: `${lift.value * -58}deg` },
      { rotate: `${rock.value * 3 - lift.value * 9}deg` },
    ],
    opacity: 1 - lift.value * 0.15,
  }));

  const bloomStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + bloom.value * 0.75,
    transform: [{ scale: 0.7 + bloom.value * 0.9 }],
  }));

  const prizeStyle = useAnimatedStyle(() => ({
    opacity: prize.value,
    transform: [
      { translateY: (1 - prize.value) * size * 0.3 },
      { scale: 0.7 + prize.value * 0.3 },
    ],
  }));

  const box: ViewStyle = { width: size, height: size * 0.78 };

  return (
    <View style={[s.stage, { width: size * 1.7, height: size * 1.7 }]}>
      {/* Light behind the box. react-native-web has no radial gradient, so the
          falloff is built from concentric discs — enough of them that the edge
          reads soft rather than as a hard ring. */}
      <Animated.View style={[s.bloom, bloomStyle, { width: size * 1.5, height: size * 1.5 }]}>
        {GLOW_STOPS.map((stop) => (
          <View
            key={stop}
            style={[
              s.bloomRing,
              {
                width: `${stop * 100}%`,
                height: `${stop * 100}%`,
                opacity: 0.035 + (1 - stop) * 0.05,
              },
            ]}
          />
        ))}
      </Animated.View>

      {/* Prize, rising out of the box and sitting behind the front wall. */}
      <Animated.View style={[s.prize, prizeStyle, { bottom: size * 0.95 }]} pointerEvents="box-none">
        {children}
      </Animated.View>

      <Animated.View style={[s.boxWrap, bodyStyle, box]}>
        {/* Lid, hinged at its back edge. Wider than the body, with its own top
            plane, which is what makes a lid read as a lid rather than a stripe. */}
        <Animated.View
          style={[s.lidWrap, lidStyle, { width: size * 1.08, height: size * 0.3 }]}
        >
          {/* Top plane, catching the key light. */}
          <LinearGradient
            colors={["#7CC0F2", BLUE_LIGHT, BLUE]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={[s.lidTop, { height: size * 0.12 }]}
          >
            <View style={[s.ribbonV, { left: size * 0.46, width: size * 0.15 }]}>
              <LinearGradient
                colors={[RIBBON_SHEEN, RIBBON]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </View>
          </LinearGradient>

          {/* Front rim of the lid, in shadow under the top plane. */}
          <LinearGradient
            colors={[BLUE, BLUE_DEEP]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={[s.lid, { height: size * 0.17 }]}
          >
            <View style={[s.ribbonV, { left: size * 0.46, width: size * 0.15 }]}>
              <LinearGradient
                colors={[RIBBON_SHEEN, RIBBON]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </View>
          </LinearGradient>

          {/* Bow: two loops with a hole punched through each, a knot, and two
              tails falling over the lid. */}
          <View style={[s.bow, { top: -size * 0.2, left: size * 0.54 - size * 0.3 }]}>
            <View style={[s.bowLoop, s.bowLeft, { width: size * 0.28, height: size * 0.22 }]}>
              <LinearGradient
                colors={[RIBBON_SHEEN, RIBBON]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.fill}
              />
              <View
                style={[
                  s.bowHole,
                  { width: size * 0.11, height: size * 0.08, borderRadius: size * 0.06 },
                ]}
              />
            </View>
            <View style={[s.bowLoop, s.bowRight, { width: size * 0.28, height: size * 0.22 }]}>
              <LinearGradient
                colors={[RIBBON, RIBBON_SHEEN]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.fill}
              />
              <View
                style={[
                  s.bowHole,
                  { width: size * 0.11, height: size * 0.08, borderRadius: size * 0.06 },
                ]}
              />
            </View>
            <View
              style={[
                s.bowKnot,
                { width: size * 0.12, height: size * 0.12, left: size * 0.24 },
              ]}
            >
              <LinearGradient colors={[RIBBON_SHEEN, RIBBON]} style={s.fill} />
            </View>
          </View>
        </Animated.View>

        {/* Body. */}
        <View style={[s.body, { height: size * 0.52 }]}>
          <LinearGradient
            colors={[BLUE, BLUE_DEEP]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={s.fill}
          />
          {/* Front-left face, a shade darker, to read as a solid volume. */}
          <LinearGradient
            colors={["rgba(255,255,255,0.14)", "rgba(0,0,0,0.18)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[s.ribbonV, { left: size * 0.42, width: size * 0.16 }]}>
            <LinearGradient
              colors={[RIBBON_SHEEN, RIBBON]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        </View>

        {/* Contact shadow. */}
        <View style={[s.shadow, { width: size * 0.86, bottom: -size * 0.05 }]} />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  stage: { alignItems: "center", justifyContent: "center" },
  fill: { ...StyleSheet.absoluteFillObject },

  bloom: { position: "absolute", alignItems: "center", justifyContent: "center" },
  bloomRing: { position: "absolute", borderRadius: 999, backgroundColor: BLUE_LIGHT },

  boxWrap: { alignItems: "center", justifyContent: "flex-end" },
  lidWrap: { position: "absolute", top: 0, alignItems: "stretch" },
  lidTop: {
    width: "100%",
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    overflow: "hidden",
  },
  lid: {
    width: "100%",
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    overflow: "hidden",
  },
  body: {
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
    marginTop: 2,
  },
  ribbonV: { position: "absolute", top: 0, bottom: 0 },

  bow: { position: "absolute", alignItems: "center", flexDirection: "row" },
  bowLoop: { borderRadius: 999, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  bowHole: { backgroundColor: "#0B2A55", opacity: 0.85 },
  bowLeft: { transform: [{ rotate: "-26deg" }] },
  bowRight: { transform: [{ rotate: "26deg" }] },
  bowKnot: { position: "absolute", borderRadius: 999, overflow: "hidden" },

  prize: { position: "absolute", alignItems: "center", zIndex: 1 },
  shadow: {
    position: "absolute",
    height: 12,
    borderRadius: 999,
    backgroundColor: "rgba(4,20,45,0.45)",
  },
});
