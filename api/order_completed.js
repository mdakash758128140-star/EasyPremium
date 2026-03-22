// api/create-order.js
// Relograde Order Creation API - With Auto Confirm

const RELOGRADE_API_URL = 'https://connect.relograde.com/api/1.02';
const RELOGRADE_API_KEY = process.env.RELOGRADE_API_KEY;

// Helper function for Relograde API calls
async function callRelogradeAPI(endpoint, method, data = null) {
  const url = `${RELOGRADE_API_URL}/${endpoint}`;
  const options = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RELOGRADE_API_KEY}`,
      'Accept': 'application/json'
    }
  };
  
  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(data);
  }
  
  console.log(`📤 Relograde API: ${method} ${url}`);
  
  try {
    const response = await fetch(url, options);
    const result = await response.json();
    
    console.log(`📥 Response Status: ${response.status}`);
    console.log(`📥 Response Data:`, JSON.stringify(result, null, 2));
    
    if (!response.ok) {
      throw new Error(result.message || `API error: ${response.status}`);
    }
    
    return { success: true, data: result };
  } catch (error) {
    console.error('❌ Relograde API error:', error);
    return { success: false, error: error.message };
  }
}

// 🔥 Confirm Order Function - এটা সবচেয়ে গুরুত্বপূর্ণ
async function confirmOrder(trx) {
  console.log(`🔔 Confirming order: ${trx}`);
  
  const confirmResult = await callRelogradeAPI(`order/confirm/${trx}`, 'PATCH');
  
  if (!confirmResult.success) {
    console.error('❌ Confirm order failed:', confirmResult.error);
    return { success: false, error: confirmResult.error };
  }
  
  const orderData = confirmResult.data;
  console.log(`✅ Order confirmed! Status: ${orderData.orderStatus}`);
  
  // Extract voucher data if order is finished
  let voucherData = null;
  let voucherCodes = [];
  let voucherLinks = [];
  
  if (orderData.orderStatus === 'finished' && orderData.items) {
    for (const item of orderData.items) {
      if (item.orderLines && item.orderLines.length > 0) {
        for (const line of item.orderLines) {
          if (line.voucherCode) {
            voucherCodes.push(line.voucherCode);
            voucherLinks.push(`https://reward.relograde.com/${line.voucherCode}`);
            voucherData = {
              codes: voucherCodes,
              links: voucherLinks,
              serials: line.voucherSerial,
              expiredDate: line.voucherDateExpired
            };
          }
        }
      }
    }
  }
  
  return { 
    success: true, 
    data: orderData,
    isFinished: orderData.orderStatus === 'finished',
    isPending: orderData.orderStatus === 'pending',
    voucherData: voucherData,
    voucherCodes: voucherCodes,
    voucherLinks: voucherLinks
  };
}

// Firebase Database helper (REST API)
async function saveToFirebase(firebaseOrderId, orderData, userId, confirmResult) {
  const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
  const FIREBASE_SECRET = process.env.FIREBASE_SECRET;
  
  if (!FIREBASE_DATABASE_URL || !FIREBASE_SECRET) {
    console.warn('Firebase not configured, skipping save');
    return { success: false, error: 'Firebase not configured' };
  }
  
  try {
    const timestamp = new Date().toISOString();
    
    // Extract voucher data from confirmed order
    let voucherCodes = [];
    let voucherLinks = [];
    let voucherSerials = [];
    
    if (confirmResult && confirmResult.data && confirmResult.data.items) {
      for (const item of confirmResult.data.items) {
        if (item.orderLines && item.orderLines.length > 0) {
          for (const line of item.orderLines) {
            if (line.voucherCode) {
              voucherCodes.push(line.voucherCode);
              voucherLinks.push(`https://reward.relograde.com/${line.voucherCode}`);
              voucherSerials.push(line.voucherSerial);
            }
          }
        }
      }
    }
    
    // Save to transactions
    const transactionData = {
      orderId: firebaseOrderId,
      userId: userId,
      status: confirmResult?.data?.orderStatus || orderData.orderStatus || 'pending',
      createdAt: timestamp,
      relogradeTrx: orderData.trx,
      relogradeData: orderData,
      amount: orderData.priceAmount || 0,
      currency: orderData.priceCurrency || 'USD',
      items: orderData.items || [],
      voucherCodes: voucherCodes,
      voucherLinks: voucherLinks,
      voucherSerials: voucherSerials,
      isFinished: confirmResult?.isFinished || false,
      confirmStatus: confirmResult?.data?.orderStatus || 'pending'
    };
    
    const transactionUrl = `${FIREBASE_DATABASE_URL}/transactions/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
    const transactionRes = await fetch(transactionUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transactionData)
    });
    
    if (!transactionRes.ok) {
      throw new Error('Failed to save transaction');
    }
    
    // Save to userOrders
    if (userId) {
      const userOrderData = {
        orderId: firebaseOrderId,
        status: confirmResult?.data?.orderStatus || orderData.orderStatus || 'pending',
        createdAt: timestamp,
        amount: orderData.priceAmount || 0,
        currency: orderData.priceCurrency || 'USD',
        items: orderData.items || [],
        voucherCodes: voucherCodes,
        voucherLinks: voucherLinks,
        voucherSerials: voucherSerials,
        relogradeTrx: orderData.trx,
        isFinished: confirmResult?.isFinished || false
      };
      
      const userOrderUrl = `${FIREBASE_DATABASE_URL}/userOrders/${userId}/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
      const userOrderRes = await fetch(userOrderUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userOrderData)
      });
      
      if (!userOrderRes.ok) {
        console.warn('Failed to save user order');
      }
    }
    
    console.log(`✅ Order saved to Firebase: ${firebaseOrderId}`);
    return { success: true };
    
  } catch (error) {
    console.error('Firebase save error:', error);
    return { success: false, error: error.message };
  }
}

// Main handler
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }
  
  try {
    const { userId, productSlug, amount, price, reference, customerInfo } = req.body;
    
    // Validate required fields
    if (!userId || !productSlug || !amount || !price) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, productSlug, amount, price are required'
      });
    }
    
    // Generate unique order ID
    const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const firebaseOrderId = orderId;
    
    // Prepare Relograde order data
    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || 'https://easy-premium.com';
    
    const relogradeOrderData = {
      items: [
        {
          productSlug: productSlug,
          amount: parseInt(amount),
          priceAmount: parseFloat(price),
          priceCurrency: 'USD'
        }
      ],
      reference: JSON.stringify({
        firebaseOrderId: firebaseOrderId,
        userId: userId,
        timestamp: new Date().toISOString()
      }),
      successUrl: `${BASE_URL}/success?orderId=${firebaseOrderId}`,
      cancelUrl: `${BASE_URL}/cancel?orderId=${firebaseOrderId}`,
      webhookUrl: `${BASE_URL}/api/webhook`,
      customerEmail: customerInfo?.email || null,
      customerName: customerInfo?.name || null
    };
    
    console.log('📦 Creating Relograde order:', JSON.stringify(relogradeOrderData, null, 2));
    
    // ========== STEP 1: Create Order ==========
    const createResult = await callRelogradeAPI('order', 'POST', relogradeOrderData);
    
    if (!createResult.success) {
      throw new Error(createResult.error || 'Failed to create order in Relograde');
    }
    
    const createdOrder = createResult.data;
    const relogradeTrx = createdOrder.trx;
    console.log(`✅ Order created with TRX: ${relogradeTrx}`);
    
    // ========== STEP 2: 🔥 CONFIRM ORDER (IMPORTANT) ==========
    console.log(`🔄 Confirming order ${relogradeTrx}...`);
    const confirmResult = await confirmOrder(relogradeTrx);
    
    let finalOrderData = createdOrder;
    let orderStatus = 'created';
    let isFinished = false;
    let voucherCodes = [];
    let voucherLinks = [];
    
    if (confirmResult.success) {
      finalOrderData = confirmResult.data;
      orderStatus = confirmResult.data.orderStatus;
      isFinished = confirmResult.isFinished;
      voucherCodes = confirmResult.voucherCodes || [];
      voucherLinks = confirmResult.voucherLinks || [];
      console.log(`✅ Order confirmed! Status: ${orderStatus}, Finished: ${isFinished}`);
      
      if (voucherCodes.length > 0) {
        console.log(`🎫 Voucher codes received:`, voucherCodes);
      }
    } else {
      console.warn('⚠️ Order confirmation failed, but order was created. Webhook will handle later.');
    }
    
    // ========== STEP 3: Save to Firebase ==========
    const firebaseResult = await saveToFirebase(firebaseOrderId, finalOrderData, userId, confirmResult);
    
    if (!firebaseResult.success) {
      console.warn('Firebase save failed but order created:', firebaseResult.error);
    }
    
    // ========== STEP 4: Return Response ==========
    return res.status(200).json({
      success: true,
      data: {
        orderId: firebaseOrderId,
        relogradeTrx: relogradeTrx,
        paymentUrl: createdOrder.paymentUrl || createdOrder.url,
        status: orderStatus,
        isFinished: isFinished,
        amount: parseFloat(price),
        currency: 'USD',
        voucherCodes: voucherCodes,
        voucherLinks: voucherLinks,
        message: isFinished 
          ? 'Order completed instantly! Voucher codes are ready.' 
          : 'Order created and pending confirmation. Webhook will update when finished.',
        confirmSuccess: confirmResult.success
      }
    });
    
  } catch (error) {
    console.error('❌ Create order error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
}
