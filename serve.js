const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.xml': 'application/xml'
};

const rootDir = __dirname;
const bookedSlotsFile = path.join(rootDir, 'booked_slots.json');
const bookedDetailsFile = path.join(rootDir, 'booked_slots_details.json');

const FIRESTORE_ENDPOINT = 'https://firestore.googleapis.com/v1/projects/usama-arshad-portfolio/databases/(default)/documents/bookings/current';

function syncFirestoreFromBackend(slots, details) {
  try {
    const postData = JSON.stringify({
      fields: {
        bookedSlotsJson: { stringValue: JSON.stringify(slots || getPersistedSlots()) },
        bookedDetailsJson: { stringValue: JSON.stringify(details || getPersistedDetails()) },
        updatedAt: { stringValue: new Date().toISOString() }
      }
    });

    const req = https.request(FIRESTORE_ENDPOINT, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      // Backend Firestore synced
    });
    req.on('error', () => {});
    req.write(postData);
    req.end();
  } catch (e) {}
}

function pullFirestoreToBackend() {
  try {
    https.get(FIRESTORE_ENDPOINT, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const doc = JSON.parse(b);
          if (doc && doc.fields) {
            if (doc.fields.bookedSlotsJson && doc.fields.bookedSlotsJson.stringValue) {
              const cloudSlots = JSON.parse(doc.fields.bookedSlotsJson.stringValue);
              fs.writeFileSync(bookedSlotsFile, JSON.stringify(cloudSlots, null, 2), 'utf8');
            }
            if (doc.fields.bookedDetailsJson && doc.fields.bookedDetailsJson.stringValue) {
              const cloudDetails = JSON.parse(doc.fields.bookedDetailsJson.stringValue);
              fs.writeFileSync(bookedDetailsFile, JSON.stringify(cloudDetails, null, 2), 'utf8');
            }
            console.log('⚡ [FIRESTORE SYNC] Backend synced with Google Cloud Firestore (usama-arshad-portfolio)');
          }
        } catch (e) {}
      });
    }).on('error', () => {});
  } catch (e) {}
}

// Pull cloud slots on server launch
pullFirestoreToBackend();

function getPersistedSlots() {
  try {
    if (fs.existsSync(bookedSlotsFile)) {
      return JSON.parse(fs.readFileSync(bookedSlotsFile, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function savePersistedSlots(slots) {
  try {
    fs.writeFileSync(bookedSlotsFile, JSON.stringify(slots, null, 2), 'utf8');
    syncFirestoreFromBackend(slots, getPersistedDetails());
  } catch (e) {}
}

function getPersistedDetails() {
  try {
    if (fs.existsSync(bookedDetailsFile)) {
      return JSON.parse(fs.readFileSync(bookedDetailsFile, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function savePersistedDetails(details) {
  try {
    fs.writeFileSync(bookedDetailsFile, JSON.stringify(details, null, 2), 'utf8');
    syncFirestoreFromBackend(getPersistedSlots(), details);
  } catch (e) {}
}

function getBackendGasWebhookUrl() {
  try {
    const details = getPersistedDetails();
    if (details && details.__gasWebhookUrl) return details.__gasWebhookUrl;
  } catch (e) {}
  return process.env.GAS_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbxb6FsbAAZWvU30vHJFdsAHiRE-agFXEdXFrkZmbd5sOuCgpsTC2Ouy7kruzQ6LIqOg6g/exec';
}

function sendEmailNotification(bookingData) {
  // 1. Google Apps Script Dispatch (Sends to Client & Host)
  const webhookUrl = getBackendGasWebhookUrl();
  if (webhookUrl) {
    try {
      const gasPayload = JSON.stringify({
        action: 'book',
        clientName: bookingData.name,
        clientEmail: bookingData.email,
        phone: bookingData.phone,
        company: bookingData.company,
        topic: bookingData.topic,
        date: bookingData.date,
        time: bookingData.time,
        clientDate: bookingData.clientDate,
        clientTime: bookingData.clientTime,
        clientTz: bookingData.clientTz,
        meetLink: bookingData.meetLink,
        notes: bookingData.notes
      });
      const gReq = https.request(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
          'Content-Length': Buffer.byteLength(gasPayload)
        }
      }, gRes => {
        console.log(`⚡ [GAS BOOKING DISPATCH] Status: ${gRes.statusCode}`);
      });
      gReq.on('error', () => {});
      gReq.write(gasPayload);
      gReq.end();
    } catch (e) {}
  }

  // 2. FormSubmit Host Notification (Guaranteed Fail-Safe)
  const payload = JSON.stringify({
    _subject: `📅 Discovery Call Booked: ${bookingData.name} - ${bookingData.date} @ ${bookingData.time} PKT`,
    _template: 'table',
    _captcha: 'false',
    _cc: bookingData.email,
    _replyto: bookingData.email,
    'Client Name': bookingData.name,
    'Client Email': bookingData.email,
    'Phone / WhatsApp': bookingData.phone,
    'Company': bookingData.company || 'Not Specified',
    'Strategy Focus': bookingData.topic,
    'Date (PKT)': bookingData.date,
    'Time (PKT)': `${bookingData.time} (Pakistan Time, UTC+5)`,
    'Client Local Time': bookingData.clientTime ? `${bookingData.clientTime} (${bookingData.clientTz || 'Client Timezone'})` : `${bookingData.time} (PKT)`,
    'Google Meet Room': bookingData.meetLink,
    'Notes': bookingData.notes || 'None provided',
    'Booked At': new Date().toLocaleString()
  });

  const req = https.request('https://formsubmit.co/ajax/mailmeatusama@gmail.com', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Origin': 'http://localhost:5500',
      'Referer': 'http://localhost:5500/'
    }
  }, res => {
    let resp = '';
    res.on('data', c => resp += c);
    res.on('end', () => {
      console.log(`✉️ [BACKEND EMAIL DISPATCH] Status: ${res.statusCode}, Result: ${resp}`);
    });
  });

  req.on('error', err => {
    console.warn(`⚠️ [BACKEND EMAIL DISPATCH NOTICE]: ${err.message}`);
  });

  req.write(payload);
  req.end();
}

function sendCancellationEmailNotification(cancelData) {
  const client = cancelData.client || {};
  const clientName = client.name || cancelData.name || 'Saved Contact';
  const clientEmail = client.email || cancelData.email || 'N/A';
  const clientPhone = client.phone || cancelData.phone || 'N/A';
  const clientCompany = client.company || cancelData.company || 'Not Specified';
  const clientTopic = client.topic || cancelData.topic || 'Discovery Call';
  const slotDate = client.date || cancelData.date;
  const slotTime = client.time || cancelData.time;

  // 1. Google Apps Script Dispatch (Sends to Client & Host)
  const webhookUrl = getBackendGasWebhookUrl();
  if (webhookUrl && clientEmail && clientEmail.includes('@') && clientEmail !== 'N/A') {
    try {
      const gasCancelPayload = JSON.stringify({
        action: 'cancel',
        clientName: clientName,
        clientEmail: clientEmail,
        date: slotDate,
        time: slotTime,
        clientTime: client.clientTime || '',
        clientTz: client.clientTz || '',
        topic: clientTopic,
        reason: 'Slot cancelled by Host'
      });
      const gReq = https.request(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
          'Content-Length': Buffer.byteLength(gasCancelPayload)
        }
      }, gRes => {
        console.log(`⚡ [GAS CANCELLATION DISPATCH] Status: ${gRes.statusCode}`);
      });
      gReq.on('error', () => {});
      gReq.write(gasCancelPayload);
      gReq.end();
    } catch (e) {}
  }

  // 2. FormSubmit Host Cancellation Alert (Guaranteed Fail-Safe)
  const payload = JSON.stringify({
    _subject: `🗑️ Slot Cancelled & Freed Up: ${slotDate} @ ${slotTime} PKT (${clientName})`,
    _template: 'table',
    _captcha: 'false',
    _cc: clientEmail !== 'N/A' ? clientEmail : undefined,
    _replyto: clientEmail !== 'N/A' ? clientEmail : undefined,
    'Action Status': '❌ Slot Cancelled & Released to Available',
    'Cancelled Slot Date': slotDate,
    'Cancelled Slot Time (PKT)': `${slotTime} (Pakistan Time, UTC+5)`,
    'Originally Booked Person': clientName,
    'Client Work Email': clientEmail,
    'Client Phone / WhatsApp': clientPhone,
    'Company / Agency': clientCompany,
    'Discussion Focus': clientTopic,
    'Client Scope Notes': client.notes || 'None',
    'Cancellation Timestamp': new Date().toLocaleString(),
    'Notice': 'This booked slot has been freed up in the Slot Manager and is now Available again on your portfolio.'
  });

  const req = https.request('https://formsubmit.co/ajax/mailmeatusama@gmail.com', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Origin': 'http://localhost:5500',
      'Referer': 'http://localhost:5500/'
    }
  }, res => {
    let resp = '';
    res.on('data', c => resp += c);
    res.on('end', () => {
      console.log(`✉️ [CANCELLATION EMAIL DISPATCH] Status: ${res.statusCode}, Result: ${resp}`);
    });
  });

  req.on('error', err => {
    console.warn(`⚠️ [CANCELLATION EMAIL DISPATCH NOTICE]: ${err.message}`);
  });

  req.write(payload);
  req.end();
}

function handleRequest(req, res) {
  // Normalize URL and query
  const fullUrl = req.url;
  const urlParts = fullUrl.split('?');
  let parsedUrl = urlParts[0];
  const queryString = urlParts[1] || '';
  const searchParams = new URLSearchParams(queryString);

  try {
    parsedUrl = decodeURIComponent(parsedUrl);
  } catch (e) {}

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // Handle /api/slots endpoint (GET)
  if (req.method === 'GET' && (parsedUrl === '/api/slots' || parsedUrl === '/api/slots/')) {
    const slots = getPersistedSlots();
    const details = getPersistedDetails();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify({ success: true, bookedSlots: slots, bookedDetails: details }));
    return;
  }

  // Handle /api/booking/action endpoint (GET or POST) for Accept / Reject from email or UI
  if (parsedUrl === '/api/booking/action' || parsedUrl === '/api/booking/action/') {
    const action = searchParams.get('action') || 'reject';
    const date = searchParams.get('date') || '';
    const time = searchParams.get('time') || '';

    const slots = getPersistedSlots();
    const details = getPersistedDetails();

    if (action === 'clear_all') {
      Object.keys(details).forEach(k => {
        const c = details[k];
        if (c && c.email) {
          sendCancellationEmailNotification({
            date: c.date,
            time: c.time,
            client: c
          });
        }
      });
      savePersistedSlots({});
      savePersistedDetails({});
      console.log('\n--------------------------------------------------');
      console.log('🗑️ [ALL SLOTS CLEARED & FREED UP BY OWNER]');
      console.log('Status: All slots are now 100% Available');
      console.log('--------------------------------------------------\n');
    } else if (action === 'reject' && date && time) {
      const key = `${date}_${time}`;
      const savedClient = details[key] || null;
      const skipEmail = searchParams.get('skip_email') === '1';

      if (savedClient && !skipEmail) {
        sendCancellationEmailNotification({
          date: date,
          time: time,
          client: savedClient
        });
      }

      if (slots[date]) {
        slots[date] = slots[date].filter(t => t !== time);
        if (slots[date].length === 0) delete slots[date];
        savePersistedSlots(slots);
      }

      if (details[key]) {
        delete details[key];
        savePersistedDetails(details);
      }

      console.log('\n--------------------------------------------------');
      console.log('🗑️ [SLOT FREED UP BY OWNER IN MANAGER]');
      console.log(`📅 Date: ${date} at ${time} (PKT)`);
      if (savedClient) {
        console.log(`👤 Cancelled Booking Contact: ${savedClient.name} (${savedClient.email}, ${savedClient.phone})`);
      }
      console.log('Status: Slot is now 100% Available on website');
      console.log('--------------------------------------------------\n');
    }

    const acceptsHtml = (req.headers.accept || '').includes('text/html');
    if (acceptsHtml && req.method === 'GET') {
      const isReject = action === 'reject';
      const pageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isReject ? 'Slot Released' : 'Booking Accepted'} — Usama Arshad</title>
  <style>
    body { background: #070a0f; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #111622; border: 1px solid ${isReject ? 'rgba(0, 217, 149, 0.4)' : 'rgba(66, 133, 244, 0.4)'}; border-radius: 20px; padding: 40px 32px; text-align: center; max-width: 520px; width: 100%; box-shadow: 0 20px 50px rgba(0,0,0,0.8), 0 0 40px rgba(0,217,149,0.15); }
    .icon { width: 64px; height: 64px; border-radius: 50%; background: rgba(0, 217, 149, 0.12); border: 2px solid #00d995; display: inline-flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: #00d995; font-size: 28px; }
    h1 { font-size: 24px; margin: 0 0 12px; color: #ffffff; }
    p { color: #94a3b8; line-height: 1.6; font-size: 14.5px; margin: 0 0 24px; }
    .badge { display: inline-block; background: rgba(0, 217, 149, 0.1); border: 1px solid rgba(0, 217, 149, 0.3); color: #2ee6a8; padding: 6px 14px; border-radius: 8px; font-weight: 600; font-size: 14px; margin-bottom: 20px; }
    .btn { display: inline-block; background: #00d995; color: #070a0f; font-weight: 700; text-decoration: none; padding: 13px 28px; border-radius: 10px; font-size: 14px; transition: transform 0.2s, background 0.2s; }
    .btn:hover { background: #2ee6a8; transform: translateY(-2px); }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isReject ? '✓' : '📅'}</div>
    <h1>${isReject ? 'Slot Successfully Released!' : 'Meeting Confirmed!'}</h1>
    <div class="badge">📅 ${date || 'Selected Date'} • ⏰ ${time || 'Selected Time'} (PKT)</div>
    <p>${isReject ? 'This booking has been cancelled and the slot is now <strong>100% Available</strong> for new clients. Your schedule availability is not wasted.' : 'The discovery call has been marked as accepted.'}</p>
    <a href="/?action=released&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}" class="btn">Open Portfolio & Verify Slot ↗</a>
  </div>
</body>
</html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(pageHtml);
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ success: true, action, date, time, bookedSlots: getPersistedSlots(), bookedDetails: getPersistedDetails() }));
    return;
  }

  // Handle /api/booking endpoint (POST)
  if (req.method === 'POST' && (parsedUrl === '/api/booking' || parsedUrl === '/api/booking/')) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);

        // Save slot into persisted slots & details
        if (data.ymd && data.time) {
          const slots = getPersistedSlots();
          if (!slots[data.ymd]) slots[data.ymd] = [];
          if (!slots[data.ymd].includes(data.time)) {
            slots[data.ymd].push(data.time);
          }
          savePersistedSlots(slots);

          const details = getPersistedDetails();
          const key = `${data.ymd}_${data.time}`;
          details[key] = {
            name: data.name,
            email: data.email,
            phone: data.phone,
            company: data.company || 'Not Specified',
            topic: data.topic,
            date: data.date,
            time: data.time,
            clientTime: data.clientTime || '',
            clientTz: data.clientTz || '',
            clientDate: data.clientDate || '',
            meetLink: data.meetLink,
            notes: data.notes || '',
            bookedAt: new Date().toLocaleString()
          };
          savePersistedDetails(details);
        }

        console.log('\n==================================================');
        console.log('📅 [DISCOVERY CALL BOOKING RECEIVED]');
        console.log(`👤 Client: ${data.name} (${data.email})`);
        console.log(`📞 Phone/WhatsApp: ${data.phone}`);
        console.log(`🏢 Company: ${data.company || 'Not Specified'}`);
        console.log(`🎯 Topic: ${data.topic}`);
        console.log(`📅 Date & Time (PKT): ${data.date} at ${data.time} (PKT)`);
        if (data.clientTime) {
          console.log(`🌐 Client Time: ${data.clientTime} (${data.clientTz || ''})`);
        }
        console.log(`🔗 Google Meet: ${data.meetLink}`);
        console.log(`📝 Notes: ${data.notes || 'None'}`);
        console.log(`📧 Target Host: mailmeatusama@gmail.com`);
        console.log('🛡️ Slot Management: Manage Booked Slots on Portfolio (PIN: 746742)');
        console.log('==================================================\n');

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ success: true, message: 'Booking logged and slot reserved successfully' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Handle path aliases like /usama_portfolio/
  if (parsedUrl.startsWith('/usama_portfolio')) {
    parsedUrl = parsedUrl.replace('/usama_portfolio', '');
  }

  if (parsedUrl === '/' || parsedUrl === '') {
    parsedUrl = '/index.html';
  }

  const safePath = path.normalize(parsedUrl).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(rootDir, safePath);

  // If path is directory, look for index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

// Ports to bind
const ports = [5500, 8000, 3000];

ports.forEach(port => {
  const server = http.createServer(handleRequest);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Local Server running at http://127.0.0.1:${port}/ and http://localhost:${port}/`);
  });
  server.on('error', err => {
    console.warn(`Could not bind to port ${port}: ${err.message}`);
  });
});
