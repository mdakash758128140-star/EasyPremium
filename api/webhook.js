export default async function handler(req, res) {
  // CORS হেডার
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const payload = req.body;
    console.log('Webhook received:', payload.event);

    // ORDER_FINISHED ইভেন্ট হ্যান্ডেল
    if (payload.event === 'ORDER_FINISHED') {
      const { trx, reference } = payload.data || {};
      console.log(`Order finished: ${trx}, ref: ${reference}`);

      // যদি RELOGRADE_API_KEY থাকে, তাহলে অর্ডার ডিটেলস এনে ভাউচার সংরক্ষণ করুন
      const apiKey = process.env.RELOGRADE_API_KEY;
      if (apiKey && trx) {
        try {
          const orderRes = await fetch(`https://connect.relograde.com/api/1.02/order/${trx}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });

          if (orderRes.ok) {
            const orderDetails = await orderRes.json();
            console.log('Order details:', orderDetails);

            // এখানে Firebase-এ সংরক্ষণ করুন (Firebase অ্যাডমিন SDK প্রয়োজন)
            // উদাহরণ:
            // const admin = require('firebase-admin');
            // if (!admin.apps.length) { admin.initializeApp({...}); }
            // const db = admin.database();
            // await db.ref('vouchers').push({
            //   trx,
            //   voucherCode: orderDetails.voucherCode,
            //   status: 'active',
            //   createdAt: new Date().toISOString(),
            //   ...orderDetails
            // });
          } else {
            console.error('Failed to fetch order details from Relograde');
          }
        } catch (err) {
          console.error('Error fetching order details:', err.message);
        }
      }
    }

    // Relograde কে জানান যে ওয়েবহুক সফলভাবে প্রাপ্ত হয়েছে
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
