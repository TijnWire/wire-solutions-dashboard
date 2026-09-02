// Wire Solutions huisstijl-mail voor nieuwe inloggegevens (HTML + platte tekst).
// E-mail-veilig opgemaakt: tabellen + inline-styles (geen externe CSS), werkt in Outlook, Gmail en Apple Mail.
// De HTML-versie wordt gebruikt zodra server-side verzending (Resend) actief is; de platte tekst dient
// als terugval (mailto) en als "text"-variant van de mail.

const BRAND = "#ea580c";      // brand-600
const BRAND_DONKER = "#c2410c"; // brand-700
const BRAND_LICHT = "#fff7ed";  // brand-50
const INK = "#1e293b";        // ink-800
const INK_ZACHT = "#64748b";  // ink-500
const RAND = "#e2e8f0";       // ink-200

export type WachtwoordMailData = {
  naam: string;
  email: string;
  wachtwoord: string;
  url: string;
  bedrijfsnaam: string;
  afzender: string;      // naam van de beheerder die het opstuurt
  logoUrl?: string;      // absolute URL naar het logo (bv. https://.../wire-logo.png)
  telefoon?: string;     // optioneel supportnummer
};

export function wachtwoordMailOnderwerp(d: WachtwoordMailData): string {
  return `Je inloggegevens voor het ${d.bedrijfsnaam} dashboard`;
}

// ── Nette platte-tekst-variant (terugval / text-part) ──
export function wachtwoordMailTekst(d: WachtwoordMailData): string {
  const lijn = "═══════════════════════════════════";
  return [
    lijn,
    `  ${d.bedrijfsnaam.toUpperCase()} · DASHBOARD-TOEGANG`,
    lijn,
    "",
    `Hoi ${d.naam},`,
    "",
    `Er is een nieuw wachtwoord voor je klaargezet voor het ${d.bedrijfsnaam} dashboard.`,
    "Met de onderstaande gegevens kun je direct inloggen.",
    "",
    "  ┌─────────────────────────────────",
    "  │  JOUW INLOGGEGEVENS",
    "  ├─────────────────────────────────",
    `  │  Website      : ${d.url}`,
    `  │  E-mailadres  : ${d.email}`,
    `  │  Wachtwoord   : ${d.wachtwoord}`,
    "  └─────────────────────────────────",
    "",
    "▸ Het wachtwoord werkt meteen — op elk apparaat.",
    "▸ Wijzig het na je eerste login naar iets persoonlijks",
    "  (Instellingen ▸ Wachtwoord wijzigen).",
    "▸ Deel dit wachtwoord met niemand.",
    "",
    d.telefoon ? `Lukt het inloggen niet? Bel ${d.telefoon} of stuur een bericht terug.` : "Lukt het inloggen niet? Stuur even een bericht terug, dan helpen we je op weg.",
    "",
    "Met vriendelijke groet,",
    d.afzender,
    d.bedrijfsnaam,
    "",
    lijn,
    `Deze mail is automatisch opgesteld vanuit het ${d.bedrijfsnaam} dashboard.`,
    lijn,
  ].join("\n");
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── Grafische HTML-variant in Wire Solutions-huisstijl ──
export function wachtwoordMailHtml(d: WachtwoordMailData): string {
  const naam = esc(d.naam);
  const email = esc(d.email);
  const ww = esc(d.wachtwoord);
  const url = esc(d.url);
  const bedrijf = esc(d.bedrijfsnaam);
  const afzender = esc(d.afzender);
  const logo = d.logoUrl
    ? `<img src="${esc(d.logoUrl)}" alt="${bedrijf}" width="140" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:140px;" />`
    : `<span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:.3px;">${bedrijf}</span>`;
  const support = d.telefoon
    ? `Lukt het inloggen niet? Bel <a href="tel:${esc(d.telefoon.replace(/\s/g, ""))}" style="color:${BRAND_DONKER};text-decoration:none;font-weight:600;">${esc(d.telefoon)}</a> of stuur deze mail terug.`
    : "Lukt het inloggen niet? Stuur deze mail terug, dan helpen we je op weg.";

  return `<!DOCTYPE html>
<html lang="nl" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${bedrijf} dashboard-toegang</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Je nieuwe inloggegevens voor het ${bedrijf} dashboard.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.1);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <!-- Kop met merkkleur -->
  <tr><td style="background-color:${BRAND};padding:28px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td align="left" valign="middle">${logo}</td>
      <td align="right" valign="middle" style="font-family:inherit;font-size:12px;font-weight:600;color:#ffffff;opacity:.85;letter-spacing:1px;text-transform:uppercase;">Dashboard-toegang</td>
    </tr></table>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:32px 32px 8px 32px;">
    <p style="margin:0 0 4px 0;font-size:16px;color:${INK};font-weight:700;">Hoi ${naam},</p>
    <p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:${INK};">Er is een nieuw wachtwoord voor je klaargezet voor het <strong>${bedrijf}</strong> dashboard. Met de onderstaande gegevens log je direct in.</p>
  </td></tr>

  <!-- Inloggegevens-kaart -->
  <tr><td style="padding:20px 32px 8px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND_LICHT};border:1px solid ${RAND};border-radius:12px;">
      <tr><td style="padding:18px 20px;">
        <p style="margin:0 0 14px 0;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${BRAND_DONKER};">Jouw inloggegevens</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:${INK};">
          <tr>
            <td style="padding:6px 0;color:${INK_ZACHT};width:120px;">Website</td>
            <td style="padding:6px 0;"><a href="${url}" style="color:${BRAND_DONKER};text-decoration:none;font-weight:600;">${url}</a></td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:${INK_ZACHT};">E-mailadres</td>
            <td style="padding:6px 0;font-weight:600;">${email}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:${INK_ZACHT};">Wachtwoord</td>
            <td style="padding:6px 0;">
              <span style="display:inline-block;background-color:#ffffff;border:1px solid ${RAND};border-radius:8px;padding:6px 12px;font-family:'Courier New',Courier,monospace;font-size:15px;font-weight:700;color:${INK};letter-spacing:.5px;">${ww}</span>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Inlogknop -->
  <tr><td style="padding:12px 32px 8px 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="border-radius:10px;background-color:${BRAND};">
        <a href="${url}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">Inloggen op het dashboard →</a>
      </td>
    </tr></table>
  </td></tr>

  <!-- Veiligheidstips -->
  <tr><td style="padding:16px 32px 8px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.6;color:${INK};">
      <tr><td style="padding:3px 0;"><span style="color:${BRAND};font-weight:800;">▸</span>&nbsp; Het wachtwoord werkt meteen, op elk apparaat.</td></tr>
      <tr><td style="padding:3px 0;"><span style="color:${BRAND};font-weight:800;">▸</span>&nbsp; Wijzig het na je eerste login (Instellingen ▸ Wachtwoord wijzigen).</td></tr>
      <tr><td style="padding:3px 0;"><span style="color:${BRAND};font-weight:800;">▸</span>&nbsp; Deel dit wachtwoord met niemand.</td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:14px 32px 4px 32px;">
    <p style="margin:0;font-size:13px;line-height:1.6;color:${INK_ZACHT};">${support}</p>
  </td></tr>

  <!-- Ondertekening -->
  <tr><td style="padding:18px 32px 28px 32px;">
    <p style="margin:0;font-size:14px;color:${INK};">Met vriendelijke groet,</p>
    <p style="margin:2px 0 0 0;font-size:14px;font-weight:700;color:${INK};">${afzender}</p>
    <p style="margin:0;font-size:14px;color:${INK_ZACHT};">${bedrijf}</p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background-color:#f8fafc;border-top:1px solid ${RAND};padding:18px 32px;">
    <p style="margin:0;font-size:11px;line-height:1.5;color:#94a3b8;">Deze mail is automatisch opgesteld vanuit het ${bedrijf} dashboard. Heb je deze niet aangevraagd? Neem dan contact op met je beheerder.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
