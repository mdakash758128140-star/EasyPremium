export default async function handler(req, res) {
  // CORS হেডার
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS প্রি-ফ্লাইট হ্যান্ডেল
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // শুধু POST অনুমোদিত
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      status: 'error', 
      message: 'Method not allowed. Only POST requests are accepted.' 
    });
  }

  try {
    const payload = req.body;
    console.log('📥 Webhook received:', payload);

    // আপনার লজিক এখানে
    if (payload.event === 'ORDER_FINISHED') {
      const { trx, reference } = payload.data || {};
      console.log(`✅ Order ${trx} finished. Ref: ${reference}`);
    }

    return res.status(200).json({
      status: 'success',
      message: 'Webhook received',
      receivedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
