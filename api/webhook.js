// api/webhook.js
export default async function handler(req, res) {
  // CORS হেডার (যদিও ওয়েবহুক সাধারণত POST আসে, তবুও রাখা ভালো)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      status: 'error', 
      message: 'Method not allowed. Only POST requests are accepted.' 
    });
  }

  try {
    const payload = req.body;
    console.log('📥 Webhook received:', payload);

    // ORDER_FINISHED ইভেন্ট হ্যান্ডেল
    if (payload.event === 'ORDER_FINISHED') {
      const { trx, reference } = payload.data || {};
      console.log(`✅ Order ${trx} finished. Reference: ${reference}`);

      // এখানে আপনি Find Order API কল করে বিস্তারিত এনে ডাটাবেস আপডেট করতে পারেন
      // উদাহরণস্বরূপ, নিচের লাইনগুলো সক্রিয় করতে পারেন (apiKey প্রয়োজন)
      /*
      const apiKey = process.env.RELOGRADE_API_KEY;
      const orderRes = await fetch(`https://connect.relograde.com/api/1.02/order/${trx}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const orderDetails = await orderRes.json();
      console.log('Order details:', orderDetails);
      // এখন orderDetails থেকে ভাউচার কোড বের করে ফায়ারবেসে সংরক্ষণ করুন
      */
    }

    // Relograde রেসপন্স উপেক্ষা করে, তাই শুধু 200 দিন
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
