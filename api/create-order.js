const admin = require("firebase-admin");

// আপনার Firebase service account JSON (আপনার দেওয়া)
const serviceAccount = {
  type: "service_account",
  project_id: "easy-premium",
  private_key_id: "your-private-key-id", // আপনার actual key ID দিন
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: "your-client-id",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_EMAIL?.replace('@', '%40').replace('.', '%2E') + "/metadata/x509/",
  universe_domain: "googleapis.com"
};

// Firebase Initialization
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://easy-premium-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}
const db = admin.database();

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.RELOGRADE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'RELOGRADE_API_KEY not configured' });

  const { productSlug, amount, paymentCurrency, reference, faceValue } = req.body;

  if (!productSlug || !amount || !paymentCurrency) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const amountInt = parseInt(amount);
  if (isNaN(amountInt) || amountInt <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive integer' });
  }

  try {
    // Create items array
    const items = [{
      productSlug,
      amount: amountInt
    }];

    if (faceValue !== undefined && faceValue !== null) {
      const faceValueNum = parseFloat(faceValue);
      if (!isNaN(faceValueNum) && faceValueNum > 0) {
        items[0].faceValue = faceValueNum;
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

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error(`Relograde API returned non-JSON: ${responseText.substring(0, 200)}`);
    }

    if (!response.ok) {
      throw new Error(data.error || `Relograde API error ${response.status}`);
    }

    const relogradeTrx = data.trx;

    // Parse reference
    const refParts = reference ? reference.split('|') : [];
    let paymentMethod = '', phone = '', txid = '', userId = '', email = '';
    refParts.forEach(part => {
      if (part.startsWith('Phone:')) phone = part.replace('Phone:', '');
      else if (part.startsWith('TXID:')) txid = part.replace('TXID:', '');
      else if (part.startsWith('UserID:')) userId = part.replace('UserID:', '');
      else if (part.startsWith('Email:')) email = part.replace('Email:', '');
      else if (['BKASH', 'NAGAD', 'ROCKET'].includes(part)) paymentMethod = part;
    });

    // Save to Firebase
    const firebaseOrderRef = db.ref('transactions').push();
    const firebaseOrderKey = firebaseOrderRef.key;

    await firebaseOrderRef.set({
      orderId: firebaseOrderKey,
      relogradeTrx: relogradeTrx,
      productSlug: productSlug,
      amount: amountInt,
      paymentCurrency: paymentCurrency,
      faceValue: faceValue || null,
      paymentMethod: paymentMethod,
      phoneNumber: phone,
      transactionId: txid,
      userId: userId,
      userEmail: email,
      status: 'pending',
      createdAt: admin.database.ServerValue.TIMESTAMP
    });

    // Save to RelogradeOrders node
    await db.ref(`RelogradeOrders/${relogradeTrx}`).set({
      OrderId: firebaseOrderKey,
      PaymentMethods: paymentMethod,
      PaymentNumber: phone,
      PaymentTrxID: txid,
      Time: admin.database.ServerValue.TIMESTAMP,
      email: email,
      platformId: productSlug,
      uid: userId
    });

    res.status(200).json({ 
      ...data, 
      firebaseOrderKey: firebaseOrderKey,
      message: 'Order saved to Firebase successfully' 
    });

  } catch (error) {
    console.error('Error creating order:', error.message);
    res.status(500).json({ error: error.message });
  }
}
