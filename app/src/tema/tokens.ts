// Tokens de diseño portados de web/src/app.css
import { colorCategoria, COLOR_OTRAS, type Modo } from '@/lib/categorias';

const claro = {
	fondo: '#f4f5f1',
	superficie: '#ffffff',
	superficie2: '#f0f1ec',
	superficie3: '#e6e8e2',
	borde: '#e2e4dd',
	bordeFuerte: '#cfd2ca',
	texto: '#131715',
	texto2: '#474e4a',
	texto3: '#646b67',
	acento: '#0f766e',
	acentoTexto: '#ffffff',
	acentoSuave: '#dff1ed',
	acentoTinta: '#0b5e58',
	positivo: '#15803d',
	positivoSuave: '#e3f4e8',
	negativo: '#c0271e',
	negativoSuave: '#fde8e6',
	aviso: '#9a5b00',
	avisoBarra: '#d99a00',
	avisoSuave: '#fdf1d6',
	progresoOk: '#1f9d55',
	progresoAlerta: '#d99a00',
	progresoExceso: '#d63a2f',
	grilla: '#e8eae4',
	velo: 'rgba(0,0,0,0.3)',
	series: ['#2a78d6', '#eb6834', '#1baf7a', '#4a3aa7', '#e87ba4', '#008300', '#eda100', '#e34948'],
	sombra: '0px 1px 2px rgba(19,23,21,0.04), 0px 2px 8px rgba(19,23,21,0.04)',
	sombraAlta: '0px 8px 30px rgba(19,23,21,0.12)'
};

export type Colores = typeof claro;

const oscuro: Colores = {
	fondo: '#0d100f',
	superficie: '#151918',
	superficie2: '#1b201e',
	superficie3: '#242a27',
	borde: '#252b28',
	bordeFuerte: '#343b37',
	texto: '#eef1ef',
	texto2: '#b9c0bc',
	texto3: '#8f9893',
	acento: '#2dd4bf',
	acentoTexto: '#04201d',
	acentoSuave: '#0f2e2a',
	acentoTinta: '#5eead4',
	positivo: '#4ade80',
	positivoSuave: '#12291b',
	negativo: '#ff8a80',
	negativoSuave: '#3a1715',
	aviso: '#fbbf24',
	avisoBarra: '#e0a91c',
	avisoSuave: '#33270c',
	progresoOk: '#34c26f',
	progresoAlerta: '#e0a91c',
	progresoExceso: '#f0645a',
	grilla: '#232926',
	velo: 'rgba(0,0,0,0.55)',
	series: ['#3987e5', '#d95926', '#199e70', '#9085e9', '#d55181', '#008300', '#c98500', '#e66767'],
	sombra: '0px 1px 2px rgba(0,0,0,0.3)',
	sombraAlta: '0px 10px 40px rgba(0,0,0,0.5)'
};

export const espacio = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24 };
export const radio = { tarjeta: 16, s: 10, control: 11, boton: 12, pildora: 999 };
export const tipo = {
	h1: 25.6,
	h2: 16.3,
	base: 16,
	cuerpo: 14.4,
	chico: 13.6,
	etiqueta: 12.5,
	mini: 11.5,
	cifra: 24,
	cifraMedia: 18.4
};
export const NUMEROS = ['tabular-nums'] as ['tabular-nums'];

export interface Tema {
	modo: Modo;
	c: Colores;
	cat: (id: string) => string;
	otras: string;
}

function crear(modo: Modo, c: Colores): Tema {
	return { modo, c, cat: (id) => colorCategoria(id, modo), otras: COLOR_OTRAS[modo] };
}

export const TEMAS: Record<Modo, Tema> = { claro: crear('claro', claro), oscuro: crear('oscuro', oscuro) };

// Mezcla dos colores hex como color-mix(in srgb, a p%, b)
export function mezclar(a: string, b: string, p: number): string {
	const n = (h: string) => {
		const x = h.replace('#', '');
		return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
	};
	const [ra, ga, ba] = n(a);
	const [rb, gb, bb] = n(b);
	const m = (x: number, y: number) => Math.round(x * (p / 100) + y * (1 - p / 100)).toString(16).padStart(2, '0');
	return `#${m(ra, rb)}${m(ga, gb)}${m(ba, bb)}`;
}

export function conAlfa(hex: string, alfa: number): string {
	const x = hex.replace('#', '');
	const [r, g, b] = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
	return `rgba(${r},${g},${b},${alfa})`;
}
