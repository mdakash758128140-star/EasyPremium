// api/order_completed.js
// Admin Order Management API - Complete & Delete Orders
// Using Firebase REST API with Database Secret (No Admin SDK)

// Firebase Database REST API helper
async function firebaseRestAPI(path, method = 'GET', data = null) {
  const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
  const FIREBASE_SECRET = process.env.FIREBASE_SECRET;
  
  if (!FIREBASE_DATABASE_URL || !FIREBASE_SECRET) {
    throw new Error('Firebase configuration missing');
  }
  
  const url = `${FIREBASE_DATABASE_URL}/${path}.json?auth=${FIREBASE_SECRET}`;
  
  const options = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
    }
  };
  
  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(data);
  }
  
  const response = await fetch(url, options);
  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.error || `HTTP error: ${response.status}`);
  }
  
  return result;
}

// Main handler
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Only POST is accepted.' 
    });
  }
  
  try {
    const { trxId, action, adminEmail, orderData } = req.body;
    
    // Validation
    if (!trxId) {
      return res.status(400).json({ 
        success: false, 
        error: 'trxId is required' 
      });
    }
    
    if (!action || !['complete', 'delete'].includes(action)) {
      return res.status(400).json({ 
        success: false, 
        error: 'action must be either "complete" or "delete"' 
      });
    }
    
    if (!adminEmail) {
      return res.status(400).json({ 
        success: false, 
        error: 'adminEmail is required' 
      });
    }
    
    console.log(`📝 Processing ${action} for order: ${trxId} by admin: ${adminEmail}`);
    
    let result;
    
    if (action === 'complete') {
      result = await completeOrder(trxId, adminEmail, orderData);
    } else if (action === 'delete') {
      result = await deleteOrder(trxId, adminEmail, orderData);
    }
    
    return res.status(200).json({
      success: true,
      message: action === 'complete' ? 'Order completed successfully' : 'Order deleted successfully',
      data: result
    });
    
  } catch (error) {
    console.error('❌ API Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}

// Complete order function
async function completeOrder(trxId, adminEmail, orderData) {
  try {
    const timestamp = new Date().toISOString();
    const timestampMs = Date.now();
    
    // Prepare completed order data
    const completedOrderData = {
      trxId: trxId,
      status: 'completed',
      completedBy: adminEmail,
      completedAt: timestampMs,
      completedAtISO: timestamp,
      orderData: orderData || null
    };
    
    // Save to completedOrders
    await firebaseRestAPI(`completedOrders/${trxId}`, 'PUT', completedOrderData);
    console.log(`✅ Order ${trxId} saved to completedOrders`);
    
    // Update transactions table
    try {
      // Try direct path first
      const transactionData = await firebaseRestAPI(`transactions/${trxId}`, 'GET');
      if (transactionData) {
        const transactionUpdates = {
          status: 'completed',
          completedAt: timestamp,
          completedBy: adminEmail
        };
        await firebaseRestAPI(`transactions/${trxId}`, 'PATCH', transactionUpdates);
        console.log(`✅ Transaction ${trxId} updated`);
      } else {
        // Search for transaction by orderId
        const allTransactions = await firebaseRestAPI('transactions', 'GET');
        if (allTransactions && typeof allTransactions === 'object') {
          for (const key in allTransactions) {
            if (allTransactions[key].orderId === trxId || allTransactions[key].trxId === trxId) {
              const transactionUpdates = {
                status: 'completed',
                completedAt: timestamp,
                completedBy: adminEmail
              };
              await firebaseRestAPI(`transactions/${key}`, 'PATCH', transactionUpdates);
              console.log(`✅ Transaction found and updated with key: ${key}`);
              break;
            }
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not update transaction:', err.message);
    }
    
    // Log the action
    const logData = {
      trxId: trxId,
      action: 'complete',
      adminEmail: adminEmail,
      timestamp: timestampMs,
      timestampISO: timestamp
    };
    
    await firebaseRestAPI('adminActionLogs', 'POST', logData);
    console.log(`✅ Action logged`);
    
    return {
      trxId: trxId,
      status: 'completed',
      completedAt: timestamp,
      message: 'Order marked as completed'
    };
    
  } catch (error) {
    console.error('Complete order error:', error);
    throw new Error(`Failed to complete order: ${error.message}`);
  }
}

// Delete order function
async function deleteOrder(trxId, adminEmail, orderData) {
  try {
    const timestamp = new Date().toISOString();
    const timestampMs = Date.now();
    
    // First, fetch existing order data if not provided
    let existingOrderData = orderData;
    if (!existingOrderData) {
      try {
        // Try to get from transactions
        const transactionData = await firebaseRestAPI(`transactions/${trxId}`, 'GET');
        if (transactionData) {
          existingOrderData = transactionData;
        }
      } catch (err) {
        console.log('No existing order data found');
      }
    }
    
    // Create backup data
    const backupData = {
      trxId: trxId,
      deletedBy: adminEmail,
      deletedAt: timestampMs,
      deletedAtISO: timestamp,
      originalData: existingOrderData || null,
      action: 'delete'
    };
    
    // Save to deletedOrders backup
    await firebaseRestAPI(`deletedOrders/${trxId}`, 'PUT', backupData);
    console.log(`✅ Order ${trxId} backed up to deletedOrders`);
    
    // Delete from transactions if exists
    try {
      const transactionData = await firebaseRestAPI(`transactions/${trxId}`, 'GET');
      if (transactionData) {
        await firebaseRestAPI(`transactions/${trxId}`, 'DELETE');
        console.log(`✅ Transaction ${trxId} deleted`);
      }
    } catch (err) {
      console.log('Transaction not found or already deleted');
    }
    
    // Delete from completedOrders if exists
    try {
      const completedData = await firebaseRestAPI(`completedOrders/${trxId}`, 'GET');
      if (completedData) {
        await firebaseRestAPI(`completedOrders/${trxId}`, 'DELETE');
        console.log(`✅ Completed order ${trxId} deleted`);
      }
    } catch (err) {
      console.log('Completed order not found');
    }
    
    // Search and delete from userOrders if exists
    try {
      const allUsers = await firebaseRestAPI('userOrders', 'GET');
      if (allUsers && typeof allUsers === 'object') {
        for (const userId in allUsers) {
          const userOrders = allUsers[userId];
          if (userOrders && typeof userOrders === 'object') {
            for (const orderKey in userOrders) {
              if (userOrders[orderKey].orderId === trxId || userOrders[orderKey].trxId === trxId || orderKey === trxId) {
                await firebaseRestAPI(`userOrders/${userId}/${orderKey}`, 'DELETE');
                console.log(`✅ User order deleted for user ${userId}`);
                break;
              }
            }
          }
        }
      }
    } catch (err) {
      console.log('Could not delete from userOrders:', err.message);
    }
    
    // Log the action
    const logData = {
      trxId: trxId,
      action: 'delete',
      adminEmail: adminEmail,
      timestamp: timestampMs,
      timestampISO: timestamp,
      backedUp: true
    };
    
    await firebaseRestAPI('adminActionLogs', 'POST', logData);
    console.log(`✅ Delete action logged`);
    
    return {
      trxId: trxId,
      deletedAt: timestamp,
      backedUp: true,
      message: 'Order deleted and backed up successfully'
    };
    
  } catch (error) {
    console.error('Delete order error:', error);
    throw new Error(`Failed to delete order: ${error.message}`);
  }
}
