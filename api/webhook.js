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

    // শুধু ORDER_FINISHED ইভেন্ট হ্যান্ডেল করুন
    if (payload.event !== 'ORDER_FINISHED') {
      return res.status(200).json({ received: true, message: 'Event ignored' });
    }

    const { trx, reference } = payload.data || {};
    console.log(`🔹 Order finished: trx=${trx}, reference=${reference}`);

    // reference JSON পার্স করুন
    let firebaseOrderId = null;
    let userId = null;
    try {
      const refData = JSON.parse(reference);
      firebaseOrderId = refData.firebaseOrderId;
      userId = refData.userId;
      console.log(`✅ Parsed: firebaseOrderId=${firebaseOrderId}, userId=${userId}`);
    } catch (e) {
      console.error('❌ Failed to parse reference JSON:', e);
      return res.status(200).json({ received: true, warning: 'Invalid reference format' });
    }

    if (!firebaseOrderId) {
      console.warn('⚠️ firebaseOrderId missing in reference');
      return res.status(200).json({ received: true, warning: 'No firebaseOrderId' });
    }

    // Relograde API থেকে ভাউচার ডেটা আনা
    const apiKey = process.env.RELOGRADE_API_KEY;
    let voucherData = null;
    if (apiKey && trx) {
      try {
        const orderRes = await fetch(`https://connect.relograde.com/api/1.02/order/${trx}`, {
          headers: { Authorization: `Bearer ${apiKey}` }
        });

        if (orderRes.ok) {
          const orderDetails = await orderRes.json();
          console.log('📦 Order details from Relograde:', JSON.stringify(orderDetails, null, 2));

          // এখানে আপনার API রেসপন্সের সঠিক ফিল্ড নাম বসান
          voucherData = {
            voucherLink: orderDetails.voucherLink || orderDetails.voucherUrl || orderDetails.voucher || null,
            voucherCode: orderDetails.voucherCode || null,
          };
          console.log('🎫 Extracted voucherData:', voucherData);
        } else {
          console.error('❌ Failed to fetch order details, status:', orderRes.status);
          const errorText = await orderRes.text();
          console.error('Response body:', errorText);
        }
      } catch (err) {
        console.error('❌ Error fetching order details:', err.message);
      }
    }

    // Firebase Secret দিয়ে আপডেট
    const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
    const FIREBASE_SECRET = process.env.FIREBASE_SECRET;

    if (!FIREBASE_DATABASE_URL || !FIREBASE_SECRET) {
      console.error('❌ Missing Firebase config (DATABASE_URL or SECRET)');
      return res.status(500).json({ error: 'Firebase not configured' });
    }

    // 1️⃣ transactions নোডে অর্ডার খুঁজুন (orderId = firebaseOrderId)
    const findUrl = `${FIREBASE_DATABASE_URL}/transactions.json?orderBy="orderId"&equalTo="${firebaseOrderId}"&auth=${FIREBASE_SECRET}`;
    console.log('🔍 Searching transaction with URL:', findUrl.replace(FIREBASE_SECRET, '***'));

    const findRes = await fetch(findUrl);
    if (!findRes.ok) {
      console.error('❌ Failed to query transactions:', findRes.status);
      const errText = await findRes.text();
      console.error('Response:', errText);
      return res.status(500).json({ error: 'Firebase query failed' });
    }

    const findData = await findRes.json();
    console.log('📋 Transaction query result:', findData);

    if (!findData || typeof findData !== 'object' || Object.keys(findData).length === 0) {
      console.warn(`⚠️ No transaction found with orderId ${firebaseOrderId}`);
      return res.status(200).json({ received: true, warning: 'Order not found' });
    }

    const transactionKey = Object.keys(findData)[0]; // Firebase push key
    console.log(`✅ Found transaction with key: ${transactionKey}`);

    // আপডেট ডেটা তৈরি করুন
    const updates = {
      status: 'completed',
      completedAt: new Date().toISOString(),
    };
    if (voucherData && (voucherData.voucherLink || voucherData.voucherCode)) {
      updates.voucherData = voucherData;
    } else {
      console.warn('⚠️ No voucher data to save, updating status only');
    }

    // ট্রানজেকশন আপডেট করুন
    const updateUrl = `${FIREBASE_DATABASE_URL}/transactions/${transactionKey}.json?auth=${FIREBASE_SECRET}`;
    const updateRes = await fetch(updateUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!updateRes.ok) {
      console.error('❌ Failed to update transaction:', updateRes.status);
      const errText = await updateRes.text();
      console.error('Error:', errText);
    } else {
      console.log(`✅ Transaction ${firebaseOrderId} updated successfully`);
    }

    // 2️⃣ userOrders নোড আপডেট করুন (যদি userId থাকে)
    if (userId) {
      // userOrders-এ কী হলো firebaseOrderId (EP-...)
      const userOrderUrl = `${FIREBASE_DATABASE_URL}/userOrders/${userId}/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
      console.log('🔍 Checking user order at:', userOrderUrl.replace(FIREBASE_SECRET, '***'));

      const checkRes = await fetch(userOrderUrl);
      if (checkRes.ok) {
        const userOrderData = await checkRes.json();
        if (userOrderData) {
          // ইউজার অর্ডার আপডেট করুন (শুধু status, প্রয়োজনে voucherData ও দেওয়া যেতে পারে)
          const userUpdateRes = await fetch(userOrderUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed' }), // voucherData চাইলে এখানেও যোগ করুন
          });
          if (userUpdateRes.ok) {
            console.log(`✅ User order ${firebaseOrderId} updated`);
          } else {
            console.error('❌ Failed to update user order:', userUpdateRes.status);
          }
        } else {
          console.warn(`⚠️ User order node exists but no data for key ${firebaseOrderId}`);
        }
      } else {
        console.warn(`⚠️ User order not found for userId ${userId}, key ${firebaseOrderId}`);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Webhook fatal error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
}
