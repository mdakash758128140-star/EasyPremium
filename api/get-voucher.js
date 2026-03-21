// api/get-voucher.js (আপডেটেড ভার্সন)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  try {
    const url = `https://reward.relograde.com/${token}`;
    const response = await fetch(url);
    const html = await response.text();

    // --- Serial Code ---
    let serialCode = null;
    // প্যাটার্ন ১: Serial Code: এর পর যেকোনো অ-স্পেস অক্ষর
    let match = html.match(/Serial Code:\s*([^\s<]+)/);
    if (match) serialCode = match[1];

    // প্যাটার্ন ২: যদি না পাওয়া যায়, তাহলে UUID ফরম্যাট খোঁজ (xxxx-xxxx-...)
    if (!serialCode) {
      match = html.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (match) serialCode = match[0];
    }

    // --- Voucher Code ---
    let voucherCode = null;
    // প্যাটার্ন ১: Your Voucher Code এর পরবর্তী শব্দ (অ-স্পেস অক্ষর)
    match = html.match(/Your Voucher Code\s*<\/?\w+>\s*([^\s<]+)/);
    if (match) voucherCode = match[1];

    // প্যাটার্ন ২: কখনও কখনও কোডটি আলাদা ডিভিতে থাকে
    if (!voucherCode) {
      match = html.match(/voucher-code["']?>\s*([^<]+)/i);
      if (match) voucherCode = match[1].trim();
    }

    // --- প্রোডাক্ট নাম (যেমন Mastercard, Visa) ---
    let productName = null;
    // পৃষ্ঠায় h2 বা .card-name এর মধ্যে নাম থাকে
    match = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
    if (match) productName = match[1].trim();

    // যদি h2 না পাওয়া যায়, তাহলে অন্য প্যাটার্ন
    if (!productName || productName === 'Redeem Instructions') {
      match = html.match(/class="[^"]*card-name[^"]*"[^>]*>([^<]+)/i);
      if (match) productName = match[1].trim();
    }

    // --- মূল্য (Amount) ---
    let amount = null;
    // পৃষ্ঠায় #US$5 বা US$5 এর মতো লেখা থাকে
    match = html.match(/#\s*([A-Z]{3}\s*\d+(?:\.\d+)?)/);
    if (match) amount = match[1].trim();

    if (!amount) {
      match = html.match(/\$\s*(\d+(?:\.\d+)?)/);
      if (match) amount = `US$${match[1]}`;
    }

    // --- ফাইনাল রেসপন্স ---
    res.status(200).json({
      success: true,
      voucherCode,
      serialCode,
      productName,
      amount,
      token,
      url
    });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
