import admin from 'firebase-admin';

// Initialize Firebase Admin SDK only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.RELOGRADE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'RELOGRADE_API_KEY not configured' });

  // Extract fields from request body
  const {
    productSlug,
    amount,
    paymentCurrency,
    reference,
    faceValue,
    // New fields for Firebase
    email,
    uid,
    platformId,
  } = req.body;

  if (!productSlug || !amount || !paymentCurrency) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!email || !uid) {
    return res.status(400).json({ error: 'email and uid are required' });
  }

  const amountInt = parseInt(amount);
  if (isNaN(amountInt) || amountInt <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive integer' });
  }

  try {
    // Build items array for Relograde
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

    // Call Relograde API
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

    const relogradeData = await response.json();

    // --- Save order to Firebase Realtime Database ---
    const ordersRef = db.ref('RelogradeOrders');
    const newOrderRef = ordersRef.push(); // generate unique key

    // Map Relograde response fields (adjust according to actual API response)
    // Common fields might be: paymentMethod, paymentNumber, transactionId, etc.
    const paymentMethod = relogradeData.paymentMethod || 'unknown';
    const paymentNumber = relogradeData.paymentNumber || '';
    const paymentTrxId = relogradeData.transactionId || relogradeData.paymentTrxId || '';

    const orderData = {
      OrderId: newOrderRef.key,                // Firebase generated key
      PaymentMethods: paymentMethod,
      PaymentNumber: paymentNumber,
      PaymentTrxID: paymentTrxId,
      Time: admin.database.ServerValue.TIMESTAMP, // server timestamp
      email: email,
      platformId: platformId || '',
      uid: uid,
    };

    await newOrderRef.set(orderData);

    // Optionally attach the Firebase key to the response
    relogradeData.firebaseOrderId = newOrderRef.key;

    res.status(200).json(relogradeData);
  } catch (error) {
    console.error('Error creating order:', error.message);
    res.status(500).json({ error: error.message });
  }
}
