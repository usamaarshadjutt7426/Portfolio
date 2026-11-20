/**
 * ============================================================================
 * USAMA ARSHAD PORTFOLIO - AUTOMATED BOOKING & CANCELLATION EMAIL SYSTEM
 * ============================================================================
 * 
 * Google Apps Script Web App for https://usamaarshad.site
 * Associated with Host Gmail: mailmeatusama@gmail.com
 * 
 * CAPABILITIES:
 * 1. Booking Confirmation Email to CLIENT (with Google Meet link, dates, calendar invite)
 * 2. Booking Notification Email to HOST (Usama Arshad)
 * 3. Meeting Cancellation Email to CLIENT (with polite notice & 1-click rebook link)
 * 4. Slot Released Alert to HOST (Usama Arshad)
 * 
 * HOW TO DEPLOY:
 * 1. Open https://script.google.com/ in your browser (logged into mailmeatusama@gmail.com).
 * 2. Click "+ New project".
 * 3. Delete any default code in Code.gs, paste this entire file, and click Save (💾).
 * 4. Click the blue "Deploy" button at top right -> "New deployment".
 * 5. Under "Select type", click the gear icon (⚙️) and select "Web app".
 * 6. Set Description: "Portfolio Booking Dispatcher".
 * 7. Set "Execute as": "Me (mailmeatusama@gmail.com)".
 * 8. Set "Who has access": "Anyone" (CRITICAL: must be Anyone so your website can call it).
 * 9. Click "Deploy", then "Authorize access", choose your Google account, click "Advanced" -> "Go to (unsafe)" -> "Allow".
 * 10. Copy the "Web app URL" (starts with https://script.google.com/macros/s/...)
 * 11. Paste that URL in index.html (or inside the Slot Manager Drawer on your website).
 * ============================================================================
 */

const HOST_EMAIL = 'mailmeatusama@gmail.com';
const HOST_NAME = 'Usama Arshad';
const WEBSITE_URL = 'https://usamaarshad.site';

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ success: false, error: 'Empty payload received' });
    }

    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createJsonResponse({ success: false, error: 'Invalid JSON: ' + parseErr.message });
    }

    const action = data.action || 'book'; // 'book', 'cancel', or 'test'

    // =========================================================================
    // 1. ACTION: BOOK (New Discovery Call Created)
    // =========================================================================
    if (action === 'book') {
      const clientEmail = (data.clientEmail || '').trim();
      const clientName = (data.clientName || 'Valued Client').trim();
      const meetLink = data.meetLink || 'https://meet.google.com';
      const slotDate = data.date || 'Scheduled Date';
      const slotTime = data.time || 'Scheduled Time';
      const clientTimeStr = data.clientTime ? `${data.clientTime} (${data.clientTz || 'Your Timezone'})` : `${slotTime} (PKT)`;
      const topic = data.topic || 'Outbound Outreach & Strategic B2B Growth';
      const phone = data.phone || 'N/A';
      const company = data.company || 'Not Specified';
      const notes = data.notes || 'None provided';

      // Calendar URL
      const gcalUrl = createGCalLink(clientName, clientEmail, slotDate, slotTime, topic, meetLink, data.clientDate, data.clientTime);

      // (A) Send Email to CLIENT
      if (clientEmail && clientEmail.includes('@')) {
        const clientSubject = `📅 Meeting Confirmed: Discovery Call with Usama Arshad (${slotDate})`;
        const clientHtml = buildClientBookingHtml({
          clientName,
          clientEmail,
          slotDate,
          slotTime,
          clientTimeStr,
          topic,
          meetLink,
          gcalUrl,
          notes
        });

        GmailApp.sendEmail(clientEmail, clientSubject, '', {
          name: `${HOST_NAME} via Portfolio`,
          htmlBody: clientHtml,
          replyTo: HOST_EMAIL
        });
      }

      // (B) Send Email to HOST (Usama Arshad)
      const hostSubject = `📅 New Discovery Call: ${clientName} - ${slotDate} @ ${slotTime} PKT`;
      const hostHtml = buildHostBookingHtml({
        clientName,
        clientEmail,
        phone,
        company,
        topic,
        slotDate,
        slotTime,
        clientTimeStr,
        meetLink,
        notes,
        releaseUrl: `${WEBSITE_URL}/?action=reject&date=${encodeURIComponent(slotDate)}&time=${encodeURIComponent(slotTime)}`
      });

      GmailApp.sendEmail(HOST_EMAIL, hostSubject, '', {
        name: `${clientName} (Booking)`,
        htmlBody: hostHtml,
        replyTo: clientEmail || HOST_EMAIL
      });

      return createJsonResponse({
        success: true,
        message: `Booking confirmation dispatched to client (${clientEmail}) and host (${HOST_EMAIL}) successfully.`
      });
    }

    // =========================================================================
    // 2. ACTION: CANCEL (Meeting Cancelled & Slot Freed Up)
    // =========================================================================
    if (action === 'cancel') {
      const clientEmail = (data.clientEmail || '').trim();
      const clientName = (data.clientName || 'Valued Client').trim();
      const slotDate = data.date || 'Selected Date';
      const slotTime = data.time || 'Selected Time';
      const topic = data.topic || 'Discovery Call';
      const reason = data.reason || 'Slot freed up / schedule adjustment';
      const clientTimeStr = data.clientTime ? `${data.clientTime} (${data.clientTz || 'Your Timezone'})` : `${slotTime} (PKT)`;

      // (A) Send Cancellation Email to CLIENT
      let clientNotified = false;
      if (clientEmail && clientEmail.includes('@') && clientEmail !== 'N/A') {
        const clientCancelSubject = `❌ Meeting Cancelled: Discovery Call with Usama Arshad (${slotDate})`;
        const clientCancelHtml = buildClientCancellationHtml({
          clientName,
          slotDate,
          slotTime,
          clientTimeStr,
          topic,
          reason,
          rebookUrl: `${WEBSITE_URL}/#book-call`
        });

        GmailApp.sendEmail(clientEmail, clientCancelSubject, '', {
          name: `${HOST_NAME} via Portfolio`,
          htmlBody: clientCancelHtml,
          replyTo: HOST_EMAIL
        });
        clientNotified = true;
      }

      // (B) Send Cancellation Alert to HOST (Usama Arshad)
      const hostCancelSubject = `🗑️ Slot Cancelled & Released: ${slotDate} @ ${slotTime} PKT (${clientName})`;
      const hostCancelHtml = buildHostCancellationHtml({
        clientName,
        clientEmail,
        slotDate,
        slotTime,
        topic,
        reason,
        clientNotified
      });

      GmailApp.sendEmail(HOST_EMAIL, hostCancelSubject, '', {
        name: `Portfolio Slot Manager`,
        htmlBody: hostCancelHtml,
        replyTo: (clientEmail && clientEmail !== 'N/A') ? clientEmail : HOST_EMAIL
      });

      return createJsonResponse({
        success: true,
        clientNotified: clientNotified,
        message: `Cancellation notice processed. Client notified: ${clientNotified}. Host notified.`
      });
    }

    // =========================================================================
    // 3. ACTION: TEST (Verify webhook connection)
    // =========================================================================
    if (action === 'test') {
      const targetEmail = data.testEmail || HOST_EMAIL;
      GmailApp.sendEmail(targetEmail, `🧪 Webhook Test: Usama Arshad Portfolio Email System`, '', {
        name: `${HOST_NAME} System Test`,
        htmlBody: `<div style="font-family:sans-serif;padding:20px;background:#0b111e;color:#fff;border-radius:12px;">
          <h2 style="color:#00d995;margin-top:0;">⚡ Google Apps Script Webhook is Live!</h2>
          <p>Your automated booking and cancellation email dispatcher is correctly configured and functioning 100%.</p>
          <p><strong>Host:</strong> ${HOST_NAME} (${HOST_EMAIL})</p>
          <p><strong>Website:</strong> <a href="${WEBSITE_URL}" style="color:#2ee6a8;">${WEBSITE_URL}</a></p>
          <p style="color:#94a3b8;font-size:12px;">Triggered at: ${new Date().toLocaleString()}</p>
        </div>`
      });

      return createJsonResponse({ success: true, message: `Test email sent to ${targetEmail}` });
    }

    return createJsonResponse({ success: false, error: `Unknown action: "${action}"` });

  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

function doGet(e) {
  return createJsonResponse({
    status: 'online',
    service: 'Usama Arshad Portfolio Booking & Cancellation Email Dispatcher',
    host: HOST_EMAIL,
    website: WEBSITE_URL,
    timestamp: new Date().toISOString()
  });
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =============================================================================
// HTML EMAIL TEMPLATE BUILDERS
// =============================================================================

function buildClientBookingHtml(d) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Discovery Call Confirmed</title>
</head>
<body style="margin:0;padding:0;background-color:#070a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#070a0f;padding:30px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" max-width="600" style="max-width:600px;background:#0d1424;border:1px solid rgba(0,217,149,0.3);border-radius:18px;overflow:hidden;box-shadow:0 15px 40px rgba(0,0,0,0.6);">
          <!-- Header Banner -->
          <tr>
            <td style="background:linear-gradient(135deg,#0a1b2a 0%,#0f2e36 100%);padding:32px 28px;text-align:center;border-bottom:1px solid rgba(0,217,149,0.2);">
              <div style="display:inline-block;background:rgba(0,217,149,0.15);border:1px solid #00d995;color:#00d995;padding:6px 14px;border-radius:50px;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:12px;">
                ✓ Discovery Call Confirmed
              </div>
              <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0 0 6px 0;line-height:1.3;">Your Meeting is Locked In!</h1>
              <p style="color:#94a3b8;font-size:14px;margin:0;">1-on-1 Strategic Session with Usama Arshad</p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding:28px 28px 10px 28px;">
              <p style="color:#e2e8f0;font-size:15px;line-height:1.6;margin:0 0 20px 0;">
                Hello <strong style="color:#ffffff;">${escapeHtml(d.clientName)}</strong>,
              </p>
              <p style="color:#94a3b8;font-size:14.5px;line-height:1.6;margin:0 0 24px 0;">
                Thank you for scheduling a session. Your strategic discovery call has been successfully reserved. Below are all the essential meeting details and your direct Google Meet video access room:
              </p>

              <!-- Meeting Details Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#131c31;border:1px solid rgba(255,255,255,0.08);border-radius:14px;margin-bottom:24px;overflow:hidden;">
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <div style="color:#94a3b8;font-size:11.5px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">📅 Date</div>
                    <div style="color:#ffffff;font-size:15px;font-weight:600;margin-top:3px;">${escapeHtml(d.slotDate)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <div style="color:#94a3b8;font-size:11.5px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">⏰ Time</div>
                    <div style="color:#00d995;font-size:15px;font-weight:700;margin-top:3px;">${escapeHtml(d.clientTimeStr)}</div>
                    <div style="color:#64748b;font-size:12px;margin-top:2px;">Host Time: ${escapeHtml(d.slotTime)} (Pakistan Standard Time, UTC+5)</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <div style="color:#94a3b8;font-size:11.5px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">🎯 Discussion Topic</div>
                    <div style="color:#f1f5f9;font-size:14px;margin-top:3px;">${escapeHtml(d.topic)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 20px;">
                    <div style="color:#94a3b8;font-size:11.5px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">👤 Host</div>
                    <div style="color:#ffffff;font-size:14px;font-weight:600;margin-top:3px;">Usama Arshad <span style="color:#94a3b8;font-weight:400;">(${HOST_EMAIL})</span></div>
                  </td>
                </tr>
              </table>

              <!-- Google Meet CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:20px;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(d.meetLink)}" target="_blank" style="display:inline-block;width:92%;box-sizing:border-box;background:#00d995;color:#070a0f;font-weight:700;font-size:15px;text-decoration:none;padding:14px 24px;border-radius:10px;text-align:center;box-shadow:0 6px 20px rgba(0,217,149,0.35);">
                      🎥 Join Google Meet Video Room ↗
                    </a>
                  </td>
                </tr>
              </table>

              <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px 16px;text-align:center;margin-bottom:24px;">
                <span style="color:#64748b;font-size:12px;">Direct Room URL: </span>
                <a href="${escapeHtml(d.meetLink)}" style="color:#38bdf8;font-size:12px;text-decoration:underline;word-break:break-all;">${escapeHtml(d.meetLink)}</a>
              </div>

              <!-- Add to Google Calendar Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(d.gcalUrl)}" target="_blank" style="display:inline-block;background:transparent;border:1px solid rgba(255,255,255,0.2);color:#cbd5e1;font-weight:600;font-size:13.5px;text-decoration:none;padding:10px 20px;border-radius:8px;text-align:center;">
                      📅 Add to Google Calendar (With Reminders)
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Reschedule & Note Info -->
              <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:20px;color:#94a3b8;font-size:13px;line-height:1.6;">
                <p style="margin:0 0 10px 0;">
                  💡 <strong>Need to prepare or reschedule?</strong> Simply reply directly to this email or contact Usama Arshad at <a href="mailto:${HOST_EMAIL}" style="color:#2ee6a8;text-decoration:underline;">${HOST_EMAIL}</a>.
                </p>
                <p style="margin:0;">
                  Looking forward to speaking with you!
                </p>
              </div>

            </td>
          </tr>

          <!-- Footer Signature -->
          <tr>
            <td style="background:#090d18;padding:24px 28px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
              <div style="font-weight:700;color:#ffffff;font-size:15px;margin-bottom:4px;">Usama Arshad</div>
              <div style="color:#64748b;font-size:12.5px;margin-bottom:12px;">Outbound Outreach Specialist &amp; B2B Sales Strategist</div>
              <div>
                <a href="${WEBSITE_URL}" target="_blank" style="color:#00d995;font-size:12.5px;text-decoration:none;margin:0 8px;">usamaarshad.site</a> • 
                <a href="mailto:${HOST_EMAIL}" style="color:#94a3b8;font-size:12.5px;text-decoration:none;margin:0 8px;">${HOST_EMAIL}</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildClientCancellationHtml(d) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Meeting Cancelled</title>
</head>
<body style="margin:0;padding:0;background-color:#070a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#070a0f;padding:30px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" max-width="600" style="max-width:600px;background:#0d1424;border:1px solid rgba(239,68,68,0.3);border-radius:18px;overflow:hidden;box-shadow:0 15px 40px rgba(0,0,0,0.6);">
          <!-- Header Banner -->
          <tr>
            <td style="background:linear-gradient(135deg,#231118 0%,#180e1e 100%);padding:32px 28px;text-align:center;border-bottom:1px solid rgba(239,68,68,0.2);">
              <div style="display:inline-block;background:rgba(239,68,68,0.15);border:1px solid #ef4444;color:#f87171;padding:6px 14px;border-radius:50px;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:12px;">
                ✕ Meeting Cancelled
              </div>
              <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0 0 6px 0;line-height:1.3;">Discovery Call Notice</h1>
              <p style="color:#94a3b8;font-size:14px;margin:0;">Scheduled Session with Usama Arshad</p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding:28px 28px 10px 28px;">
              <p style="color:#e2e8f0;font-size:15px;line-height:1.6;margin:0 0 20px 0;">
                Hello <strong style="color:#ffffff;">${escapeHtml(d.clientName)}</strong>,
              </p>
              <p style="color:#cbd5e1;font-size:14.5px;line-height:1.6;margin:0 0 20px 0;">
                We are writing to inform you that your upcoming 1-on-1 Discovery Call scheduled for <strong>${escapeHtml(d.slotDate)}</strong> has been cancelled and the slot has been released.
              </p>

              <!-- Cancelled Meeting Summary -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#131c31;border:1px solid rgba(239,68,68,0.15);border-radius:14px;margin-bottom:24px;overflow:hidden;">
                <tr>
                  <td style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <div style="color:#94a3b8;font-size:11.5px;text-transform:uppercase;font-weight:600;">Status</div>
                    <div style="color:#f87171;font-size:14px;font-weight:700;margin-top:2px;">❌ Cancelled &amp; Released</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <div style="color:#94a3b8;font-size:11.5px;text-transform:uppercase;font-weight:600;">Scheduled Date &amp; Time</div>
                    <div style="color:#ffffff;font-size:14px;font-weight:600;margin-top:2px;">${escapeHtml(d.slotDate)} • ${escapeHtml(d.clientTimeStr)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;">
                    <div style="color:#94a3b8;font-size:11.5px;text-transform:uppercase;font-weight:600;">Discussion Topic</div>
                    <div style="color:#cbd5e1;font-size:13.5px;margin-top:2px;">${escapeHtml(d.topic)}</div>
                  </td>
                </tr>
              </table>

              <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 24px 0;">
                We sincerely apologize for any scheduling conflict or inconvenience. If you would still like to connect, we warmly invite you to choose a new convenient slot on our live availability calendar:
              </p>

              <!-- Reschedule CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(d.rebookUrl)}" target="_blank" style="display:inline-block;width:92%;box-sizing:border-box;background:#00d995;color:#070a0f;font-weight:700;font-size:15px;text-decoration:none;padding:14px 24px;border-radius:10px;text-align:center;box-shadow:0 6px 20px rgba(0,217,149,0.35);">
                      📅 Choose a New Available Slot ↗
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Direct Contact Note -->
              <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:18px;color:#94a3b8;font-size:13px;line-height:1.6;">
                <p style="margin:0;">
                  If you have any questions or wish to connect directly via email, simply reply to this email or write to Usama at <a href="mailto:${HOST_EMAIL}" style="color:#2ee6a8;text-decoration:underline;">${HOST_EMAIL}</a>.
                </p>
              </div>

            </td>
          </tr>

          <!-- Footer Signature -->
          <tr>
            <td style="background:#090d18;padding:24px 28px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
              <div style="font-weight:700;color:#ffffff;font-size:15px;margin-bottom:4px;">Usama Arshad</div>
              <div style="color:#64748b;font-size:12.5px;margin-bottom:12px;">Outbound Outreach Specialist &amp; B2B Sales Strategist</div>
              <div>
                <a href="${WEBSITE_URL}" target="_blank" style="color:#00d995;font-size:12.5px;text-decoration:none;margin:0 8px;">usamaarshad.site</a> • 
                <a href="mailto:${HOST_EMAIL}" style="color:#94a3b8;font-size:12.5px;text-decoration:none;margin:0 8px;">${HOST_EMAIL}</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildHostBookingHtml(d) {
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#0b111e;color:#f1f5f9;padding:20px;margin:0;">
  <div style="max-width:580px;margin:0 auto;background:#131c31;border:1px solid #00d995;border-radius:14px;padding:24px;">
    <h2 style="color:#00d995;margin-top:0;">📅 New Discovery Call Booked!</h2>
    <p style="color:#cbd5e1;font-size:14px;">A client has confirmed a booking on your portfolio website.</p>
    
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13.5px;color:#cbd5e1;">
      <tr style="border-bottom:1px solid #1e293b;"><td style="padding:8px 0;color:#94a3b8;">Client Name:</td><td style="padding:8px 0;font-weight:bold;color:#fff;">${escapeHtml(d.clientName)}</td></tr>
      <tr style="border-bottom:1px solid #1e293b;"><td style="padding:8px 0;color:#94a3b8;">Email:</td><td style="padding:8px 0;"><a href="mailto:${escapeHtml(d.clientEmail)}" style="color:#38bdf8;">${escapeHtml(d.clientEmail)}</a></td></tr>
      <tr style="border-bottom:1px solid #1e293b;"><td style="padding:8px 0;color:#94a3b8;">Phone / WhatsApp:</td><td style="padding:8px 0;color:#fff;">${escapeHtml(d.phone)}</td></tr>
      <tr style="border-bottom:1px solid #1e293b;"><td style="padding:8px 0;color:#94a3b8;">Company:</td><td style="padding:8px 0;color:#fff;">${escapeHtml(d.company)}</td></tr>
      <tr style="border-bottom:1px solid #1e293b;"><td style="padding:8px 0;color:#94a3b8;">Topic:</td><td style="padding:8px 0;color:#00d995;">${escapeHtml(d.topic)}</td></tr>
      <tr style="border-bottom:1px solid #1e293b;"><td style="padding:8px 0;color:#94a3b8;">Date (PKT):</td><td style="padding:8px 0;font-weight:bold;color:#fff;">${escapeHtml(d.slotDate)}</td></tr>
      <tr style="border-bottom:1px solid #1e293b;"><td style="padding:8px 0;color:#94a3b8;">Time (PKT):</td><td style="padding:8px 0;font-weight:bold;color:#00d995;">${escapeHtml(d.slotTime)} (UTC+5)</td></tr>
      <tr style="border-bottom:1px solid #1e293b;"><td style="padding:8px 0;color:#94a3b8;">Client Time:</td><td style="padding:8px 0;color:#cbd5e1;">${escapeHtml(d.clientTimeStr)}</td></tr>
      <tr style="border-bottom:1px solid #1e293b;"><td style="padding:8px 0;color:#94a3b8;">Google Meet:</td><td style="padding:8px 0;"><a href="${escapeHtml(d.meetLink)}" style="color:#00d995;font-weight:bold;">${escapeHtml(d.meetLink)}</a></td></tr>
      <tr><td style="padding:8px 0;color:#94a3b8;">Notes:</td><td style="padding:8px 0;color:#cbd5e1;">${escapeHtml(d.notes)}</td></tr>
    </table>

    <div style="margin-top:20px;text-align:center;">
      <a href="${escapeHtml(d.meetLink)}" style="display:inline-block;background:#00d995;color:#070a0f;font-weight:bold;padding:10px 20px;border-radius:8px;text-decoration:none;margin-right:8px;">Open Google Meet</a>
      <a href="${escapeHtml(d.releaseUrl)}" style="display:inline-block;background:rgba(239,68,68,0.15);border:1px solid #ef4444;color:#f87171;font-weight:bold;padding:9px 18px;border-radius:8px;text-decoration:none;">Cancel / Release Slot</a>
    </div>
  </div>
</body>
</html>`;
}

function buildHostCancellationHtml(d) {
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#0b111e;color:#f1f5f9;padding:20px;margin:0;">
  <div style="max-width:580px;margin:0 auto;background:#131c31;border:1px solid #ef4444;border-radius:14px;padding:24px;">
    <h2 style="color:#f87171;margin-top:0;">🗑️ Slot Cancelled &amp; Released</h2>
    <p style="color:#cbd5e1;font-size:14px;">The following slot has been cancelled and is now 100% Available again on your website:</p>
    
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13.5px;color:#cbd5e1;">
      <tr style="border-bottom:1px solid #1e293b;"><td style="padding:8px 0;color:#94a3b8;">Slot Date:</td><td style="padding:8px 0;font-weight:bold;color:#fff;">${escapeHtml(d.slotDate)}</td></tr>
      <tr style="border-bottom:1px solid #1e293b;"><td style="padding:8px 0;color:#94a3b8;">Slot Time (PKT):</td><td style="padding:8px 0;font-weight:bold;color:#ef4444;">${escapeHtml(d.slotTime)}</td></tr>
      <tr style="border-bottom:1px solid #1e293b;"><td style="padding:8px 0;color:#94a3b8;">Booked Client:</td><td style="padding:8px 0;color:#fff;">${escapeHtml(d.clientName)}</td></tr>
      <tr style="border-bottom:1px solid #1e293b;"><td style="padding:8px 0;color:#94a3b8;">Client Email:</td><td style="padding:8px 0;color:#38bdf8;">${escapeHtml(d.clientEmail)}</td></tr>
      <tr style="border-bottom:1px solid #1e293b;"><td style="padding:8px 0;color:#94a3b8;">Topic:</td><td style="padding:8px 0;color:#cbd5e1;">${escapeHtml(d.topic)}</td></tr>
      <tr><td style="padding:8px 0;color:#94a3b8;">Client Email Sent:</td><td style="padding:8px 0;color:${d.clientNotified ? '#00d995' : '#f87171'};font-weight:bold;">${d.clientNotified ? '✓ Yes, Cancellation Notice Sent to Client' : '✕ No Client Email Found'}</td></tr>
    </table>

    <p style="color:#94a3b8;font-size:12px;margin-top:16px;">This slot is now available for new clients to book on usamaarshad.site.</p>
  </div>
</body>
</html>`;
}

function createGCalLink(clientName, clientEmail, slotDate, slotTime, topic, meetLink, clientDate, clientTime) {
  try {
    const title = encodeURIComponent(`Discovery Call: ${clientName} & Usama Arshad`);
    const details = encodeURIComponent(`Strategic Discovery Call\nClient: ${clientName} (${clientEmail})\nTopic: ${topic}\nGoogle Meet Room: ${meetLink}\nHost: Usama Arshad (mailmeatusama@gmail.com)`);
    const loc = encodeURIComponent(meetLink);
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${loc}&add=${encodeURIComponent(clientEmail)}`;
  } catch (e) {
    return 'https://calendar.google.com';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
