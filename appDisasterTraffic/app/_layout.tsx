import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  setupPushNotifications,
  setupNotificationDeepLink,
} from '@/lib/notifications';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // Khởi tạo push notification khi app start. Không await để không chặn UI.
    setupPushNotifications().catch((e) =>
      console.warn('[layout] push setup error:', e)
    );

    // Lắng nghe khi user tap notification → navigate tới alert tương ứng.
    const sub = setupNotificationDeepLink();
    return () => sub.remove();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
