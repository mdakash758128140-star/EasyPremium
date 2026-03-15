import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Signature');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const signature = req.headers['x-signature'];
  const secret = process.env.RELOGRADE_WEBHOOK_SECRET;

  if (secret) {
    if (!signature) return res.status(401).json({ message: 'Missing signature' });

    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      return res.status(401).json({ message: 'Invalid signature' });
    }
  }

  try {
    const payload = req.body;
    console.log('Webhook received:', payload.event);

    if (payload.event === 'ORDER_FINISHED') {
      const { trx, reference } = payload.data || {};
      console.log(`Order finished: ${trx}, ref: ${reference}`);

      // সম্পূর্ণ অর্ডার ডিটেইলস আনতে Relograde API কল
      const apiKey = process.env.RELOGRADE_API_KEY;
      if (apiKey && trx) {
        const orderRes = await fetch(`https://connect.relograde.com/api/1.02/order/${trx}`, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (orderRes.ok) {
          const orderDetails = await orderRes.json();
          // এখানে ভাউচার তথ্য বের করে Firebase-এ সংরক্ষণ করুন
          // ধরে নিচ্ছি অর্ডার ডিটেইলসে ভাউচার কোড আছে (Relograde ডক অনুযায়ী)
          const voucherCode = orderDetails.voucherCode || orderDetails.items?.[0]?.voucherCode;

          // Firebase সংরক্ষণ (আপনার ফায়ারবেস অ্যাডমিন SDK ব্যবহার করুন)
          // উদাহরণ:
          // const admin = require('firebase-admin');
          // if (!admin.apps.length) { admin.initializeApp({...}); }
          // const db = admin.database();
          // await db.ref('vouchers').push({
          //   trx,
          //   voucherCode,
          //   status: 'active',
          //   createdAt: new Date().toISOString(),
          //   ...orderDetails
          // });

          console.log('Voucher code:', voucherCode);
        } else {
          console.error('Failed to fetch order details from Relograde');
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
