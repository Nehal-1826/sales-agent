import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, type TextStyle, type StyleProp } from 'react-native';
import { wp } from '../theme/tokens';

/** Gradient-filled text — RN equivalent of the web's `wp-headline-grad`. */
export function GradientText({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  return (
    <MaskedView maskElement={<Text style={style}>{children}</Text>}>
      <LinearGradient colors={[wp.accent, wp.accent2, wp.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <Text style={[style, { opacity: 0 }]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}
