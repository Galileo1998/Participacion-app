// App.js
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { initDB } from './src/database/db';

// Importamos TODAS las pantallas
import ActivitiesScreen from './src/screens/ActivitiesScreen';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import PeriodsScreen from './src/screens/PeriodsScreen'; // <--- 1. IMPORTAR
import StudentListScreen from './src/screens/StudentListScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  
  useEffect(() => {
    initDB().then(() => console.log("DB Iniciada"));
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login">
        
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        
        {/* 2. REGISTRAR LA PANTALLA PERIODS */}
        <Stack.Screen 
          name="Periods" 
          component={PeriodsScreen} 
          options={{ headerShown: false }} 
        />

        <Stack.Screen name="Activities" component={ActivitiesScreen} options={{ headerShown: false }} />
        <Stack.Screen name="StudentList" component={StudentListScreen} options={{ headerShown: false }} />
        
      </Stack.Navigator>
    </NavigationContainer>
  );
}