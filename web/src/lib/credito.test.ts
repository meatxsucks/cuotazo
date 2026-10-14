import { expect, test } from 'vitest';
import { topeDelCiclo, topeSugerido } from './credito';

const tope = { inicial: 550_000, meta: 300_000, bajada_pct: 10, desde_ciclo: '2026-10-01' };

test('el tope baja 10% por ciclo y no pasa bajo la meta', () => {
	expect(topeDelCiclo(tope, '2026-10-01')).toBe(550_000);
	expect(topeDelCiclo(tope, '2026-11-01')).toBe(495_000);
	expect(topeDelCiclo(tope, '2026-12-01')).toBe(446_000);
	expect(topeDelCiclo(tope, '2027-06-01')).toBe(300_000);
	expect(topeDelCiclo(tope, '2026-09-01')).toBe(550_000);
});

test('línea con meta cero y sin bajada', () => {
	expect(topeDelCiclo({ inicial: 180_000, meta: 0, bajada_pct: 10, desde_ciclo: '2026-10-01' }, '2027-10-01')).toBe(51_000);
	expect(topeDelCiclo({ inicial: 180_000, meta: 0, bajada_pct: 0, desde_ciclo: '2026-10-01' }, '2027-10-01')).toBe(180_000);
});

test('sugerencia: 10% bajo el ciclo anterior', () => {
	expect(topeSugerido(800_000)).toBe(720_000);
	expect(topeSugerido(205_000)).toBe(180_000);
	expect(topeSugerido(0)).toBe(10_000);
});
