// api/webhook.js
export default async function handler(req, res) {
  // CORS headers (optional)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const payload = req.body;
    console.log('📩 Webhook received. Payload:', JSON.stringify(payload, null, 2));

    // শুধু ORDER_FINISHED ইভেন্ট হ্যান্ডেল করুন
    if (payload.event !== 'ORDER_FINISHED') {
      return res.status(200).json({ received: true, message: 'Event ignored' });
    }

    const { trx, reference } = payload.data || {};
    if (!trx || !reference) {
      console.error('❌ Missing trx or reference');
      return res.status(200).json({ received: true, warning: 'Missing data' });
    }

    console.log(`🔔 Order finished: trx=${trx}, reference=${reference}`);

    // 🔹 Reference পার্স করুন (Firebase order ID ও user ID)
    let firebaseOrderId, userId;
    try {
      const refData = JSON.parse(reference);
      firebaseOrderId = refData.firebaseOrderId;
      userId = refData.userId;
      console.log(`✅ Parsed: firebaseOrderId=${firebaseOrderId}, userId=${userId}`);
    } catch (e) {
      console.error('❌ Failed to parse reference JSON:', e.message);
      return res.status(200).json({ received: true, warning: 'Invalid reference' });
    }

    if (!firebaseOrderId) {
      console.warn('⚠️ firebaseOrderId missing');
      return res.status(200).json({ received: true, warning: 'No firebaseOrderId' });
    }

    // Firebase ও Relograde কনফিগ (Environment variables)
    const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
    const FIREBASE_SECRET = process.env.FIREBASE_SECRET; // Firebase Database Secret
    const RELOGRADE_API_KEY = process.env.RELOGRADE_API_KEY;

    if (!FIREBASE_DATABASE_URL || !FIREBASE_SECRET || !RELOGRADE_API_KEY) {
      console.error('❌ Missing environment variables');
      return res.status(500).json({ error: 'Server config error' });
    }

    // 🔹 Relograde থেকে অর্ডার ডিটেলস ফেচ করুন
    let voucherCodes = [];
    try {
      const orderRes = await fetch(`https://connect.relograde.com/api/1.02/order/${trx}`, {
        headers: { Authorization: `Bearer ${RELOGRADE_API_KEY}` }
      });

      if (!orderRes.ok) {
        console.error(`❌ Relograde API error: ${orderRes.status} ${orderRes.statusText}`);
        const errorText = await orderRes.text();
        console.error('Response:', errorText);
      } else {
        const orderDetails = await orderRes.json();
        console.log('📦 Order details from Relograde (full):', JSON.stringify(orderDetails, null, 2));

        // ✅ সঠিক পদ্ধতি: items[].orderLines[].voucherCode
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

    // 🔹 Firebase-এ আপডেট করার ডাটা তৈরি করুন
    const updates = {
      status: 'completed',
      completedAt: new Date().toISOString(),
      voucherCodes: voucherCodes,  // খালি অ্যারে হলেও সেট হবে
    };

    console.log('📤 Updates to Firebase:', JSON.stringify(updates, null, 2));

    // ========== userOrders আপডেট ==========
    if (userId && firebaseOrderId) {
      const userOrderUrl = `${FIREBASE_DATABASE_URL}/userOrders/${userId}/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
      const userRes = await fetch(userOrderUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (userRes.ok) {
        console.log(`✅ userOrders updated for ${userId}/${firebaseOrderId}`);
      } else {
        console.error(`❌ userOrders update failed: ${userRes.status}`);
        const errText = await userRes.text();
        console.error(errText);
      }
    } else {
      console.warn('⚠️ userId or firebaseOrderId missing, skipping userOrders update');
    }

    // ========== transactions আপডেট (ঐচ্ছিক) ==========
    if (firebaseOrderId) {
      const transactionUrl = `${FIREBASE_DATABASE_URL}/transactions/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
      await fetch(transactionUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).then(res => {
        if (res.ok) console.log(`✅ transactions updated for ${firebaseOrderId}`);
        else console.error(`❌ transactions update failed: ${res.status}`);
      }).catch(err => console.error('Transaction update error:', err.message));
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
