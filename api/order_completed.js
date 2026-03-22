// api/order_completed.js
// Relograde Order Management API - Complete & Delete Orders
// Using Firebase REST API (No Admin SDK required)

// Firebase Database REST API configuration
const FIREBASE_DB_URL = 'https://easy-premium-default-rtdb.asia-southeast1.firebasedatabase.app';
const FIREBASE_SECRET = process.env.FIREBASE_DATABASE_SECRET; // Firebase Database Secret

// Helper function for Firebase REST API calls
async function firebaseRestAPI(path, method = 'GET', data = null) {
  const url = `${FIREBASE_DB_URL}/${path}.json?auth=${FIREBASE_SECRET}`;
  
  const options = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
    }
  };
  
  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(data);
  }
  
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    return { success: true, data: result };
  } catch (error) {
    console.error('Firebase REST API error:', error);
    return { success: false, error: error.message };
  }
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true'
};

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Allow only POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Only POST is accepted.' 
    });
  }

  try {
    const { trxId, action, adminEmail } = req.body;

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
        error: 'adminEmail is required for authentication' 
      });
    }

    console.log(`Processing ${action} for order: ${trxId} by admin: ${adminEmail}`);

    let result;
    
    if (action === 'complete') {
      result = await completeOrderInFirebase(trxId, adminEmail);
    } else if (action === 'delete') {
      result = await deleteOrderFromFirebase(trxId, adminEmail);
    }

    // Success response
    return res.status(200).json({
      success: true,
      message: action === 'complete' ? 'Order completed successfully' : 'Order deleted successfully',
      data: result
    });

  } catch (error) {
    console.error('API Error:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};

/**
 * Complete order in Firebase Database using REST API
 */
async function completeOrderInFirebase(trxId, adminEmail) {
  try {
    const timestamp = Date.now();
    const timestampISO = new Date().toISOString();
    
    // Save completed order info to completedOrders node
    const completedOrderData = {
      trxId: trxId,
      status: 'finished',
      completedBy: adminEmail,
      completedAt: timestamp,
      completedAtISO: timestampISO,
      action: 'complete'
    };
    
    const completeResult = await firebaseRestAPI(`completedOrders/${trxId}`, 'PUT', completedOrderData);
    
    if (!completeResult.success) {
      throw new Error(completeResult.error);
    }
    
    // Log the action to orderActionLogs node
    const logData = {
      trxId: trxId,
      action: 'complete',
      adminEmail: adminEmail,
      timestamp: timestamp,
      timestampISO: timestampISO,
      status: 'success'
    };
    
    // Push to logs (auto-generated ID)
    await firebaseRestAPI('orderActionLogs', 'POST', logData);
    
    console.log(`Order ${trxId} completed successfully by ${adminEmail}`);
    
    return {
      trxId: trxId,
      status: 'finished',
      completedAt: timestamp,
      completedAtISO: timestampISO,
      message: 'Order marked as completed'
    };
    
  } catch (error) {
    console.error('Complete order error:', error);
    throw new Error(`Failed to complete order: ${error.message}`);
  }
}

/**
 * Delete order from Firebase Database with backup using REST API
 */
async function deleteOrderFromFirebase(trxId, adminEmail) {
  try {
    const timestamp = Date.now();
    const timestampISO = new Date().toISOString();
    
    // First, check if order exists in completedOrders
    const checkResult = await firebaseRestAPI(`completedOrders/${trxId}`, 'GET');
    
    let orderData = null;
    if (checkResult.success && checkResult.data) {
      orderData = checkResult.data;
    }
    
    // Create backup data
    const backupData = {
      trxId: trxId,
      deletedBy: adminEmail,
      deletedAt: timestamp,
      deletedAtISO: timestampISO,
      originalStatus: orderData ? orderData.status : 'unknown',
      originalData: orderData || null,
      action: 'delete'
    };
    
    // Save to deletedOrders backup
    const backupResult = await firebaseRestAPI(`deletedOrders/${trxId}`, 'PUT', backupData);
    
    if (!backupResult.success) {
      throw new Error(backupResult.error);
    }
    
    // Delete from completedOrders if exists
    if (orderData) {
      const deleteResult = await firebaseRestAPI(`completedOrders/${trxId}`, 'DELETE');
      if (!deleteResult.success) {
        console.warn(`Failed to delete from completedOrders: ${trxId}`);
      }
    }
    
    // Log the action
    const logData = {
      trxId: trxId,
      action: 'delete',
      adminEmail: adminEmail,
      timestamp: timestamp,
      timestampISO: timestampISO,
      backedUp: true,
      status: 'success'
    };
    
    await firebaseRestAPI('orderActionLogs', 'POST', logData);
    
    console.log(`Order ${trxId} deleted successfully by ${adminEmail}`);
    
    return {
      trxId: trxId,
      deletedAt: timestamp,
      deletedAtISO: timestampISO,
      backedUp: true,
      message: 'Order deleted and backed up successfully'
    };
    
  } catch (error) {
    console.error('Delete order error:', error);
    throw new Error(`Failed to delete order: ${error.message}`);
  }
}

// Export for Vercel serverless function
module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Allow only POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Only POST is accepted.' 
    });
  }

  try {
    const { trxId, action, adminEmail } = req.body;

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
        error: 'adminEmail is required for authentication' 
      });
    }

    console.log(`Processing ${action} for order: ${trxId} by admin: ${adminEmail}`);

    let result;
    
    if (action === 'complete') {
      result = await completeOrderInFirebase(trxId, adminEmail);
    } else if (action === 'delete') {
      result = await deleteOrderFromFirebase(trxId, adminEmail);
    }

    // Success response
    return res.status(200).json({
      success: true,
      message: action === 'complete' ? 'Order completed successfully' : 'Order deleted successfully',
      data: result
    });

  } catch (error) {
    console.error('API Error:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
