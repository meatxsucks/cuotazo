import AsyncStorage from '@react-native-async-storage/async-storage';

// Móvil: la sesión se guarda en AsyncStorage (expo-secure-store limita cada valor a 2 KB)
export const almacenamiento = AsyncStorage;
