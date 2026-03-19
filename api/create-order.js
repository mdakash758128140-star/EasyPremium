// api/webhook.js
export default async function handler(req, res) {
  // CORS হ্যান্ডলিং
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const payload = req.body;
    console.log('📩 Webhook received:', payload.event);

    if (payload.event === 'ORDER_FINISHED') {
      const { trx, reference } = payload.data || {};
      console.log(`🔔 Order finished: trx=${trx}, reference=${reference}`);

      // reference পার্স (যেখানে firebaseOrderId ও userId আছে)
      let firebaseOrderId = null;
      let userId = null;
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

      // Firebase কনফিগ
      const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
      const FIREBASE_SECRET = process.env.FIREBASE_SECRET; // Rest API key or OAuth token

      if (!FIREBASE_DATABASE_URL || !FIREBASE_SECRET) {
        console.error('❌ Missing Firebase config');
        return res.status(500).json({ error: 'Firebase not configured' });
      }

      // Relograde থেকে অর্ডার ডিটেলস ফেচ করে ভাউচার কোড সংগ্রহ
      const apiKey = process.env.RELOGRADE_API_KEY;
      let voucherCodes = [];

      if (apiKey && trx) {
        try {
          const orderRes = await fetch(`https://connect.relograde.com/api/1.02/order/${trx}`, {
            headers: { Authorization: `Bearer ${apiKey}` }
          });

          if (orderRes.ok) {
            const orderDetails = await orderRes.json();
            console.log('📦 Order details fetched from Relograde');

            // items -> orderLines -> voucherCode
            if (orderDetails.items && Array.isArray(orderDetails.items)) {
              orderDetails.items.forEach(item => {
                if (item.orderLines && Array.isArray(item.orderLines)) {
                  item.orderLines.forEach(line => {
                    if (line.voucherCode) voucherCodes.push(line.voucherCode);
                  });
                }
              });
            }

            console.log(`✅ Extracted ${voucherCodes.length} voucher codes:`, voucherCodes);
          } else {
            console.error(`❌ Failed to fetch order details: ${orderRes.status}`);
          }
        } catch (err) {
          console.error('❌ Error fetching order details:', err.message);
        }
      }

      // Firebase আপডেট ডাটা তৈরি (শুধু voucherCodes)
      const updates = {
        status: 'completed',
        completedAt: new Date().toISOString(),
      };

      if (voucherCodes.length > 0) {
        updates.voucherCodes = voucherCodes; // অ্যারে হিসেবে সংরক্ষণ
      }

      // ========== 1. userOrders আপডেট ==========
      if (userId && firebaseOrderId) {
        const userOrderUrl = `${FIREBASE_DATABASE_URL}/userOrders/${userId}/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
        const userRes = await fetch(userOrderUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        if (userRes.ok) {
          console.log(`✅ userOrders updated for userId ${userId}, orderId ${firebaseOrderId}`);
        } else {
          console.error(`❌ Failed to update userOrders: ${userRes.status}`);
        }
      }

      // ========== 2. transactions আপডেট (ঐচ্ছিক) ==========
      const transactionUrl = `${FIREBASE_DATABASE_URL}/transactions/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
      await fetch(transactionUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).catch(e => console.error('Transaction update error:', e.message));
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
