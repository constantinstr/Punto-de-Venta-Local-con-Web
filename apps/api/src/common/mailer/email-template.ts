// Plantilla HTML compartida para los mails transaccionales (código de la
// demo, recuperar contraseña, y los que se sumen después). Estilos inline a
// propósito: Gmail/Outlook/etc. ignoran <style>/<link> en el <head> de un
// mail, así que cualquier CSS que no sea inline simplemente no se aplica.
//
// Nada de fuentes externas ni imágenes de fondo — misma lógica minimalista
// que el resto del proyecto, llevada al mundo de los clientes de mail (que
// son mucho más restrictivos que un browser real).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderBrandedEmail(params: {
  heading: string;
  bodyHtml: string; // ya viene armado como HTML (permite <strong>, bloques de código, etc.)
  footNote: string; // ej. "Vence en 10 minutos." — se muestra destacado, arriba del pie legal
}): string {
  const appUrl = process.env.APP_PUBLIC_URL ?? 'https://vendenube.com.ar';
  const logoUrl = `${appUrl}/icon.png`;

  return `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0; padding:0; background-color:#f3f1f8; font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f1f8; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden;">
            <tr>
              <td align="center" style="background-color:#6750a4; padding:28px 24px;">
                <img src="${logoUrl}" alt="Vende Nube" width="48" height="48" style="display:block; border-radius:10px;" />
                <p style="margin:12px 0 0; color:#ffffff; font-size:18px; font-weight:bold;">Vende Nube</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px;">
                <h1 style="margin:0 0 16px; font-size:20px; color:#1c1b1f;">${escapeHtml(params.heading)}</h1>
                <div style="font-size:15px; line-height:1.6; color:#3a3841;">${params.bodyHtml}</div>
                <p style="margin:20px 0 0; padding:12px 14px; background-color:#f3f1f8; border-radius:8px; font-size:13px; color:#6750a4; font-weight:bold;">
                  ⏱ ${escapeHtml(params.footNote)}
                </p>
                <p style="margin:20px 0 0; font-size:13px; color:#79747e;">
                  Si no pediste esto, ignorá este mensaje — no se hizo ningún cambio en tu cuenta.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px; background-color:#f7f6fb; text-align:center;">
                <p style="margin:0; font-size:12px; color:#938f99;">Vende Nube · vendenube.com.ar</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
