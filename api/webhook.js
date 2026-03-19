// api/webhook.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const payload = req.body;
    console.log('📩 Webhook received. Event:', payload.event);

    if (payload.event === 'ORDER_FINISHED') {
      const { trx, reference } = payload.data || {};
      console.log('🔔 Order finished. trx:', trx, 'reference:', reference);

      // ---------- Reference পার্স ----------
      let firebaseOrderId = null;
      let userId = null;
      try {
        const refData = JSON.parse(reference);
        firebaseOrderId = refData.firebaseOrderId;
        userId = refData.userId;
        console.log('✅ Parsed reference:', { firebaseOrderId, userId });
      } catch (e) {
        console.error('❌ Failed to parse reference JSON:', e.message);
        return res.status(200).json({ received: true, warning: 'Invalid reference' });
      }

      if (!firebaseOrderId) {
        console.warn('⚠️ firebaseOrderId missing in reference');
        return res.status(200).json({ received: true, warning: 'No firebaseOrderId' });
      }

      // ---------- Firebase Config ----------
      const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
      const FIREBASE_SECRET = process.env.FIREBASE_SECRET;
      if (!FIREBASE_DATABASE_URL || !FIREBASE_SECRET) {
        console.error('❌ Missing Firebase config env vars');
        return res.status(500).json({ error: 'Firebase not configured' });
      }

      // ---------- Relograde থেকে ডাটা ফেচ ----------
      const apiKey = process.env.RELOGRADE_API_KEY;
      let voucherData = null;

      if (apiKey && trx) {
        try {
          console.log('🔍 Fetching order details from Relograde, trx:', trx);
          const orderRes = await fetch(`https://connect.relograde.com/api/1.02/order/${trx}`, {
            headers: { Authorization: `Bearer ${apiKey}` }
          });

          if (orderRes.ok) {
            const orderDetails = await orderRes.json();
            console.log('📦 Full Relograde response:', JSON.stringify(orderDetails, null, 2));

            // ---------- items[].orderLines থেকে ভাউচার কোড বের করা ----------
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
                  firstVoucherCode: allVouchers[0].voucherCode,
                  count: allVouchers.length
                };
                console.log('✅ Extracted voucher data:', voucherData);
              } else {
                console.warn('⚠️ No finished voucher lines found in order details');
              }
            }
          } else {
            console.error('❌ Relograde API error, status:', orderRes.status);
            const errText = await orderRes.text();
            console.error('Error response:', errText);
          }
        } catch (err) {
          console.error('❌ Exception while fetching order details:', err.message);
        }
      } else {
        console.warn('⚠️ Missing apiKey or trx, cannot fetch voucher');
      }

      // ---------- আপডেট অবজেক্ট তৈরি ----------
      const updates = {
        status: 'completed',
        completedAt: new Date().toISOString(),
      };
      if (voucherData) {
        updates.voucherData = voucherData;
        updates.voucherCode = voucherData.firstVoucherCode; // extra field for convenience
      }
      console.log('📦 Final updates object to save:', updates);

      // ---------- 1. transactions আপডেট (direct path) ----------
      const transactionDirectUrl = `${FIREBASE_DATABASE_URL}/transactions/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
      console.log('📤 Updating transaction at:', transactionDirectUrl);

      const directCheck = await fetch(transactionDirectUrl, { method: 'GET' });
      if (directCheck.ok) {
        const transactionData = await directCheck.json();
        if (transactionData && transactionData.orderId === firebaseOrderId) {
          const patchRes = await fetch(transactionDirectUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          });
          if (patchRes.ok) {
            console.log('✅ Transaction updated directly, status:', patchRes.status);
          } else {
            console.error('❌ Failed to PATCH transaction, status:', patchRes.status);
            const errText = await patchRes.text();
            console.error('Error response:', errText);
          }
        } else {
          console.warn('⚠️ Transaction data mismatch, falling back to search');
          await updateTransactionViaSearch(firebaseOrderId, updates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
        }
      } else {
        console.warn('⚠️ Direct transaction path not found, falling back to search');
        await updateTransactionViaSearch(firebaseOrderId, updates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
      }

      // ---------- 2. userOrders আপডেট ----------
      if (userId) {
        const userUpdates = { status: 'completed' };
        if (voucherData) {
          userUpdates.voucherData = voucherData;
        }

        const userOrderDirectUrl = `${FIREBASE_DATABASE_URL}/userOrders/${userId}/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
        console.log('📤 Updating user order at:', userOrderDirectUrl);

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
              console.log('✅ User order updated directly');
            } else {
              console.error('❌ Failed to PATCH user order, status:', patchRes.status);
            }
          } else {
            console.warn('⚠️ User order not found at direct path, falling back');
            await updateUserOrderViaSearch(userId, firebaseOrderId, userUpdates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
          }
        } else {
          console.warn('⚠️ Direct user order path failed, falling back');
          await updateUserOrderViaSearch(userId, firebaseOrderId, userUpdates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
        }
      } else {
        console.warn('⚠️ No userId in reference, skipping userOrders update');
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Webhook fatal error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

// ---------- Helper: updateTransactionViaSearch ----------
async function updateTransactionViaSearch(orderId, updates, dbUrl, secret) {
  const findUrl = `${dbUrl}/transactions.json?orderBy="orderId"&equalTo="${orderId}"&auth=${secret}`;
  console.log('🔍 Searching transaction via:', findUrl);

  const findRes = await fetch(findUrl);
  const findData = await findRes.json();

  if (findData && typeof findData === 'object') {
    const keys = Object.keys(findData);
    if (keys.length > 0) {
      const key = keys[0];
      const updateUrl = `${dbUrl}/transactions/${key}.json?auth=${secret}`;
      console.log('Found transaction with key:', key, ' updating at:', updateUrl);

      const patchRes = await fetch(updateUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (patchRes.ok) {
        console.log('✅ Transaction updated via search');
      } else {
        console.error('❌ Failed to update via search, status:', patchRes.status);
      }
    } else {
      console.warn('⚠️ No transaction found with orderId:', orderId);
    }
  } else {
    console.warn('⚠️ Transaction search failed or no data');
  }
}

// ---------- Helper: updateUserOrderViaSearch ----------
async function updateUserOrderViaSearch(userId, orderId, updates, dbUrl, secret) {
  const userOrdersUrl = `${dbUrl}/userOrders/${userId}.json?auth=${secret}`;
  console.log('🔍 Searching user orders at:', userOrdersUrl);

  const userOrdersRes = await fetch(userOrdersUrl);
  const userOrders = await userOrdersRes.json();

  if (userOrders && typeof userOrders === 'object') {
    for (const key in userOrders) {
      if (userOrders[key].orderId === orderId) {
        const updateUrl = `${dbUrl}/userOrders/${userId}/${key}.json?auth=${secret}`;
        console.log('Found user order with key:', key, ' updating at:', updateUrl);

        const patchRes = await fetch(updateUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        if (patchRes.ok) {
          console.log('✅ User order updated via search');
        } else {
          console.error('❌ Failed to update user order via search, status:', patchRes.status);
        }
        return;
      }
    }
    console.warn('⚠️ No matching user order found for userId:', userId, 'orderId:', orderId);
  } else {
    console.warn('⚠️ No userOrders found for userId:', userId);
  }
}
