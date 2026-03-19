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

      // Firebase কনফিগারেশন
      const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
      const FIREBASE_SECRET = process.env.FIREBASE_SECRET;

      if (!FIREBASE_DATABASE_URL || !FIREBASE_SECRET) {
        console.error('❌ Missing Firebase config');
        return res.status(500).json({ error: 'Firebase not configured' });
      }

      // Relograde থেকে অর্ডার ডিটেইলস fetch করুন
      const apiKey = process.env.RELOGRADE_API_KEY;
      let voucherData = null;
      
      if (apiKey && trx) {
        try {
          console.log(`🔍 Fetching order details for trx: ${trx}`);
          const orderRes = await fetch(`https://connect.relograde.com/api/1.02/order/${trx}`, {
            headers: { Authorization: `Bearer ${apiKey}` }
          });
          
          if (orderRes.ok) {
            const orderDetails = await orderRes.json();
            console.log('📦 Order details from Relograde:', JSON.stringify(orderDetails, null, 2));

            // items অ্যারে থেকে orderLines বের করে voucherCode সংগ্রহ
            if (orderDetails.items && Array.isArray(orderDetails.items)) {
              const allVouchers = [];
              
              orderDetails.items.forEach(item => {
                if (item.orderLines && Array.isArray(item.orderLines)) {
                  item.orderLines.forEach(line => {
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
                  vouchers: allVouchers,
                  firstVoucherCode: allVouchers[0]?.voucherCode || null,
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
      }

      // আপডেট ডাটা প্রস্তুত
      const updates = {
        status: 'completed',
        completedAt: new Date().toISOString(),
      };
      
      if (voucherData) {
        updates.voucherData = voucherData;
        updates.voucherCode = voucherData.firstVoucherCode; // সুবিধার জন্য আলাদা ফিল্ড
        console.log('✅ Final updates object with voucher:', updates);
      } else {
        console.warn('⚠️ No voucher data to save, updating only status');
      }

      // ========== 1. transactions আপডেট ==========
      const transactionDirectUrl = `${FIREBASE_DATABASE_URL}/transactions/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
      console.log(`📤 Updating transaction at: ${transactionDirectUrl}`);
      
      const directCheck = await fetch(transactionDirectUrl, { method: 'GET' });
      let transactionUpdateSuccess = false;

      if (directCheck.ok) {
        const transactionData = await directCheck.json();
        if (transactionData && transactionData.orderId === firebaseOrderId) {
          const patchRes = await fetch(transactionDirectUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          });
          if (patchRes.ok) {
            console.log(`✅ Transaction ${firebaseOrderId} updated directly with voucher`);
            transactionUpdateSuccess = true;
          } else {
            console.error(`❌ Failed to PATCH transaction: ${patchRes.status}`);
          }
        } else {
          console.warn(`⚠️ Transaction data mismatch, trying fallback...`);
          transactionUpdateSuccess = await updateTransactionViaSearch(firebaseOrderId, updates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
        }
      } else {
        console.warn(`⚠️ Direct path failed, trying fallback...`);
        transactionUpdateSuccess = await updateTransactionViaSearch(firebaseOrderId, updates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
      }

      // ========== 2. userOrders আপডেট ==========
      if (userId) {
        const userUpdates = { 
          status: 'completed'
        };
        if (voucherData) {
          userUpdates.voucherData = voucherData;
        }

        const userOrderDirectUrl = `${FIREBASE_DATABASE_URL}/userOrders/${userId}/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
        console.log(`📤 Updating user order at: ${userOrderDirectUrl}`);
        
        const userCheck = await fetch(userOrderDirectUrl, { method: 'GET' });

        if (userCheck.ok) {
          const userData = await userCheck.json();
          if (userData) {
            const patchRes = await fetch(userOrderDirectUrl, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(userUpdates),
            });
            if (patchRes.ok) {
              console.log(`✅ User order updated for user ${userId} with voucher data`);
            } else {
              console.error(`❌ Failed to PATCH user order: ${patchRes.status}`);
            }
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

// সার্চ করে ট্রানজেকশন আপডেট করার ফাংশন (পুরনো পদ্ধতি)
async function updateTransactionViaSearch(orderId, updates, dbUrl, secret) {
  const findUrl = `${dbUrl}/transactions.json?orderBy="orderId"&equalTo="${orderId}"&auth=${secret}`;
  console.log(`🔍 Searching transaction via: ${findUrl}`);
  
  const findRes = await fetch(findUrl);
  const findData = await findRes.json();

  if (findData && typeof findData === 'object') {
    const keys = Object.keys(findData);
    if (keys.length > 0) {
      const transactionKey = keys[0];
      const updateUrl = `${dbUrl}/transactions/${transactionKey}.json?auth=${secret}`;
      const patchRes = await fetch(updateUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (patchRes.ok) {
        console.log(`✅ Transaction ${orderId} updated via search (key: ${transactionKey}) with voucher`);
        return true;
      } else {
        console.error(`❌ Failed to PATCH via search: ${patchRes.status}`);
        return false;
      }
    } else {
      console.warn(`⚠️ No transaction found with orderId ${orderId}`);
      return false;
    }
  } else {
    console.warn(`⚠️ Transaction search failed for orderId ${orderId}`);
    return false;
  }
}

// সার্চ করে ইউজার অর্ডার আপডেট করার ফাংশন (পুরনো পদ্ধতি)
async function updateUserOrderViaSearch(userId, orderId, updates, dbUrl, secret) {
  const userOrdersUrl = `${dbUrl}/userOrders/${userId}.json?auth=${secret}`;
  console.log(`🔍 Searching user orders at: ${userOrdersUrl}`);
  
  const userOrdersRes = await fetch(userOrdersUrl);
  const userOrders = await userOrdersRes.json();

  if (userOrders && typeof userOrders === 'object') {
    for (const key in userOrders) {
      if (userOrders[key].orderId === orderId) {
        const updateUrl = `${dbUrl}/userOrders/${userId}/${key}.json?auth=${secret}`;
        const patchRes = await fetch(updateUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        if (patchRes.ok) {
          console.log(`✅ User order updated for user ${userId} via search (key: ${key}) with voucher:`, updates.voucherData);
          return true;
        } else {
          console.error(`❌ Failed to PATCH user order via search: ${patchRes.status}`);
          return false;
        }
      }
    }
    console.warn(`⚠️ No matching user order found for userId ${userId} with orderId ${orderId}`);
    return false;
  } else {
    console.warn(`⚠️ No userOrders found for userId ${userId}`);
    return false;
  }
}
