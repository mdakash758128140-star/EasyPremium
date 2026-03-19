// api/webhook.js
export default async function handler(req, res) {
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

      // রেফারেন্স পার্স করুন (JSON ফরম্যাট)
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

      // Firebase কনফিগারেশন (লিগ্যাসি সিক্রেট বা টোকেন)
      const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
      const FIREBASE_SECRET = process.env.FIREBASE_SECRET;

      if (!FIREBASE_DATABASE_URL || !FIREBASE_SECRET) {
        console.error('❌ Missing Firebase config');
        return res.status(500).json({ error: 'Firebase not configured' });
      }

      // Relograde থেকে ভাউচার ডাটা সংগ্রহ
      const apiKey = process.env.RELOGRADE_API_KEY;
      let voucherData = null;
      if (apiKey && trx) {
        try {
          const orderRes = await fetch(`https://connect.relograde.com/api/1.02/order/${trx}`, {
            headers: { Authorization: `Bearer ${apiKey}` }
          });
          if (orderRes.ok) {
            const orderDetails = await orderRes.json();
            console.log('📦 Order details from Relograde:', orderDetails);
            voucherData = {
              voucherLink: orderDetails.voucherLink || orderDetails.voucherUrl || null,
              voucherCode: orderDetails.voucherCode || null,
            };
          } else {
            console.error('❌ Failed to fetch order details from Relograde');
          }
        } catch (err) {
          console.error('❌ Error fetching order details:', err.message);
        }
      }

      // আপডেট ডাটা প্রস্তুত
      const updates = {
        status: 'completed',
        completedAt: new Date().toISOString(),
      };
      if (voucherData) {
        updates.voucherData = voucherData;
      }

      // ========== 1. transactions আপডেট ==========
      // নতুন কাঠামো: transactions/${firebaseOrderId} সরাসরি আপডেট করুন
      const transactionDirectUrl = `${FIREBASE_DATABASE_URL}/transactions/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
      const directCheck = await fetch(transactionDirectUrl, { method: 'GET' });

      if (directCheck.ok) {
        const transactionData = await directCheck.json();
        if (transactionData && transactionData.orderId === firebaseOrderId) {
          // সরাসরি কী হিসেবে আছে, তাই আপডেট করুন
          await fetch(transactionDirectUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          });
          console.log(`✅ Transaction ${firebaseOrderId} updated directly`);
        } else {
          // সরাসরি কী না থাকলে পুরনো পদ্ধতিতে চেষ্টা করুন (fallback)
          await updateTransactionViaSearch(firebaseOrderId, updates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
        }
      } else {
        // URL ব্যর্থ হলে সার্চ করুন
        await updateTransactionViaSearch(firebaseOrderId, updates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
      }

      // ========== 2. userOrders আপডেট ==========
      if (userId) {
        // নতুন কাঠামো: userOrders/${userId}/${firebaseOrderId}
        const userOrderDirectUrl = `${FIREBASE_DATABASE_URL}/userOrders/${userId}/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
        const userCheck = await fetch(userOrderDirectUrl, { method: 'GET' });

        if (userCheck.ok) {
          const userData = await userCheck.json();
          if (userData) {
            const userUpdates = { status: 'completed' };
            if (voucherData) {
              userUpdates.voucherData = voucherData; // ঐচ্ছিক
            }
            await fetch(userOrderDirectUrl, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(userUpdates),
            });
            console.log(`✅ User order updated for user ${userId}`);
          } else {
            console.warn(`⚠️ User order not found at direct path, trying fallback...`);
            await updateUserOrderViaSearch(userId, firebaseOrderId, userUpdates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
          }
        } else {
          console.warn(`⚠️ Failed to access user order direct path, trying fallback...`);
          await updateUserOrderViaSearch(userId, firebaseOrderId, { status: 'completed' }, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

// সার্চ করে ট্রানজেকশন আপডেট করার ফাংশন (পুরনো পদ্ধতি)
async function updateTransactionViaSearch(orderId, updates, dbUrl, secret) {
  const findUrl = `${dbUrl}/transactions.json?orderBy="orderId"&equalTo="${orderId}"&auth=${secret}`;
  const findRes = await fetch(findUrl);
  const findData = await findRes.json();

  if (findData && typeof findData === 'object') {
    const keys = Object.keys(findData);
    if (keys.length > 0) {
      const transactionKey = keys[0];
      const updateUrl = `${dbUrl}/transactions/${transactionKey}.json?auth=${secret}`;
      await fetch(updateUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      console.log(`✅ Transaction ${orderId} updated via search (key: ${transactionKey})`);
    } else {
      console.warn(`⚠️ No transaction found with orderId ${orderId}`);
    }
  } else {
    console.warn(`⚠️ Transaction search failed for orderId ${orderId}`);
  }
}

// সার্চ করে ইউজার অর্ডার আপডেট করার ফাংশন (পুরনো পদ্ধতি)
async function updateUserOrderViaSearch(userId, orderId, updates, dbUrl, secret) {
  const userOrdersUrl = `${dbUrl}/userOrders/${userId}.json?auth=${secret}`;
  const userOrdersRes = await fetch(userOrdersUrl);
  const userOrders = await userOrdersRes.json();

  if (userOrders && typeof userOrders === 'object') {
    // যে কোনো চাইল্ড খুঁজুন যার orderId মেলে
    for (const key in userOrders) {
      if (userOrders[key].orderId === orderId) {
        const updateUrl = `${dbUrl}/userOrders/${userId}/${key}.json?auth=${secret}`;
        await fetch(updateUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        console.log(`✅ User order updated for user ${userId} via search (key: ${key})`);
        return;
      }
    }
    console.warn(`⚠️ No matching user order found for userId ${userId} with orderId ${orderId}`);
  } else {
    console.warn(`⚠️ No userOrders found for userId ${userId}`);
  }
}
