// api/webhook.js
export default async function handler(req, res) {
  // ... (CORS এবং মেথড চেক আগের মতোই থাকবে) ...

  try {
    const payload = req.body;
    console.log('📩 Webhook received:', payload.event);

    if (payload.event === 'ORDER_FINISHED') {
      const { trx, reference } = payload.data || {};
      console.log(`🔔 Order finished: trx=${trx}, reference=${reference}`);

      // 1. Reference থেকে firebaseOrderId এবং userId বের করুন (JSON ফরম্যাট)
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

      // 2. Relograde থেকে অর্ডার ডিটেইলস fetch করুন (GET)
      const apiKey = process.env.RELOGRADE_API_KEY;
      if (!apiKey) {
        console.error('❌ Missing Relograde API key');
        return res.status(500).json({ error: 'Relograde API key not configured' });
      }

      let voucherData = null;
      try {
        // অর্ডার ডিটেইলস GET করুন
        const orderRes = await fetch(`https://connect.relograde.com/api/1.02/order/${trx}`, {
          headers: { Authorization: `Bearer ${apiKey}` }
        });

        if (orderRes.ok) {
          const orderDetails = await orderRes.json();
          console.log('📦 Full order details from Relograde:', JSON.stringify(orderDetails, null, 2));

          // 3. items অ্যারে থেকে orderLines খুঁজে voucherCode সংগ্রহ করুন
          if (orderDetails.items && Array.isArray(orderDetails.items)) {
            const allVouchers = [];
            
            orderDetails.items.forEach(item => {
              if (item.orderLines && Array.isArray(item.orderLines)) {
                item.orderLines.forEach(line => {
                  // শুধু মাত্র finished স্ট্যাটাসের লাইনগুলো নিন
                  if (line.status === 'finished' && line.voucherCode) {
                    allVouchers.push({
                      tag: line.tag,
                      voucherCode: line.voucherCode,
                      voucherSerial: line.voucherSerial || null,
                      voucherDateExpired: line.voucherDateExpired || null
                    });
                  }
                });
              }
            });

            if (allVouchers.length > 0) {
              voucherData = {
                vouchers: allVouchers, // সব ভাউচারের অ্যারে
                firstVoucherCode: allVouchers[0]?.voucherCode || null, // সুবিধার জন্য প্রথমটি আলাদা
                count: allVouchers.length
              };
              console.log(`✅ Extracted ${allVouchers.length} voucher(s):`, voucherData);
            } else {
              console.warn('⚠️ No finished voucher lines found in order details');
            }
          }
        } else {
          console.error(`❌ Failed to fetch order details. Status: ${orderRes.status}`);
          const errorText = await orderRes.text();
          console.error('Error response:', errorText);
        }
      } catch (err) {
        console.error('❌ Error fetching order details:', err.message);
      }

      // 4. আপডেট ডাটা প্রস্তুত
      const updates = {
        status: 'completed',
        completedAt: new Date().toISOString(),
      };
      
      if (voucherData) {
        updates.voucherData = voucherData; // সম্পূর্ণ ভাউচার ডেটা সংরক্ষণ
        updates.voucherCode = voucherData.firstVoucherCode; // অতিরিক্ত সুবিধার জন্য
        console.log('✅ Voucher data prepared for Firebase:', updates.voucherData);
      } else {
        console.warn('⚠️ No voucher data to save');
      }

      // 5. Firebase আপডেট করুন (একই পদ্ধতি, শুধু updates-এ voucherData থাকবে)
      // ========== transactions আপডেট ==========
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
          console.log(`✅ Transaction ${firebaseOrderId} updated with voucher data`);
        } else {
          await updateTransactionViaSearch(firebaseOrderId, updates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
        }
      } else {
        await updateTransactionViaSearch(firebaseOrderId, updates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
      }

      // ========== userOrders আপডেট ==========
      if (userId) {
        const userUpdates = { 
          status: 'completed'
        };
        if (voucherData) {
          userUpdates.voucherData = voucherData; // ইউজারের অর্ডারেও সম্পূর্ণ ভাউচার ডেটা
        }

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
            console.log(`✅ User order updated for user ${userId} with voucher data`);
          } else {
            console.warn(`⚠️ User order not found at direct path, trying fallback...`);
            await updateUserOrderViaSearch(userId, firebaseOrderId, userUpdates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
          }
        } else {
          console.warn(`⚠️ Failed to access user order direct path, trying fallback...`);
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

// নিচের হেল্পার ফাংশনগুলো (updateTransactionViaSearch, updateUserOrderViaSearch) আগের মতোই থাকবে
