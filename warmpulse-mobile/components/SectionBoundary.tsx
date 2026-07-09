import { Component, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { wp, fonts } from '../theme/tokens';

/**
 * Catches render errors inside a section so a single bad screen shows a
 * recoverable message instead of crashing the whole app ("keeps stopping").
 * `resetKey` (the active section key) clears the error when the user navigates.
 */
type Props = { children: ReactNode; resetKey: string };
type State = { error: Error | null; key: string };

export class SectionBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Navigating to a different section clears any prior error.
    if (props.resetKey !== state.key) return { error: null, key: props.resetKey };
    return null;
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.center}>
          <Text style={styles.title}>This screen hit a snag</Text>
          <Text style={styles.msg}>Something went wrong rendering this section.</Text>
          <Pressable onPress={() => this.setState({ error: null })} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  title: { color: wp.text, fontSize: 17, fontFamily: fonts.sansBold },
  msg: { color: wp.textDim, fontSize: 13.5, fontFamily: fonts.sans, textAlign: 'center', lineHeight: 19 },
  retry: { marginTop: 6, borderWidth: 1, borderColor: wp.border, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 9 },
  retryText: { color: wp.accent, fontSize: 13, fontFamily: fonts.sansSemibold },
});
