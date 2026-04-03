// api/trustpilot.js
export default async function handler(req, res) {
  // CORS headers (শুধু ডেভেলপমেন্টের জন্য, প্রোডাকশনে নিজের ডোমেইন দিন)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // আপনার Trustpilot API credentials (এনভায়রনমেন্ট ভেরিয়েবল থেকে নিবে)
  const TRUSTPILOT_API_KEY = process.env.TRUSTPILOT_API_KEY;
  const BUSINESS_UNIT_ID = process.env.TRUSTPILOT_BUSINESS_UNIT_ID;

  try {
    // যদি GET রিকোয়েস্ট হয়, তাহলে ব্যবসার রিভিউ স্ট্যাটাস ফেরত দেবে
    if (req.method === 'GET') {
      if (!TRUSTPILOT_API_KEY) {
        return res.status(401).json({ error: 'TRUSTPILOT_API_KEY not set' });
      }

      // Trustpilot API থেকে সর্বশেষ রিভিউ আনার উদাহরণ
      const url = `https://api.trustpilot.com/v1/business-units/${BUSINESS_UNIT_ID}/reviews?limit=5`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${TRUSTPILOT_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Trustpilot API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      return res.status(200).json({ success: true, reviews: data });
    }

    // যদি POST রিকোয়েস্ট হয়, তাহলে ওয়েবহুক হিসেবে ব্যবহার করা যেতে পারে (ORDER_FINISHED ইভেন্ট)
    if (req.method === 'POST') {
      const payload = req.body;
      console.log('📩 Trustpilot webhook received:', payload);

      // এখানে আপনার লজিক লিখুন (যেমন Firebase আপডেট, ইমেইল পাঠানো)
      // যেমন আগের webhook.js-এর মতো করে ORDER_FINISHED হ্যান্ডল করতে পারেন

      return res.status(200).json({ received: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('❌ Trustpilot API error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
