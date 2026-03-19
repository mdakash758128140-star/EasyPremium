// api/webhook.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const payload = req.body;
    console.log('Webhook received:', payload.event);

    if (payload.event === 'ORDER_FINISHED') {
      const { trx, reference } = payload.data || {};
      console.log(`Order finished: ${trx}, ref: ${reference}`);

      // Parse reference JSON
      let firebaseOrderId = null;
      let userId = null;
      try {
        const refData = JSON.parse(reference);
        firebaseOrderId = refData.firebaseOrderId;
        userId = refData.userId;
        console.log(`Parsed: firebaseOrderId=${firebaseOrderId}, userId=${userId}`);
      } catch (e) {
        console.error('Failed to parse reference JSON:', e);
        return res.status(200).json({ received: true, warning: 'Invalid reference' });
      }

      if (!firebaseOrderId) {
        console.warn('firebaseOrderId missing');
        return res.status(200).json({ received: true, warning: 'No firebaseOrderId' });
      }

      // Firebase configuration
      const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
      const FIREBASE_SECRET = process.env.FIREBASE_SECRET; // Legacy secret or token

      if (!FIREBASE_DATABASE_URL || !FIREBASE_SECRET) {
        console.error('Missing Firebase config');
        return res.status(500).json({ error: 'Firebase not configured' });
      }

      // Fetch voucher data from Relograde
      const apiKey = process.env.RELOGRADE_API_KEY;
      let voucherData = null;
      if (apiKey && trx) {
        try {
          const orderRes = await fetch(`https://connect.relograde.com/api/1.02/order/${trx}`, {
            headers: { Authorization: `Bearer ${apiKey}` }
          });
          if (orderRes.ok) {
            const orderDetails = await orderRes.json();
            console.log('Order details from Relograde:', orderDetails);
            voucherData = {
              voucherLink: orderDetails.voucherLink || orderDetails.voucherUrl || null,
              voucherCode: orderDetails.voucherCode || null,
            };
          } else {
            console.error('Failed to fetch order details from Relograde');
          }
        } catch (err) {
          console.error('Error fetching order details:', err.message);
        }
      }

      // Prepare update data
      const updates = {
        status: 'completed',
        completedAt: new Date().toISOString(),
      };
      if (voucherData) {
        updates.voucherData = voucherData;
      }

      // 1. Update transaction node by finding the transaction with matching orderId
      const findUrl = `${FIREBASE_DATABASE_URL}/transactions.json?orderBy="orderId"&equalTo="${firebaseOrderId}"&auth=${FIREBASE_SECRET}`;
      const findRes = await fetch(findUrl);
      const findData = await findRes.json();

      if (findData && typeof findData === 'object') {
        const keys = Object.keys(findData);
        if (keys.length > 0) {
          const transactionKey = keys[0]; // push key
          const updateUrl = `${FIREBASE_DATABASE_URL}/transactions/${transactionKey}.json?auth=${FIREBASE_SECRET}`;
          await fetch(updateUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          });
          console.log(`Transaction ${firebaseOrderId} updated`);

          // 2. Update userOrders node (if userId exists)
          if (userId) {
            // In your structure, userOrders[userId] uses the same key as transaction key
            const userOrderUrl = `${FIREBASE_DATABASE_URL}/userOrders/${userId}/${transactionKey}.json?auth=${FIREBASE_SECRET}`;
            const userCheck = await fetch(userOrderUrl);
            if (userCheck.status === 200) {
              // Update status, optionally voucherData
              const userUpdates = { status: 'completed' };
              if (voucherData) {
                userUpdates.voucherData = voucherData; // if you want to store voucher also in userOrders
              }
              await fetch(userOrderUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userUpdates),
              });
              console.log(`User order ${transactionKey} updated for user ${userId}`);
            } else {
              console.warn(`User order not found for userId ${userId} with key ${transactionKey}`);
            }
          }
        } else {
          console.warn(`No transaction found with orderId ${firebaseOrderId}`);
        }
      } else {
        console.warn(`Transaction search failed or no data`);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
