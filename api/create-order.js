// Firebase Admin SDK সেটআপ (আপনার প্রজেক্টের service account JSON ব্যবহার করুন)
const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    databaseURL: "https://easy-premium-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}
const db = admin.database();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.RELOGRADE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'RELOGRADE_API_KEY not configured' });

  // ফ্রন্টএন্ড থেকে আসা ডাটা
  const { productSlug, amount, paymentCurrency, reference, faceValue } = req.body;

  if (!productSlug || !amount || !paymentCurrency) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const amountInt = parseInt(amount);
  if (isNaN(amountInt) || amountInt <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive integer' });
  }

  try {
    // Relograde API-র জন্য রিকোয়েস্ট বডি তৈরি
    const items = [{
      productSlug,
      amount: amountInt
    }];

    if (faceValue !== undefined && faceValue !== null) {
      const faceValueNum = parseFloat(faceValue);
      if (!isNaN(faceValueNum) && faceValueNum > 0) {
        items[0].faceValue = faceValueNum;
      } else {
        return res.status(400).json({ error: 'Face value must be a positive number' });
      }
    }

    const requestBody = {
      items,
      paymentCurrency: paymentCurrency.toLowerCase(),
      reference: reference || `order_${Date.now()}`
    };

    // Relograde API-তে অর্ডার তৈরি
    const response = await fetch('https://connect.relograde.com/api/1.02/order', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Relograde API responded with status ${response.status}: ${errorText}`);
    }

    const data = await response.json(); // এখানে Relograde এর সম্পূর্ণ রেসপন্স, যার মধ্যে trx আছে
    const relogradeTrx = data.trx; // যেমন "RELOFZQSPOB8RQ3P42K"

    // ========== Firebase-এ RelogradeOrders নোডে ডাটা সংরক্ষণ ==========
    // reference স্ট্রিং থেকে প্রয়োজনীয় তথ্য বের করুন (যে ফরম্যাটে ফ্রন্টএন্ড পাঠিয়েছে)
    // ধরে নিচ্ছি reference ফরম্যাট: "METHOD|Phone:xxxx|TXID:xxxx|UserID:xxxx|Email:xxxx"
    const refParts = reference ? reference.split('|') : [];
    let paymentMethod = '', phone = '', txid = '', userId = '', email = '';

    refParts.forEach(part => {
      if (part.startsWith('Phone:')) phone = part.replace('Phone:', '');
      else if (part.startsWith('TXID:')) txid = part.replace('TXID:', '');
      else if (part.startsWith('UserID:')) userId = part.replace('UserID:', '');
      else if (part.startsWith('Email:')) email = part.replace('Email:', '');
      else if (['BKASH', 'NAGAD', 'ROCKET'].includes(part)) paymentMethod = part;
    });

    // ফায়ারবেসে আগে থেকে তৈরি ট্রানজেকশন এর key (আমরা ফ্রন্টএন্ড থেকে পাইনি, তাই এখানে নতুন করে জেনারেট করা হচ্ছে)
    // তবে আপনি যদি ফ্রন্টএন্ডে ইতিমধ্যে transactions নোডে ডাটা সংরক্ষণ করে থাকেন, তাহলে সেই key টি reference এ পাঠাতে পারেন।
    // এখানে আমরা একটি নতুন key জেনারেট করে নিচ্ছি এবং transactions নোডেও ডাটা রাখতে পারি (ঐচ্ছিক)।
    const firebaseOrderRef = db.ref('transactions').push();
    const firebaseOrderKey = firebaseOrderRef.key;

    // RelogradeOrders নোডে ডাটা সেভ
    await db.ref(`RelogradeOrders/${relogradeTrx}`).set({
      OrderId: firebaseOrderKey,           // ফায়ারবেসের অর্ডার আইডি
      PaymentMethods: paymentMethod,
      PaymentNumber: phone,
      PaymentTrxID: txid,
      Time: admin.database.ServerValue.TIMESTAMP,
      email: email,
      platformId: productSlug,             // অথবা অন্য কোনো প্ল্যাটফর্ম আইডি
      uid: userId
    });

    // (ঐচ্ছিক) transactions নোডেও ডাটা রাখতে পারেন
    await firebaseOrderRef.set({
      trx: relogradeTrx,
      productSlug,
      amount: amountInt,
      paymentCurrency,
      reference,
      faceValue: faceValue || null,
      userId,
      userEmail: email,
      status: 'pending',
      createdAt: admin.database.ServerValue.TIMESTAMP
    });

    // সফল রেসপন্স
    res.status(200).json({
      ...data,
      firebaseOrderKey  // ফ্রন্টএন্ডকে জানাতে পারেন (যদি প্রয়োজন হয়)
    });

  } catch (error) {
    console.error('Error creating order:', error.message);
    res.status(500).json({ error: error.message });
  }
}
