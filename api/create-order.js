import admin from 'firebase-admin';

// Firebase initialization with detailed error logging
let firebaseInitialized = false;
let firebaseInitError = null;

function initFirebase() {
  if (firebaseInitialized) return true;
  if (firebaseInitError) throw firebaseInitError;

  try {
    console.log('Checking Firebase env vars...');
    if (!process.env.FIREBASE_PROJECT_ID) throw new Error('Missing FIREBASE_PROJECT_ID');
    if (!process.env.FIREBASE_PRIVATE_KEY) throw new Error('Missing FIREBASE_PRIVATE_KEY');
    if (!process.env.FIREBASE_CLIENT_EMAIL) throw new Error('Missing FIREBASE_CLIENT_EMAIL');
    if (!process.env.FIREBASE_DATABASE_URL) throw new Error('Missing FIREBASE_DATABASE_URL');

    // Handle private key formatting
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    console.log('Initializing Firebase Admin...');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: privateKey,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });

    console.log('Firebase initialized successfully');
    firebaseInitialized = true;
    return true;
  } catch (error) {
    console.error('Firebase init error:', error.message);
    firebaseInitError = error;
    throw error;
  }
}

export default async function handler(req, res) {
  // Set JSON content type early to avoid Vercel default error page
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize Firebase (throws if fails)
    initFirebase();

    // Check Relograde API key
    const apiKey = process.env.RELOGRADE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'RELOGRADE_API_KEY not configured' });
    }

    const {
      productSlug,
      amount,
      paymentCurrency,
      reference,
      faceValue,
      email,
      uid,
      platformId,
    } = req.body;

    // Validate required fields
    if (!productSlug || !amount || !paymentCurrency) {
      return res.status(400).json({ error: 'Missing required fields: productSlug, amount, paymentCurrency' });
    }
    if (!email || !uid) {
      return res.status(400).json({ error: 'email and uid are required' });
    }

    const amountInt = parseInt(amount);
    if (isNaN(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive integer' });
    }

    // Build items array
    const items = [{
      productSlug,
      amount: amountInt,
    }];

    if (faceValue !== undefined && faceValue !== null) {
      const faceValueNum = parseFloat(faceValue);
      if (isNaN(faceValueNum) || faceValueNum <= 0) {
        return res.status(400).json({ error: 'Face value must be a positive number' });
      }
      items[0].faceValue = faceValueNum;
    }

    const requestBody = {
      items,
      paymentCurrency: paymentCurrency.toLowerCase(),
      reference: reference || `order_${Date.now()}`,
    };

    console.log('Calling Relograde API with body:', JSON.stringify(requestBody));

    // Call Relograde API
    const relogradeRes = await fetch('https://connect.relograde.com/api/1.02/order', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!relogradeRes.ok) {
      const errorText = await relogradeRes.text();
      console.error('Relograde API error:', relogradeRes.status, errorText);
      throw new Error(`Relograde API error (${relogradeRes.status}): ${errorText}`);
    }

    const relogradeData = await relogradeRes.json();
    console.log('Relograde response:', relogradeData);

    // Save to Firebase
    try {
      const db = admin.database();
      const ordersRef = db.ref('RelogradeOrders');
      const newOrderRef = ordersRef.push();

      // Map payment fields from Relograde response – adjust field names as needed
      const paymentMethod = relogradeData.paymentMethod || relogradeData.payment_method || 'unknown';
      const paymentNumber = relogradeData.paymentNumber || relogradeData.payment_number || '';
      const paymentTrxId = relogradeData.transactionId || relogradeData.paymentTrxId || relogradeData.trxId || '';

      const orderData = {
        OrderId: newOrderRef.key,
        PaymentMethods: paymentMethod,
        PaymentNumber: paymentNumber,
        PaymentTrxID: paymentTrxId,
        Time: admin.database.ServerValue.TIMESTAMP,
        email: email,
        platformId: platformId || '',
        uid: uid,
      };

      await newOrderRef.set(orderData);
      console.log('Order saved to Firebase with key:', newOrderRef.key);

      // Optionally attach firebaseOrderId to response
      relogradeData.firebaseOrderId = newOrderRef.key;
    } catch (fbError) {
      console.error('Firebase save error:', fbError.message);
      // We still return the Relograde data even if Firebase save fails, but we log the error
      relogradeData.firebaseError = fbError.message;
    }

    return res.status(200).json(relogradeData);
  } catch (error) {
    console.error('Unhandled API error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
