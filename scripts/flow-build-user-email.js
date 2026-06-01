/**
 * Directus Flow "Run Script" body for the user-facing confirmation email.
 *
 * This file is NOT executed locally or by the app build. It is the source of
 * truth for the `build_user_email` run-script operation;
 * `scripts/setup-contact-user-email.mjs` reads it verbatim and stores it as the
 * operation's `code`. Keeping it as a real file (instead of an inline string)
 * avoids quoting hell and lets it be reviewed/version-controlled.
 *
 * Input:  data.$trigger.payload  (the created contact_submissions row)
 * Output: { html, subject }      -> referenced by the user mail op as
 *         {{ build_user_email.html }} / {{ build_user_email.subject }}
 *
 * The copy is localized to the submitter's `language` (en/de). It thanks the
 * person, restates what they sent, and is rendered with the ura.design theme.
 * All user-provided values are HTML-escaped. Runs in the Directus sandbox; if
 * anything throws it falls back to raw values so the email never fails.
 */
module.exports = function (data) {
  var BRAND = "#FD5825";
  var INK = "#141414";
  var MUTED = "#6b7280";
  var FAINT = "#9ca3af";
  var LINE = "#ececec";
  var FONT_BODY =
    "'Instrument Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  var FONT_DISPLAY = "'Instrument Serif',Georgia,'Times New Roman',serif";

  var p = (data && data.$trigger && data.$trigger.payload) || {};
  var lang = String(p.language || "en").toLowerCase() === "de" ? "de" : "en";

  function esc(v) {
    if (v === null || v === undefined) return "";
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function blank(v) {
    return v === null || v === undefined || String(v).trim() === "";
  }

  function cap(v) {
    var s = String(v || "").trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function formatBerlin(value) {
    try {
      var d = value ? new Date(value) : new Date();
      if (isNaN(d.getTime())) return esc(value);
      var parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Berlin",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZoneName: "short",
      }).formatToParts(d);
      var get = function (type) {
        for (var i = 0; i < parts.length; i++) {
          if (parts[i].type === type) return parts[i].value;
        }
        return "";
      };
      var hh = get("hour");
      if (hh === "24") hh = "00";
      var zone = get("timeZoneName");
      return (
        get("day") +
        "-" +
        get("month") +
        "-" +
        get("year") +
        " " +
        hh +
        ":" +
        get("minute") +
        ":" +
        get("second") +
        (zone ? " " + zone : "")
      );
    } catch (e) {
      return esc(value);
    }
  }

  var T = {
    en: {
      subject: "We’ve received your message — ura.design",
      tag: "Confirmation",
      title: "Thanks, " + (cap(p.first_name) || "there"),
      intro:
        "Thanks for reaching out to ura.design. We’ve received your message and a member of our team will get back to you within 72 hours. For your records, here’s a copy of what you sent:",
      yourMessage: "Your message",
      details: "Your details",
      name: "Name",
      email: "Email",
      phone: "Phone",
      company: "Company",
      website: "Website",
      pref: "Preferred contact",
      when: "Submitted",
      preheader: "We’ve received your message and will be in touch soon.",
      closing: "Talk soon,",
      team: "The ura.design team",
      footnote:
        "This is an automated confirmation. You can reply directly to this email if you’d like to add anything.",
    },
    de: {
      subject: "Wir haben Ihre Nachricht erhalten — ura.design",
      tag: "Bestätigung",
      title: "Danke, " + (cap(p.first_name) || ""),
      intro:
        "Vielen Dank für Ihre Nachricht an ura.design. Wir haben Ihre Anfrage erhalten und ein Mitglied unseres Teams meldet sich innerhalb von 72 Stunden bei Ihnen. Für Ihre Unterlagen finden Sie hier eine Kopie Ihrer Angaben:",
      yourMessage: "Ihre Nachricht",
      details: "Ihre Angaben",
      name: "Name",
      email: "E-Mail",
      phone: "Telefon",
      company: "Unternehmen",
      website: "Website",
      pref: "Bevorzugter Kontakt",
      when: "Gesendet",
      preheader: "Wir haben Ihre Nachricht erhalten und melden uns in Kürze.",
      closing: "Bis bald,",
      team: "Das ura.design Team",
      footnote:
        "Dies ist eine automatische Bestätigung. Sie können direkt auf diese E-Mail antworten, falls Sie etwas ergänzen möchten.",
    },
  };
  var L = T[lang];

  var name = (esc(p.first_name) + " " + esc(p.last_name)).trim() || "—";
  var emailVal = blank(p.email)
    ? "—"
    : '<a href="mailto:' +
      esc(p.email) +
      '" style="color:' +
      BRAND +
      ';text-decoration:none;">' +
      esc(p.email) +
      "</a>";

  var websiteVal = "—";
  if (!blank(p.website)) {
    var raw = String(p.website).trim();
    var href = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
    websiteVal =
      '<a href="' +
      esc(href) +
      '" style="color:' +
      BRAND +
      ';text-decoration:none;">' +
      esc(raw) +
      "</a>";
  }

  var phoneVal = blank(p.phone) ? "—" : esc(p.phone);
  var companyVal = blank(p.company) ? "—" : esc(p.company);
  var prefVal = blank(p.contact_preference)
    ? "—"
    : esc(cap(p.contact_preference));
  var whenVal = formatBerlin(p.submitted_at);
  var messageVal = blank(p.message) ? "—" : esc(p.message);

  function row(label, valueHtml) {
    return (
      "<tr>" +
      '<td style="padding:11px 0;border-bottom:1px solid ' +
      LINE +
      ";width:40%;vertical-align:top;color:" +
      FAINT +
      ';font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;">' +
      label +
      "</td>" +
      '<td style="padding:11px 0;border-bottom:1px solid ' +
      LINE +
      ";vertical-align:top;color:" +
      INK +
      ';font-size:15px;line-height:1.45;">' +
      valueHtml +
      "</td>" +
      "</tr>"
    );
  }

  var rows =
    row(L.name, name) +
    row(L.email, emailVal) +
    row(L.phone, phoneVal) +
    row(L.company, companyVal) +
    row(L.website, websiteVal) +
    row(L.pref, prefVal) +
    row(L.when, esc(whenVal));

  var html =
    "<!DOCTYPE html>" +
    '<html lang="' +
    lang +
    '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif&display=swap" rel="stylesheet">' +
    "</head>" +
    '<body style="margin:0;padding:0;background:#f3f4f6;">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">' +
    esc(L.preheader) +
    "</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:28px 12px;font-family:' +
    FONT_BODY +
    ';"><tr><td align="center">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">' +
    // Header
    '<tr><td style="background:' +
    INK +
    ';padding:26px 32px;"><table role="presentation" width="100%"><tr>' +
    '<td style="font-family:' +
    FONT_DISPLAY +
    ';color:#ffffff;font-size:26px;line-height:1;">ura<span style="color:' +
    BRAND +
    ';">.</span>design</td>' +
    '<td align="right" style="color:' +
    FAINT +
    ';font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;">' +
    esc(L.tag) +
    "</td>" +
    "</tr></table></td></tr>" +
    // Title + intro
    '<tr><td style="padding:30px 32px 4px;">' +
    '<h1 style="margin:0;font-family:' +
    FONT_DISPLAY +
    ";font-weight:400;font-size:27px;line-height:1.2;color:" +
    INK +
    ';">' +
    esc(L.title) +
    "</h1>" +
    '<p style="margin:12px 0 0;color:' +
    MUTED +
    ';font-size:15px;line-height:1.6;">' +
    esc(L.intro) +
    "</p></td></tr>" +
    // Message block
    '<tr><td style="padding:20px 32px 6px;">' +
    '<p style="margin:0 0 9px;color:' +
    FAINT +
    ';font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;">' +
    esc(L.yourMessage) +
    "</p>" +
    '<div style="background:#f9fafb;border-left:3px solid ' +
    BRAND +
    ";border-radius:10px;padding:16px 18px;color:" +
    INK +
    ';font-size:15px;line-height:1.65;white-space:pre-wrap;word-break:break-word;">' +
    messageVal +
    "</div></td></tr>" +
    // Details
    '<tr><td style="padding:18px 32px 6px;">' +
    '<p style="margin:0 0 4px;color:' +
    FAINT +
    ';font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;">' +
    esc(L.details) +
    "</p>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
    rows +
    "</table></td></tr>" +
    // Closing
    '<tr><td style="padding:18px 32px 28px;color:' +
    INK +
    ';font-size:15px;line-height:1.6;">' +
    esc(L.closing) +
    "<br>" +
    '<span style="font-family:' +
    FONT_DISPLAY +
    ";color:" +
    INK +
    ';font-size:18px;">' +
    esc(L.team) +
    "</span></td></tr>" +
    // Footer
    '<tr><td style="background:#fafafa;border-top:1px solid #e5e7eb;padding:18px 32px;text-align:center;color:' +
    FAINT +
    ';font-size:12px;line-height:1.5;">' +
    esc(L.footnote) +
    '<br><a href="https://ura.design" style="color:' +
    BRAND +
    ';text-decoration:none;font-weight:600;">ura.design</a></td></tr>' +
    "</table></td></tr></table></body></html>";

  return { html: html, subject: L.subject };
};
