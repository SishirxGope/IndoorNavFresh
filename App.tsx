/**
 * App.tsx — Root entry point for IndoorNav.
 * Wraps navigation in GestureHandlerRootView (required by react-native-gesture-handler)
 * and SafeAreaProvider.
 */

import React from 'react';
import { StatusBar } from 'react-native';

import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LocationScreen from './src/screens/LocationScreen';

export type RootStackParamList = {
  Location: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export default function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#f1f5f9" />
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Location"
            screenOptions={{
              headerStyle:      { backgroundColor: '#1e293b' },
              headerTintColor:  '#f8fafc',
              headerTitleStyle: { fontWeight: '700', fontSize: 16 },
            }}
          >
            <Stack.Screen
              name="Location"
              component={LocationScreen}
              options={{ title: 'Indoor Navigation' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
