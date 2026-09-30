import { StyleSheet } from 'react-native';
import { NUMEROS, radio, tipo, type Tema } from './tokens';

// Clases compartidas de app.css (tarjeta, etiqueta, cifra, tenue…)
export function comunes({ c }: Tema) {
	return StyleSheet.create({
		tarjeta: {
			backgroundColor: c.superficie,
			borderWidth: 1,
			borderColor: c.borde,
			borderRadius: radio.tarjeta,
			boxShadow: c.sombra,
			padding: 18,
			minWidth: 0
		},
		tarjetaCabecera: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
		cabeceraTexto: { flex: 1, minWidth: 0 },
		h1: { fontSize: tipo.h1, fontWeight: '700', letterSpacing: -0.64, color: c.texto },
		h2: { fontSize: tipo.h2, fontWeight: '600', letterSpacing: -0.16, color: c.texto },
		texto: { fontSize: tipo.base, color: c.texto, lineHeight: 23 },
		cuerpo: { fontSize: tipo.cuerpo, color: c.texto2, lineHeight: 20 },
		etiqueta: { fontSize: tipo.etiqueta, fontWeight: '500', color: c.texto3, letterSpacing: 0.12 },
		cifra: { fontSize: tipo.cifra, fontWeight: '700', letterSpacing: -0.72, fontVariant: NUMEROS, color: c.texto, lineHeight: 28 },
		secundario: { color: c.texto2 },
		tenue: { color: c.texto3, fontSize: tipo.chico, lineHeight: 19 },
		chico: { fontSize: 12.2, lineHeight: 17 },
		num: { fontVariant: NUMEROS },
		fuerte: { fontWeight: '600' },
		positivo: { color: c.positivo },
		negativo: { color: c.negativo },
		enlace: { color: c.acentoTinta, fontWeight: '500' },
		enlaceCabecera: { color: c.acentoTinta, fontSize: 13.6, fontWeight: '500' },
		punto: { width: 10, height: 10, borderRadius: 3, flexShrink: 0 },
		fila: { flexDirection: 'row', alignItems: 'center' },
		separador: { borderBottomWidth: 1, borderBottomColor: c.borde },
		lista: { gap: 14 }
	});
}
