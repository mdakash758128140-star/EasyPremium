// api/create-order.js
// Relograde Order Creation API - With Confirm Order

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
  
  console.log(`📤 Calling Relograde API: ${method} ${url}`);
  
  try {
    const response = await fetch(url, options);
    const result = await response.json();
    
    console.log(`📥 Relograde Response Status: ${response.status}`);
    console.log(`📥 Relograde Response Data:`, JSON.stringify(result, null, 2));
    
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
  
  // Relograde Confirm Order API Call
  const confirmResult = await callRelogradeAPI(`order/confirm/${trx}`, 'PATCH');
  
  if (!confirmResult.success) {
    console.error('❌ Confirm order failed:', confirmResult.error);
    return { success: false, error: confirmResult.error };
  }
  
  const orderData = confirmResult.data;
  console.log(`✅ Order confirmed! Status: ${orderData.orderStatus}`);
  
  return { 
    success: true, 
    data: orderData,
    isFinished: orderData.orderStatus === 'finished',
    isPending: orderData.orderStatus === 'pending'
  };
}

// Firebase Database helper
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
    let voucherData = null;
    let voucherCode = null;
    let voucherLink = null;
    
    if (confirmResult && confirmResult.data && confirmResult.data.items) {
      const items = confirmResult.data.items;
      if (items.length > 0 && items[0].orderLines) {
        const orderLines = items[0].orderLines;
        const vouchers = [];
        
        for (const line of orderLines) {
          if (line.voucherCode) {
            vouchers.push({
              code: line.voucherCode,
              serial: line.voucherSerial,
              status: line.status,
              expiredDate: line.voucherDateExpired
            });
          }
        }
        
        if (vouchers.length > 0) {
          voucherData = vouchers;
          voucherCode = vouchers[0].code;
          voucherLink = `https://reward.relograde.com/${vouchers[0].code}`;
        }
      }
    }
    
    // Save to transactions
    const transactionData = {
      orderId: firebaseOrderId,
      userId: userId,
      status: confirmResult?.data?.orderStatus || 'pending',
      createdAt: timestamp,
      relogradeTrx: orderData.trx,
      relogradeData: orderData,
      amount: orderData.priceAmount || 0,
      currency: orderData.priceCurrency || 'USD',
      items: orderData.items || [],
      voucherData: voucherData,
      voucherCode: voucherCode,
      voucherLink: voucherLink,
      confirmStatus: confirmResult?.isFinished ? 'finished' : 'pending'
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
        status: confirmResult?.data?.orderStatus || 'pending',
        createdAt: timestamp,
        amount: orderData.priceAmount || 0,
        currency: orderData.priceCurrency || 'USD',
        items: orderData.items || [],
        voucherData: voucherData,
        voucherCode: voucherCode,
        voucherLink: voucherLink,
        relogradeTrx: orderData.trx
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
      successUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://easy-premium.com'}/success?orderId=${firebaseOrderId}`,
      cancelUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://easy-premium.com'}/cancel?orderId=${firebaseOrderId}`,
      webhookUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://easy-premium.com'}/api/webhook`,
      customerEmail: customerInfo?.email || null,
      customerName: customerInfo?.name || null
    };
    
    console.log('📦 Creating Relograde order:', JSON.stringify(relogradeOrderData, null, 2));
    
    // Step 1: Create Order in Relograde
    const createResult = await callRelogradeAPI('order', 'POST', relogradeOrderData);
    
    if (!createResult.success) {
      throw new Error(createResult.error || 'Failed to create order in Relograde');
    }
    
    const createdOrder = createResult.data;
    const relogradeTrx = createdOrder.trx;
    console.log(`✅ Order created with TRX: ${relogradeTrx}`);
    
    // Step 2: 🔥 IMPORTANT - Confirm the Order 🔥
    console.log(`🔄 Confirming order ${relogradeTrx}...`);
    const confirmResult = await confirmOrder(relogradeTrx);
    
    if (!confirmResult.success) {
      console.warn('⚠️ Order confirmation failed, but order was created. Webhook will handle later.');
    }
    
    // Get final order data after confirmation
    let finalOrderData = confirmResult.success ? confirmResult.data : createdOrder;
    let orderStatus = confirmResult.success ? confirmResult.data.orderStatus : 'created';
    let isFinished = confirmResult.success && confirmResult.isFinished;
    
    console.log(`📊 Final order status: ${orderStatus}, isFinished: ${isFinished}`);
    
    // Step 3: Save to Firebase
    const firebaseResult = await saveToFirebase(firebaseOrderId, finalOrderData, userId, confirmResult);
    
    if (!firebaseResult.success) {
      console.warn('Firebase save failed but order created:', firebaseResult.error);
    }
    
    // Extract voucher data for response
    let voucherData = null;
    let voucherCode = null;
    let voucherLink = null;
    
    if (confirmResult.success && confirmResult.data.items) {
      const items = confirmResult.data.items;
      if (items.length > 0 && items[0].orderLines) {
        const orderLines = items[0].orderLines;
        if (orderLines.length > 0) {
          voucherCode = orderLines[0].voucherCode;
          voucherLink = `https://reward.relograde.com/${voucherCode}`;
          voucherData = orderLines.map(line => ({
            code: line.voucherCode,
            serial: line.voucherSerial,
            status: line.status
          }));
        }
      }
    }
    
    // Return success response
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
        voucherData: voucherData,
        voucherCode: voucherCode,
        voucherLink: voucherLink,
        message: isFinished ? 'Order completed instantly!' : 'Order created and pending confirmation. Webhook will update when finished.'
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
