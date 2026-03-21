// api/get-voucher.js
import { load } from 'cheerio';

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
    const $ = load(html);

    // --- Serial Code: "Serial Code:" এর পরে থাকা টেক্সট
    let serialCode = null;
    const serialElem = $('*:contains("Serial Code:")').first();
    if (serialElem.length) {
      serialCode = serialElem.text().replace('Serial Code:', '').trim();
    }
    // যদি সরাসরি না পাওয়া যায়, UUID ফরম্যাট খুঁজুন
    if (!serialCode) {
      const uuidMatch = html.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (uuidMatch) serialCode = uuidMatch[0];
    }

    // --- Voucher Code: "Your Voucher Code" এর নিচের টেক্সট
    let voucherCode = null;
    const voucherElem = $('*:contains("Your Voucher Code")').first();
    if (voucherElem.length) {
      // পরবর্তী এলিমেন্টটি (p, div) থেকে টেক্সট নেওয়া
      let nextElem = voucherElem.next();
      if (nextElem.length) {
        voucherCode = nextElem.text().trim();
      }
      // যদি খালি হয়, তাহলে ভিতরের স্প্যান/ডিভ চেক
      if (!voucherCode) {
        const inner = voucherElem.find('span, div').first();
        if (inner.length) voucherCode = inner.text().trim();
      }
    }
    // স্যান্ডবক্সে ভাউচার কোড না-ও থাকতে পারে, তাই null থাকলে সমস্যা নেই

    // --- প্রোডাক্ট নাম: প্রধান কার্ডের নাম (Visa, Mastercard ইত্যাদি)
    let productName = null;
    // প্রথমে h2 বা h3 যেখানে "Visa"/"Mastercard" আছে
    $('h2, h3').each((i, el) => {
      const text = $(el).text().trim();
      if (text && !text.includes('Redeem') && !text.includes('Instructions')) {
        productName = text;
        return false; // break loop
      }
    });
    // যদি না পাওয়া যায়, তবে card-name ক্লাস খোঁজ
    if (!productName) {
      const cardNameElem = $('[class*="card-name"]').first();
      if (cardNameElem.length) productName = cardNameElem.text().trim();
    }

    // --- মূল্য (Amount): #US$5 অথবা US$5 এর মতো
    let amount = null;
    const amountElem = $('h1, h2, h3, .amount, .price').filter((i, el) => {
      return $(el).text().match(/\$\s*\d+(?:\.\d+)?/);
    }).first();
    if (amountElem.length) {
      const text = amountElem.text();
      const match = text.match(/\$\s*(\d+(?:\.\d+)?)/);
      if (match) amount = `US$${match[1]}`;
    }
    // যদি না পাওয়া যায়, পুরো HTML থেকে regex দিয়ে খুঁজি
    if (!amount) {
      const match = html.match(/#\s*([A-Z]{3}\s*\d+(?:\.\d+)?)/);
      if (match) amount = match[1].trim();
      else {
        const match2 = html.match(/\$\s*(\d+(?:\.\d+)?)/);
        if (match2) amount = `US$${match2[1]}`;
      }
    }

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
