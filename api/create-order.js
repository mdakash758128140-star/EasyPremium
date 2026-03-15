// api/webhook.js (আপডেটেড ভার্সন)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    console.log('📥 Webhook received:', payload);

    // Relograde থেকে আসা ওয়েবহুক কিনা চেক করুন (IP বা অন্যান্য উপায়ে)
    // ডক্সে IP দেওয়া আছে: 18.195.134.217 (আপনি চাইলে ভেরিফাই করতে পারেন)

    if (payload.event === 'ORDER_FINISHED') {
      const { trx, reference } = payload.data;
      const environment = payload.state;

      // 🔍 এখানে আপনি find-order API কল করে অর্ডারের বিস্তারিত জানতে পারেন (ডক্সের পরামর্শ)
      // যেমন: https://connect.relograde.com/api/1.02/order/{trx}

      // আপনার ডাটাবেসে (Firebase) অর্ডারের স্ট্যাটাস আপডেট করুন
      // যেমন: database.ref('vouchers').orderByChild('trx').equalTo(trx).once('value', ...)

      console.log(`✅ Order ${trx} finished in ${environment} environment.`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
