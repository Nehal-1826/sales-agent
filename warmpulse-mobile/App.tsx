import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, BackHandler } from 'react-native';
import { useFonts, Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { wp } from './theme/tokens';
import { Aurora } from './components/Aurora';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { LocaleProvider } from './lib/i18n';
import { NavProvider, useNav } from './nav/nav';
import { AuthProvider, useAuth } from './lib/auth';
import { Login } from './screens/Login';
import { Signup } from './screens/Signup';
import { Onboarding } from './screens/Onboarding';
import { AppShell } from './screens/app/AppShell';
import { UpdatePrompt } from './components/UpdatePrompt';

function Root() {
  const { screen, reset, back } = useNav();
  const { status, user } = useAuth();

  // Android hardware back → pop the nav stack; let the OS exit on the root.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => back());
    return () => sub.remove();
  }, [back]);

  // Restored session on cold start + onboarding check
  useEffect(() => {
    if (status === 'authed') {
      const needsOnboarding = user?.onboarding_status !== 'active';
      if (needsOnboarding && screen === 'app') {
        reset('onboarding');
      } else if (!needsOnboarding && (screen === 'login' || screen === 'signup')) {
        reset('app');
      }
    }
  }, [status, screen, user, reset]);

  return (
    <View style={{ flex: 1, backgroundColor: wp.bg }}>
      <StatusBar style="light" />
      <Aurora />
      {screen === 'login' && <Login />}
      {screen === 'signup' && <Signup />}
      {screen === 'onboarding' && <Onboarding />}
      {screen === 'app' && <AppShell />}
      <UpdatePrompt />
    </View>
  );
}

export default function App() {
  const [loaded] = useFonts({
    Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold,
    JetBrainsMono_500Medium, JetBrainsMono_700Bold,
  });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: wp.bg }} />;
  return (
    <LocaleProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NavProvider>
            <Root />
          </NavProvider>
        </AuthProvider>
      </QueryClientProvider>
    </LocaleProvider>
  );
}
