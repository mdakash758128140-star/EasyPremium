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

    // Voucher Code বের করা (Regex)
    let voucherCode = null;
    const voucherMatch = html.match(/Your Voucher Code\s*<\/?\w+>\s*([^\s<]+)/);
    if (voucherMatch) voucherCode = voucherMatch[1];

    // Serial Code বের করা
    let serialCode = null;
    const serialMatch = html.match(/Serial Code:\s*([^\s<]+)/);
    if (serialMatch) serialCode = serialMatch[1];

    // প্রোডাক্ট নাম (ঐচ্ছিক)
    let productName = null;
    const nameMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>|class="[^"]*card-name[^"]*"[^>]*>([^<]+)/);
    if (nameMatch) productName = nameMatch[1] || nameMatch[2];

    // পরিমাণ (ঐচ্ছিক)
    let amount = null;
    const amountMatch = html.match(/#\s*(\d+(?:\.\d+)?)/);
    if (amountMatch) amount = amountMatch[1];

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
