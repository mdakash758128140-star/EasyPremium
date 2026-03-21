// api/get-voucher.js
import { load } from 'cheerio';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  try {
    const url = `https://reward.relograde.com/${token}`;
    const response = await fetch(url);
    const html = await response.text();

    const $ = load(html);

    // Voucher Code বের করার চেষ্টা (পৃষ্ঠার কাঠামো অনুযায়ী)
    let voucherCode = null;
    const voucherDiv = $('div:contains("Your Voucher Code")');
    if (voucherDiv.length) {
      voucherCode = voucherDiv.next().text().trim();
    }
    if (!voucherCode) {
      // regex fallback
      const match = html.match(/Your Voucher Code\s*<\/?\w+>\s*([^\s<]+)/);
      if (match) voucherCode = match[1];
    }

    // Serial Code বের করার চেষ্টা
    let serialCode = null;
    const serialElem = $('div:contains("Serial Code:")');
    if (serialElem.length) {
      serialCode = serialElem.text().replace('Serial Code:', '').trim();
    }
    if (!serialCode) {
      const match = html.match(/Serial Code:\s*([^\s<]+)/);
      if (match) serialCode = match[1];
    }

    // প্রোডাক্টের নাম ও মূল্য (ঐচ্ছিক)
    let productName = null;
    const productElem = $('h2, .product-name, .card-name');
    if (productElem.length) productName = productElem.first().text().trim();

    let amount = null;
    const amountElem = $('.amount, .price, .face-value');
    if (amountElem.length) amount = amountElem.first().text().trim();

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
    console.error('Error fetching voucher:', error);
    res.status(500).json({ error: error.message });
  }
}
