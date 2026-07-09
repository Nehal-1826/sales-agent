import { View } from 'react-native';
import Svg, { Polyline, Polygon, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming, Easing } from 'react-native-reanimated';
import { wp } from '../theme/tokens';
import { hexA } from './Glass';

const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);

/** Sparkline — polyline scaled to data min/max, optional gradient area fill. Mobile-optimized with smooth animations. */
export function Sparkline({
  data,
  color = wp.accent,
  height = 70,
  fill = true,
  strokeWidth = 2.5
}: {
  data: number[];
  color?: string;
  height?: number;
  fill?: boolean;
  strokeWidth?: number;
}) {
  const W = 300;
  const H = height;
  // Animation for line drawing effect
  const progress = useSharedValue(0);

  // Coerce to finite numbers — a single NaN/undefined produces "NaN" SVG
  // coordinates which hard-crash react-native-svg on Android.
  const clean = (Array.isArray(data) ? data : []).filter((n) => Number.isFinite(n));
  if (clean.length === 0) {
    return <View style={{ width: '100%', height }} />;
  }
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const stepX = W / (clean.length - 1 || 1);
  const pts = clean.map((v, i) => {
    const x = i * stepX;
    const y = H - 6 - ((v - min) / span) * (H - 12);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const areaPts = `0,${H} ${pts.join(' ')} ${W},${H}`;

  // Animate line drawing on mount
  progress.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) });

  const animatedProps = useAnimatedProps(() => ({
    points: pts.join(' '),
    opacity: progress.value,
  }));

  return (
    <View style={{ width: '100%', height }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.28" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {fill ? <Polygon points={areaPts} fill="url(#spark-fill)" /> : null}
        <AnimatedPolyline
          animatedProps={animatedProps}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

// hexA re-exported for callers that tint sparklines.
export { hexA };
