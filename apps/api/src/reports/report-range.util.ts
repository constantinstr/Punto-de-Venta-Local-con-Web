import { BadRequestException } from '@nestjs/common';

export interface DateRange {
  from: Date;
  to: Date;
}

// `to` llega como fecha de calendario en la mayoría de los presets del
// frontend ("Hoy", "Este mes", etc.) — un string de 10 caracteres
// (YYYY-MM-DD) sin componente horario. Sin este ajuste, `new Date(to)`
// cae en la medianoche de ese día y excluye todas las ventas del propio día
// "hasta". Si el string ya trae hora (rango personalizado con datetime), se
// respeta tal cual.
export function parseReportRange(from: string, to: string): DateRange {
  const fromDate = new Date(from);
  const toDate = new Date(to.length === 10 ? `${to}T23:59:59.999` : to);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new BadRequestException('Rango de fechas inválido');
  }
  if (fromDate > toDate) {
    throw new BadRequestException('"from" no puede ser posterior a "to"');
  }

  return { from: fromDate, to: toDate };
}
