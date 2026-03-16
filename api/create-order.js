// /api/create-order.js
const admin = require('firebase-admin');

// Firebase service account credentials (hardcoded)
const serviceAccount = {
  type: "service_account",
  project_id: "top-up-4db01",
  private_key_id: "b81dee1c4838d80b2b9e7f87635a9f48e0b0e3c2",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDHZQNqntO4VxLU\nxHTsiryWZYBV8oByLX8AzZTx5LA/TeAucMbYtTjbMWgCJAKt8+rkB0aKbZEe0G+d\nystWB2VEe9YMmgTrxai8RxDB715RHpQUPsrrYhcLz2pCWDp9KYYdh39Uxz+fo0rs\njux2E/dBzlmTzlgAhKKd8jyh3onFX4lX9yL1pQ5m2b665L6HA56J29gcLR5x2tb3\nTi7RTcLM0j55l+j0+Pv7IM5ZoiQr+SriStGMYjFeWjzB4rexqQVX7lfXCQwqvQUr\nUBXWdCVld/t9Mk5tuMq+pYCs3flKpDWj1CbTi8j52CqCnFpMIFgm5FJBdiX74HET\niUzGqC9xAgMBAAECggEACATqQQK/wZlw5rE7AZtnz8Wnxm0hGNZ3FeVuwNbBdt5P\nLpb3DFangXtIc1OW7v+RGhgn0F/tNvfLkWVLTbuw6TLwziNwoLnbmizigeY6XRlV\ne8X1u8c/ZYhzPdVWDtwZan0dVB/KUYWL+R0baflOF62woRbqp6St9Ju+MAVm9ZLa\noUfW7tQVj1zuXpWXP8N+C6vAgPv8DMMwkKrde7vgV7jJ2s0g9Mn2JchLIdx5ADW0\nYFWNeFfa7rHMFSIocEEhQU3lizaieSBp7d4SlVubONgcJ4aLOdEXN7/IMDrqg6+n\nt/PN8EACugVT0crWFV8uxqM3MluKQ7WpQuoNrBb3JQKBgQDoZ+erw+8kmtIDrkq9\nxkpPZhBXSP7V/kjdbnGjeU2XUruQ8bax6ipasKAamjeS+o/yLeXlqSsDgxUg5mf7\n4gvLfBM3aLWs8Odk3AYHCwf7C1q+xkOdP5kzuyNEXq/xVVrCWLd0MSVYyYAp2Mr1\nRM1vTncya/eVb09eihFn/KiNVQKBgQDboynvnTo77BUo+FrKQUViKSHbCDZ2aqjw\nAX+zkY+9LkTalqs2Ul9tR9ZmXy2uudQyjsPItrl4o4WGaU8FGeJ52NSPp2Tozcrv\n2lluyURu4RZRK7UMM2kJwmj27pLGjuAT7fETE0P8KzDaHfD5ART6MyrHcTBRWCZu\nShyQAiX5rQKBgGWmtN0bKSlQklVL0aMp7OzHjpQu+E+vFj3MBeZjsz1h0Wp3Xtp4\nuqfKI20fUPl3oKhjzO9jy82QcxhdztOMLm6FSX5tzTDkecFSv0wrVgVHFRzmaUKJ\nQ8AttSI9bCVZmQXyeeNXb6djEyy6hyM6QcTShC5IrRTuh7+pEi3yg+K1AoGBANHA\nOZ1OXr25EOAmhbXfrZ43v9BIQJLH+3vxQn4/hbDaTgEeoHVpJx7a2wK65IqXhvGd\na5X0Ap4WM78QNNmfRaytiRmDeBfn6GU09fGaHlNxe/marvTu5+HdGpavcdZTveTq\neC6KWIOqz6WNsIJsKRdj4/fBva4Ba/oppqtUkeWlAoGBAOTt/wCMAw5mJ80Ir+gd\nKtz5Cy/XWqVRn6R01Kz13vtPJpFfhgqmH9UUu7YD7m5cHMV94BPaN6ggnW/kbBvl\nxfuE/+rZ6iSRO8XSERJhBuAVlAgupYtT0qq7JK/lx75UEpALu3x2zDiYPLL8wShF\n1EGCS8PKsS76pZMQ2EEGgmGv\n-----END PRIVATE KEY-----\n",
  client_email: "firebase-adminsdk-6w6s0@top-up-4db01.iam.gserviceaccount.com",
  client_id: "116763151388769454908",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-6w6s0%40top-up-4db01.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://top-up-4db01-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}
const db = admin.database();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ✅ Relograde API key Vercel Environment Variable থেকে নেওয়া হচ্ছে
  const apiKey = process.env.RELOGRADE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RELOGRADE_API_KEY not configured in Vercel' });
  }

  const { productSlug, amount, paymentCurrency, reference, faceValue } = req.body;

  if (!productSlug || !amount || !paymentCurrency) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const amountInt = parseInt(amount);
  if (isNaN(amountInt) || amountInt <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive integer' });
  }

  try {
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

    const firebaseOrderRef = db.ref('transactions').push();
    const firebaseOrderKey = firebaseOrderRef.key;

    // RelogradeOrders node
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

    // Transactions node
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

    res.status(200).json({ ...data, firebaseOrderKey });

  } catch (error) {
    console.error('Error creating order:', error.message);
    res.status(500).json({ error: error.message });
  }
}
