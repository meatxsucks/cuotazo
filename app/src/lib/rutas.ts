import { router, useLocalSearchParams } from 'expo-router';
import { mesDeParametro, parametroMes } from './fechas';

// Mes de la URL (?mes=aaaa-mm) y cambio sin recargar la pantalla
export function useParamMes(): [string, (mes: string, extra?: Record<string, string | undefined>) => void] {
	const { mes } = useLocalSearchParams<{ mes?: string }>();
	const valor = mesDeParametro(typeof mes === 'string' ? mes : null);
	return [valor, (m, extra) => router.setParams({ mes: parametroMes(m), ...extra })];
}
