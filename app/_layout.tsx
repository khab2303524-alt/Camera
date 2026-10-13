import { DarkTheme, DefaultTheme, ThemeProvider, useTheme } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

// Đăng ký handler hiển thị thông báo ngay khi app khởi động (side-effect import),
// để push vẫn hiện khi app đang mở dù người dùng chưa vào tab Cài đặt.
import '@/lib/pushNotifications';

import { AppDialogHost } from '@/components/AppDialog';
import { TemperatureAlertMonitor } from '@/components/TemperatureAlertMonitor';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export const unstable_settings = {
  anchor: '(tabs)',
};

function AuthGuard() {
  const { user, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { colors } = useTheme();
  console.log("[guard]", { initializing, user: !!user, seg: segments[0] });
  useEffect(() => {
    if (initializing) return;
    const inLogin = segments[0] === 'login';
    if (!user && !inLogin) router.replace('/login');
    else if (user && inLogin) router.replace('/(tabs)');
  }, [user, initializing, segments]);

  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      {initializing && (
        <View style={[styles.overlay, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" />
        </View>
      )}
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <AuthGuard />
          <TemperatureAlertMonitor />
        </AuthProvider>
        <StatusBar style="auto" />
        <AppDialogHost />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
