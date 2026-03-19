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
    console.log('📩 Webhook received:', payload.event);

    if (payload.event === 'ORDER_FINISHED') {
      const { trx, reference } = payload.data || {};
      console.log(`🔔 Order finished: trx=${trx}, reference=${reference}`);

      // reference পার্স করুন (JSON ফরম্যাট)
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

      // Firebase কনফিগারেশন
      const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
      const FIREBASE_SECRET = process.env.FIREBASE_SECRET;

      if (!FIREBASE_DATABASE_URL || !FIREBASE_SECRET) {
        console.error('❌ Missing Firebase config');
        return res.status(500).json({ error: 'Firebase not configured' });
      }

      // Relograde থেকে অর্ডারের বিস্তারিত তথ্য নিয়ে ভাউচার কোড বের করা
      const apiKey = process.env.RELOGRADE_API_KEY;
      let voucherCodes = [];
      
      if (apiKey && trx) {
        try {
          const orderRes = await fetch(`https://connect.relograde.com/api/1.02/order/${trx}`, {
            headers: { Authorization: `Bearer ${apiKey}` }
          });

          if (orderRes.ok) {
            const orderDetails = await orderRes.json();
            console.log('📦 Order details from Relograde received');

            // ভাউচার কোড কালেক্ট করা (items → orderLines → voucherCode)
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

      // আপডেট ডাটা প্রস্তুত (শুধু ভাউচার কোড)
      const updates = {
        status: 'completed',
        completedAt: new Date().toISOString(),
      };
      
      if (voucherCodes.length > 0) {
        updates.voucherCodes = voucherCodes; // অ্যারে আকারে সব কোড
        // চাইলে প্রথম কোডটি আলাদা ফিল্ড হিসেবেও রাখতে পারেন
        updates.voucherCode = voucherCodes[0]; // প্রথম কোড (যদি দরকার হয়)
      }

      // ========== transactions আপডেট ==========
      // সরাসরি পাথে চেষ্টা
      const transactionDirectUrl = `${FIREBASE_DATABASE_URL}/transactions/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
      const directCheck = await fetch(transactionDirectUrl, { method: 'GET' });

      if (directCheck.ok) {
        const transactionData = await directCheck.json();
        if (transactionData && transactionData.orderId === firebaseOrderId) {
          await fetch(transactionDirectUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          });
          console.log(`✅ Transaction ${firebaseOrderId} updated directly with ${voucherCodes.length} voucher codes`);
        } else {
          await updateTransactionViaSearch(firebaseOrderId, updates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
        }
      } else {
        await updateTransactionViaSearch(firebaseOrderId, updates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
      }

      // ========== userOrders আপডেট ==========
      if (userId) {
        const userUpdates = {
          status: 'completed',
          voucherCodes: voucherCodes
        };
        if (voucherCodes.length > 0) {
          userUpdates.voucherCode = voucherCodes[0]; // প্রথম কোড
        }

        // সরাসরি পাথে চেষ্টা
        const userOrderDirectUrl = `${FIREBASE_DATABASE_URL}/userOrders/${userId}/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
        const userCheck = await fetch(userOrderDirectUrl, { method: 'GET' });

        if (userCheck.ok) {
          const userData = await userCheck.json();
          if (userData) {
            await fetch(userOrderDirectUrl, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(userUpdates),
            });
            console.log(`✅ User order updated for user ${userId} with ${voucherCodes.length} voucher codes`);
          } else {
            await updateUserOrderViaSearch(userId, firebaseOrderId, userUpdates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
          }
        } else {
          await updateUserOrderViaSearch(userId, firebaseOrderId, userUpdates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

// সার্চ করে ট্রানজেকশন আপডেট
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
  }
}

// সার্চ করে ইউজার অর্ডার আপডেট
async function updateUserOrderViaSearch(userId, orderId, updates, dbUrl, secret) {
  const userOrdersUrl = `${dbUrl}/userOrders/${userId}.json?auth=${secret}`;
  const userOrdersRes = await fetch(userOrdersUrl);
  const userOrders = await userOrdersRes.json();

  if (userOrders && typeof userOrders === 'object') {
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
    console.warn(`⚠️ No matching user order found for userId ${userId}`);
  }
}
