import nodemailer from "nodemailer";

function getFromEmail() {
  return (
    process.env.DEFAULT_FROM_EMAIL ||
    process.env.EMAIL_HOST_USER ||
    "info@thomasbaafi.com"
  );
}

const MAX_DOWNLOADS = 3;
const DOWNLOAD_VALID_DAYS = 3;

function getApiBase() {
  return (
    process.env.DOWNLOAD_BASE_URL ||
    (process.env.VERCEL ? "" : "http://localhost:5000")
  );
}

// Base URL for customer-facing pages (the review link points here, not the API).
function getSiteBase() {
  return (
    process.env.SITE_BASE_URL ||
    (process.env.VERCEL ? "" : "http://localhost:5173")
  );
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.EMAIL_HOST;
  const port = Number(process.env.EMAIL_PORT || 465);
  const user = getFromEmail();
  const pass = process.env.EMAIL_PASSWORD;

  if (!host || !pass || pass.includes("your_webmail")) {
    console.warn(
      "[email] EMAIL_HOST / EMAIL_PASSWORD not configured. Skipping thank-you email.",
    );
    return null;
  }

  const useSsl = String(process.env.EMAIL_USE_SSL || "True").toLowerCase() === "true";

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: useSsl,
    auth: { user, pass },
  });

  return transporter;
}

function buildDownloadSection(products, downloadToken) {
  const apiBase = getApiBase();
  if (!downloadToken || !apiBase) return "";

  const digitalNames = (products || [])
    .filter((p) => p.format === "Audiobook" || p.format === "Soft Copy")
    .map((p) => p.name)
    .join(", ");

  const downloadUrl = `${apiBase}/api/audiobooks/download?token=${encodeURIComponent(downloadToken)}`;

  return `
          <tr>
            <td style="padding:32px 48px;background-color:#fff8f0;border-top:1px solid #f0e2d0;border-bottom:1px solid #f0e2d0;">
              <h2 style="font-family:'Montserrat',Arial,sans-serif;font-size:17px;font-weight:700;color:#1f1f1f;margin:0 0 8px 0;">
                Your download is ready
              </h2>
              <p style="font-size:14px;line-height:1.7;color:#5f5f5f;margin:0 0 4px 0;">
                <strong style="color:#1f1f1f;">${digitalNames || "Your digital copy"}</strong> is available now.
              </p>
              <p style="font-size:13px;line-height:1.6;color:#a67c52;margin:0 0 20px 0;">
                This link is valid for ${DOWNLOAD_VALID_DAYS} days and allows up to ${MAX_DOWNLOADS} downloads. Please save it somewhere safe.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0;">
                <tr>
                  <td style="background-color:#0f0f0f;border-radius:8px;padding:14px 28px;">
                    <a href="${downloadUrl}" style="font-family:'Montserrat',Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Download now</a>
                  </td>
                </tr>
              </table>
              <p style="font-size:12px;color:#a9a9a9;margin:16px 0 0 0;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${downloadUrl}" style="color:#a67c52;word-break:break-all;">${downloadUrl}</a>
              </p>
            </td>
          </tr>`;
}

function buildReviewSection(reviewToken) {
  const siteBase = getSiteBase();
  if (!reviewToken || !siteBase) return "";

  const reviewUrl = `${siteBase}/review?token=${encodeURIComponent(reviewToken)}`;

  return `
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0;">
            <tr>
              <td style="background-color:#0f0f0f;border-radius:8px;padding:14px 28px;">
                <a href="${reviewUrl}" style="font-family:'Montserrat',Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Add a review</a>
              </td>
            </tr>
          </table>
          <p style="font-size:13px;line-height:1.6;color:#a67c52;margin:14px 0 0 0;">
            We'd love to hear what you thought about RESILIENCE. Your review will help other readers decide.
          </p>
          <p style="font-size:12px;color:#a9a9a9;margin:10px 0 0 0;">
            Button not working? Copy and paste this link into your browser:<br>
            <a href="${reviewUrl}" style="color:#a67c52;word-break:break-all;">${reviewUrl}</a>
          </p>`;
}

function buildThankYouHtml(customerName, products, downloadToken, reviewToken) {
  const displayName = customerName || "there";
  const downloadSection = buildDownloadSection(products, downloadToken);
  const reviewSection = buildReviewSection(reviewToken);
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background-color:#f9f9f9;font-family:'Raleway',Arial,Helvetica,sans-serif;color:#1f1f1f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9f9f9;padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(31,31,31,0.08);">
          <tr>
            <td style="background-color:#1f1f1f;padding:40px 48px;text-align:center;">
              <div style="font-family:'Montserrat',Arial,sans-serif;font-size:28px;font-weight:700;letter-spacing:6px;color:#ffffff;margin:0;">RESILIENCE</div>
              <div style="font-family:'Montserrat',Arial,sans-serif;font-size:13px;letter-spacing:3px;color:#a9a9a9;margin-top:8px;">BY THOMAS BAAFI</div>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 48px;">
              <h1 style="font-family:'Montserrat',Arial,sans-serif;font-size:22px;font-weight:700;color:#1f1f1f;margin:0 0 16px 0;">
                Thank you, ${displayName}!
              </h1>
              <p style="font-size:15px;line-height:1.7;color:#5f5f5f;margin:0 0 20px 0;">
                I'm so glad you've picked up your copy of
                <strong style="color:#1f1f1f;">RESILIENCE</strong>. Your payment came through successfully.
              </p>
              <p style="font-size:15px;line-height:1.7;color:#5f5f5f;margin:0 0 24px 0;">
                Enjoy the read — may these pages encourage and strengthen you on your journey.
              </p>
             
              ${reviewSection}

               ${downloadSection}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f5f5f5;padding:24px 48px;text-align:center;">
              <p style="font-size:13px;color:#5f5f5f;margin:0 0 4px 0;">
                With gratitude,
              </p>
                  <p style="font-family:'Montserrat',Arial,sans-serif;font-size:15px;font-weight:700;color:#1f1f1f;margin:0;">
                    Thomas Baafi
                  </p>
              <p style="font-size:12px;color:#a9a9a9;margin:12px 0 0 0;">
                &copy; ${new Date().getFullYear()} RESILIENCE. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export async function sendThankYouEmail(
  customerEmail,
  customerName,
  { products, downloadToken, reviewToken } = {},
) {
  const mailer = getTransporter();
  if (!mailer) return { skipped: true, reason: "not_configured" };

  const apiBase = getApiBase();
  const hasDownload =
    downloadToken &&
    apiBase &&
    (products || []).some(
      (p) => p.format === "Audiobook" || p.format === "Soft Copy",
    );

  const digitalNames = hasDownload
    ? (products || [])
        .filter((p) => p.format === "Audiobook" || p.format === "Soft Copy")
        .map((p) => p.name)
        .join(", ")
    : "";

  let fallbackText = `Thank you, ${customerName || "there"}! Your payment for RESILIENCE came through successfully. Enjoy the read — Thomas Baafi.`;

  if (hasDownload) {
    const downloadUrl = `${apiBase}/api/audiobooks/download?token=${encodeURIComponent(downloadToken)}`;
    fallbackText += `\n\nYour download of ${digitalNames} is ready:\n${downloadUrl}\n\nThis link is valid for ${DOWNLOAD_VALID_DAYS} days and allows up to ${MAX_DOWNLOADS} downloads.`;
  }

  if (reviewToken && getSiteBase()) {
    const reviewUrl = `${getSiteBase()}/review?token=${encodeURIComponent(reviewToken)}`;
    fallbackText += `\n\nWe'd love to hear what you thought about RESILIENCE. Add a review here:\n${reviewUrl}`;
  }

  const mailOptions = {
    from: `"Thomas Baafi" <${getFromEmail()}>`,
    to: customerEmail,
    subject: "Thank you for purchasing RESILIENCE",
    text: fallbackText,
    html: buildThankYouHtml(customerName, products, downloadToken, reviewToken),
  };

  try {
    const info = await mailer.sendMail(mailOptions);
    console.log(
      `[email] Thank-you email sent to ${customerEmail}: ${info.messageId}`,
    );
    return { sent: true };
  } catch (err) {
    console.error("[email] Failed to send thank-you email:", err.message);
    return { sent: false, error: err.message };
  }
}
