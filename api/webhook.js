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

      // Firebase configuration from environment variables
      const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL; // e.g. https://your-project.firebaseio.com/
      const FIREBASE_SECRET = process.env.FIREBASE_SECRET; // Your database secret (legacy) or OAuth token

      if (!FIREBASE_DATABASE_URL || !FIREBASE_SECRET) {
        console.error('Missing Firebase config');
        return res.status(500).json({ error: 'Firebase not configured' });
      }

      // Fetch voucher data from Relograde API
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

      // 1. Update transaction node
      // First, find transaction by orderId
      const findUrl = `${FIREBASE_DATABASE_URL}/transactions.json?orderBy="orderId"&equalTo="${firebaseOrderId}"&auth=${FIREBASE_SECRET}`;
      const findRes = await fetch(findUrl);
      const findData = await findRes.json();

      if (findData && typeof findData === 'object') {
        const keys = Object.keys(findData);
        if (keys.length > 0) {
          const transactionKey = keys[0]; // push id
          const updateUrl = `${FIREBASE_DATABASE_URL}/transactions/${transactionKey}.json?auth=${FIREBASE_SECRET}`;
          await fetch(updateUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          });
          console.log(`Transaction ${firebaseOrderId} updated`);
        }
      } else {
        console.warn(`Transaction with orderId ${firebaseOrderId} not found`);
      }

      // 2. Update userOrders node if userId exists
      if (userId) {
        // Direct update using key (since userOrders key is same as transaction push id)
        const userOrderUrl = `${FIREBASE_DATABASE_URL}/userOrders/${userId}/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
        const checkRes = await fetch(userOrderUrl);
        if (checkRes.status === 200) {
          await fetch(userOrderUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed' }), // optionally include voucherData if needed
          });
          console.log(`User order ${firebaseOrderId} updated`);
        } else {
          console.warn(`User order not found for userId ${userId}`);
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
