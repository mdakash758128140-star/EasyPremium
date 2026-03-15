// api/webhook.js
export default async function handler(req, res) {
  // CORS হেডার
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS প্রি-ফ্লাইট অনুরোধ হ্যান্ডেল করুন
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // শুধুমাত্র POST অনুরোধ অনুমোদিত
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      status: 'error', 
      message: 'Method not allowed. Only POST requests are accepted.' 
    });
  }

  try {
    // বডি থেকে ডেটা গ্রহণ
    const payload = req.body;
    console.log('📥 Webhook received:', payload);

    // 🔍 এখানে আপনি পেলোড অনুযায়ী লজিক যোগ করতে পারেন
    // যেমন: ইভেন্ট টাইপ চেক করা, ডাটাবেস আপডেট করা ইত্যাদি
    if (payload.event === 'ORDER_FINISHED') {
      const { trx, reference } = payload.data || {};
      console.log(`✅ Order ${trx} finished. Reference: ${reference}`);
      
      // আপনার ফায়ারবেসে অর্ডারের স্ট্যাটাস আপডেট করার লজিক এখানে বসাতে পারেন
      // যেমন: database.ref('vouchers').orderByChild('trx').equalTo(trx).once('value', ...)
    }

    // সফল রেসপন্স
    return res.status(200).json({
      status: 'success',
      message: 'Webhook received successfully',
      receivedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      error: error.message
    });
  }
}
