// api/webhook.js
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const payload = req.body;
    console.log('📩 Webhook received. Payload:', JSON.stringify(payload, null, 2));

    const event = payload.event;
    if (event !== 'ORDER_FINISHED') {
      console.log(`Ignoring event: ${event}`);
      return res.status(200).json({ received: true, message: 'Event ignored' });
    }

    const { trx, reference } = payload.data || {};
    if (!trx || !reference) {
      console.error('❌ Missing trx or reference in payload');
      return res.status(200).json({ received: true, warning: 'Missing data' });
    }

    console.log(`🔔 Order finished: trx=${trx}, reference=${reference}`);

    // Parse reference (JSON format)
    let firebaseOrderId, userId;
    try {
      const refData = JSON.parse(reference);
      firebaseOrderId = refData.firebaseOrderId;
      userId = refData.userId;
      console.log(`✅ Parsed reference: firebaseOrderId=${firebaseOrderId}, userId=${userId}`);
    } catch (e) {
      console.error('❌ Failed to parse reference JSON:', e.message);
      return res.status(200).json({ received: true, warning: 'Invalid reference' });
    }

    if (!firebaseOrderId) {
      console.warn('⚠️ firebaseOrderId missing');
      return res.status(200).json({ received: true, warning: 'No firebaseOrderId' });
    }

    // Firebase config
    const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
    const FIREBASE_SECRET = process.env.FIREBASE_SECRET;

    if (!FIREBASE_DATABASE_URL || !FIREBASE_SECRET) {
      console.error('❌ Missing Firebase config');
      return res.status(500).json({ error: 'Firebase not configured' });
    }

    // Relograde API Key
    const apiKey = process.env.RELOGRADE_API_KEY;
    if (!apiKey) {
      console.error('❌ Missing RELOGRADE_API_KEY');
      return res.status(500).json({ error: 'Relograde API key missing' });
    }

    // Fetch order details from Relograde
    let voucherCodes = [];
    try {
      const orderRes = await fetch(`https://connect.relograde.com/api/1.02/order/${trx}`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });

      if (!orderRes.ok) {
        console.error(`❌ Failed to fetch order details from Relograde: ${orderRes.status} ${orderRes.statusText}`);
        const errorText = await orderRes.text();
        console.error('Response body:', errorText);
      } else {
        const orderDetails = await orderRes.json();
        console.log('📦 Order details from Relograde:', JSON.stringify(orderDetails, null, 2));

        // Extract voucher codes from items -> orderLines -> voucherCode
        if (orderDetails.items && Array.isArray(orderDetails.items)) {
          orderDetails.items.forEach(item => {
            if (item.orderLines && Array.isArray(item.orderLines)) {
              item.orderLines.forEach(line => {
                if (line.voucherCode) {
                  voucherCodes.push(line.voucherCode);
                }
              });
            }
          });
        }

        console.log(`✅ Extracted ${voucherCodes.length} voucher codes:`, voucherCodes);
      }
    } catch (err) {
      console.error('❌ Error fetching order details:', err.message);
    }

    // Prepare updates
    const updates = {
      status: 'completed',
      completedAt: new Date().toISOString(),
    };

    if (voucherCodes.length > 0) {
      updates.voucherCodes = voucherCodes;
    } else {
      console.warn('⚠️ No voucher codes extracted. Firebase update will not include voucherCodes.');
    }

    console.log('Updates to be sent to Firebase:', JSON.stringify(updates, null, 2));

    // Update userOrders
    if (userId && firebaseOrderId) {
      const userOrderUrl = `${FIREBASE_DATABASE_URL}/userOrders/${userId}/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
      try {
        const userRes = await fetch(userOrderUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        if (userRes.ok) {
          console.log(`✅ userOrders updated for userId ${userId}, orderId ${firebaseOrderId}`);
        } else {
          console.error(`❌ Failed to update userOrders: ${userRes.status} ${userRes.statusText}`);
          const errorText = await userRes.text();
          console.error('Response:', errorText);
        }
      } catch (err) {
        console.error('❌ Error updating userOrders:', err.message);
      }
    } else {
      console.warn('⚠️ Missing userId or firebaseOrderId, skipping userOrders update');
    }

    // Optionally update transactions
    if (firebaseOrderId) {
      const transactionUrl = `${FIREBASE_DATABASE_URL}/transactions/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
      try {
        const transRes = await fetch(transactionUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        if (transRes.ok) {
          console.log(`✅ transactions updated for orderId ${firebaseOrderId}`);
        } else {
          console.error(`❌ Failed to update transactions: ${transRes.status}`);
        }
      } catch (err) {
        console.error('❌ Error updating transactions:', err.message);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
