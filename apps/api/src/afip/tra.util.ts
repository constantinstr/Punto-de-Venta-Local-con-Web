// LoginTicketRequest (TRA) del WSAA — ver docs/afip.md §1. La ventana de
// 10 minutos antes/después es la que documenta AFIP como margen seguro
// contra desfasaje de reloj entre el cliente y sus servidores.
export function buildTraXml(service = 'wsfe', now: Date = new Date()): string {
  const generationTime = new Date(now.getTime() - 10 * 60 * 1000);
  const expirationTime = new Date(now.getTime() + 10 * 60 * 1000);
  const uniqueId = Math.floor(now.getTime() / 1000);

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<loginTicketRequest version="1.0">\n' +
    '  <header>\n' +
    `    <uniqueId>${uniqueId}</uniqueId>\n` +
    `    <generationTime>${generationTime.toISOString()}</generationTime>\n` +
    `    <expirationTime>${expirationTime.toISOString()}</expirationTime>\n` +
    '  </header>\n' +
    `  <service>${service}</service>\n` +
    '</loginTicketRequest>'
  );
}
