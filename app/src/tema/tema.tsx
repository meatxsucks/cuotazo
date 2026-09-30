import { useMemo } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';
import { TEMAS, type Tema } from './tokens';

export function useTema(): Tema {
	return useColorScheme() === 'dark' ? TEMAS.oscuro : TEMAS.claro;
}

// Estilos por tema: la fábrica se define a nivel de módulo y se memoiza por modo
export function useEstilos<T>(fabrica: (t: Tema) => T): T {
	const t = useTema();
	return useMemo(() => fabrica(t), [fabrica, t]);
}

export const ANCHO_LATERAL = 248;

export function useAncho() {
	const { width } = useWindowDimensions();
	const escritorio = width >= 960;
	const contenido = escritorio ? Math.min(1180, width - ANCHO_LATERAL - 80) : width - 32;
	return { ventana: width, escritorio, contenido, ancho720: width >= 720, ancho900: width >= 900 };
}
