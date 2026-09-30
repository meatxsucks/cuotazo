export type { FuenteDatos } from './tipos';

// Ya existe un presupuesto del mismo tipo, categoría y vigencia
export class ErrorDuplicado extends Error {}

// La tabla o columna todavía no existe en la base (migración pendiente)
export class ErrorNoDisponible extends Error {}
