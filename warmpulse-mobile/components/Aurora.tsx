import { View, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect, Circle } from 'react-native-svg';
import { wp } from '../theme/tokens';

/** Static atmospheric glow — RN port of the hero's blurred aurora blobs.
 *  Wrapped in a pointerEvents="none" View so the full-screen SVG never
 *  intercepts touches (otherwise scroll + buttons stop responding). */
export function Aurora() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="topGlow" cx="50%" cy="0%" rx="70%" ry="45%">
            <Stop offset="0%" stopColor={wp.accent} stopOpacity="0.28" />
            <Stop offset="55%" stopColor={wp.accent} stopOpacity="0.05" />
            <Stop offset="100%" stopColor={wp.accent} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="sideGlow" cx="90%" cy="22%" rx="45%" ry="35%">
            <Stop offset="0%" stopColor={wp.accent2} stopOpacity="0.16" />
            <Stop offset="100%" stopColor={wp.accent2} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#topGlow)" />
        <Circle cx="90%" cy="22%" r="55%" fill="url(#sideGlow)" />
      </Svg>
    </View>
  );
}
