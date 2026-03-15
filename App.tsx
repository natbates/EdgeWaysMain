/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import { StatusBar, StyleSheet, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import HomePage from './src/pages/HomePage';
import { colorScheme } from './src/constants/colorScheme';

const paperTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colorScheme.accent,
    accent: colorScheme.accent,
    background: colorScheme.background,
    surface: colorScheme.surface,
    text: colorScheme.primaryText,
    placeholder: colorScheme.subText,
    backdrop: colorScheme.overlay,
    error: colorScheme.error,
  },
};

// Capture the warning stack trace so we can locate any "Text strings must be rendered" source.
const originalWarn = console.warn;
console.warn = (...args) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('Text strings must be rendered')
  ) {
    console.log('=== STACK TRACE FOR TEXT WARNING ===');
    console.log(new Error('Text warning stack').stack);
  }
  originalWarn(...args);
};

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={paperTheme}>
          <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
          <View
            style={[
              styles.container,
              { backgroundColor: colorScheme.background },
            ]}
          >
            <HomePage />
          </View>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
