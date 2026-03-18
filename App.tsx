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
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Location"
            screenOptions={{
              headerStyle: {
                backgroundColor:   'rgba(5,4,0,0.95)',
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(245,158,11,0.25)',
                elevation:         0,
              },
              headerTintColor:  '#f59e0b',
              headerTitleStyle: {
                fontFamily:    'monospace',
                fontWeight:    '700',
                fontSize:      13,
                letterSpacing: 3,
                color:         '#f59e0b',
              },
              headerTransparent: false,
              cardStyle:         { backgroundColor: 'transparent' },
            }}
          >
            <Stack.Screen
              name="Location"
              component={LocationScreen}
              options={{ title: 'WAYFINDER · F9' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
