// api/check-firebase.js
const admin = require('firebase-admin');

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = {
    timestamp: new Date().toISOString(),
    environment: {},
    firebase: {},
    tests: {}
  };

  try {
    // ========== 1. Firebase Service Account (সরাসরি JSON থেকে) ==========
    const serviceAccount = {
      type: "service_account",
      project_id: "easy-premium",
      private_key_id: "e8e8d42323de37ab2c90d098deb8463fd244d88e",
      private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCknEAF+fkt4Q67\n0l5j9udKxNocUiH8bIjFDWaNcmE+/VEh2Y45eGQv9b/falIgWy6UCm+P2BSBbUhk\npJ4xlfjYmSvi2LTbgwLSqLpKjWx0SuFQhxfZGt1kk7SJfpUznHdhJqozszxZpZB0\nTuuwV6jddgNEmWPGo+vIAKin2LcQPMMG072t3YfFXd4NcpS8esxd5dIJoRpjd5bW\nIzHdVzKP9Z3I85IoEfOsMeIJ6EsM1OgfZ5PishQmnVPFK5VWs99Z/Ab6KTQF4S5d\n4UeaiKVYv3p/EO4DExfl033RcNcIaKxuzFKtIREfei12kzWlLwtX7zvZaJFjAfj1\n8BSZo3HpAgMBAAECggEAJ1C1XugNGmbcKsJsLnKAXASHtodsXBp9ERlqAsMMlGuS\nxuOr+zB0t1q55M3DRzyX855JdoDsptv31CfYK64u5Oayi2foTFxuXmuTsO41ttHS\nnjXh3YXz1kuL7WH5Fz5Z6e9+68G1mpC3X3whATlymNBQp//9y2oHzLlRjuMtF/iV\nHJDU/ZvK12IgqGzesy+0BhzeCStbH0HCSOs2dLaQZVXhpEGF8TSDTQWfxV2hoaUF\n7aDiexu09oQjPd8fyGm801Tse9PgM6lhJIecrR0O4zaTyG0ANbz0EO2W2pnMTTUE\nWJzH2b8wxm4+zTCE58BhVJzvVE5UeeFRVl3OCzEufQKBgQDUEHQJtNd9YuZ/4blo\nz2jxF8NS/+uKuhGPeUZdkmXgoeon+G/EFQWcwrW69GpQQLVtfSjtd5bHd5tnnKDA\nRvd/PKQDnZwYWgBXWoF+BBYxM2H7guHr+PifpJYur2nK2WsXTpgXwr7sLWtnENjd\nnWkJw9GVXUYwK4Qo2SNXRHwrdQKBgQDGturkE+X5MVUZdngWzoptCEYfgg8VW4bB\nHHkjwz7Kqvj/+6X6wJ2qWbGFs50HlA0zgOukjuFJkHmqR8x/vLBrj9x3fFsPu07P\nSXWLWng6GyCp8gbSVhophicS86aL+hwapUDrCI6+cWaw+0wA7XlfqiZYC/P7+/3N\nobfeN+lCJQKBgCzmXus/MvEFY7Bn5o3efGWvlleYgBKbWuR51QAy4wcwwRc9bsyh\ndtK+FyRCY9AiI0fPXD8LNw18sZa6fv63B+gUutVZJZeyVqgoLYq06s34ByLtj1Ab\nIukKPBIeadPdPONubJ17SllPNJJZ6tDhZz/+Cf4KBbZlQFI1x1nO0kuRAoGBALAY\nVy3JSGo9QnmvF5q2a8tVora3TeCSXGdzcRK1Kkb1nnVSr3L4EIBuvbeLRSP7GnvC\nyo/oolLLulWhDONB9mFLeodUZ2oYhi2Bnq3gfVyYv6h6t3rcHJEhtizASJ4RBajD\nOzVNPxobanJ6L48+4ulY4mPyK8PpOrBomIVPrOEVAoGAUIKfLxJa1IPrbaI5lYC6\nRLt3DVjrNVA2vWCvy63nZ9Igm+mPHb+OU2XGmTuEyR/4zpDz9ookt8pLaTgaS6BK\n3mMztxMgtKqBoDbMWty3ppdekL0wM3uMLfboE4gn98+1rMfITPiI0l+zRqjDiRM5\nBUh36rtpkRsKzi1PXnc3oF8=\n-----END PRIVATE KEY-----\n",
      client_email: "firebase-adminsdk-fbsvc@easy-premium.iam.gserviceaccount.com",
      client_id: "101315501661716215319",
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40easy-premium.iam.gserviceaccount.com",
      universe_domain: "googleapis.com"
    };

    // ========== 2. Firebase Initialization ==========
    let firebaseInit = { status: '⏳ Testing...' };
    
    if (!admin.apps.length) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: "https://easy-premium-default-rtdb.asia-southeast1.firebasedatabase.app"
        });
        
        firebaseInit = {
          status: '✅ Firebase initialized successfully',
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email,
          databaseURL: "https://easy-premium-default-rtdb.asia-southeast1.firebasedatabase.app"
        };
      } catch (initError) {
        firebaseInit = {
          status: '❌ Firebase initialization failed',
          error: initError.message,
          stack: initError.stack
        };
      }
    } else {
      firebaseInit = {
        status: '✅ Firebase already initialized',
        appsCount: admin.apps.length
      };
    }
    
    result.firebase = firebaseInit;

    // ========== 3. Database Write Test ==========
    if (admin.apps.length && firebaseInit.status.includes('✅')) {
      try {
        const db = admin.database();
        
        // Test 1: Check connection reference
        const connectedRef = db.ref('.info/connected');
        result.tests.connectionRef = '✅ Connection reference created';
        
        // Test 2: Write a test record
        const testRef = db.ref('firebase_test').push();
        const testKey = testRef.key;
        
        await testRef.set({
          timestamp: admin.database.ServerValue.TIMESTAMP,
          message: 'Firebase connection test',
          from: 'check-firebase.js',
          testData: '✅ Working properly'
        });
        
        result.tests.writeTest = {
          status: '✅ Successfully wrote test data',
          key: testKey,
          path: `firebase_test/${testKey}`
        };
        
        // Test 3: Read back the test data
        const snapshot = await testRef.once('value');
        const data = snapshot.val();
        
        result.tests.readTest = {
          status: '✅ Successfully read test data',
          data: {
            ...data,
            timestamp: new Date(data.timestamp).toISOString()
          }
        };
        
        // Clean up test data after 5 seconds
        setTimeout(async () => {
          try {
            await testRef.remove();
            console.log('✅ Test data cleaned up');
          } catch (e) {
            console.log('❌ Cleanup failed:', e.message);
          }
        }, 5000);
        
      } catch (dbError) {
        result.tests = {
          status: '❌ Database test failed',
          error: dbError.message,
          stack: dbError.stack
        };
      }
    }

    // ========== 4. Environment Variables Info ==========
    result.environment = {
      note: 'Using hardcoded service account (not environment variables)',
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      databaseURL: "https://easy-premium-default-rtdb.asia-southeast1.firebasedatabase.app",
      privateKeyStatus: '✅ Present in code',
      privateKeyPreview: serviceAccount.private_key.substring(0, 50) + '...'
    };

    // ========== 5. Final Summary ==========
    const allTestsPassed = 
      result.firebase.status?.includes('✅') && 
      result.tests.writeTest?.status?.includes('✅');

    result.summary = {
      status: allTestsPassed ? '✅ All tests passed!' : '❌ Some tests failed',
      message: allTestsPassed ? 
        'Firebase is working correctly! Your service account is valid.' : 
        'Check the errors above and fix them.',
      nextSteps: allTestsPassed ? [
        '✅ Firebase connection successful',
        '✅ Database write/read working',
        '✅ Service account is valid',
        'You can now use this same service account in your main API'
      ] : [
        '❌ Check Firebase service account permissions',
        '❌ Verify database URL is correct',
        '❌ Check if Realtime Database is enabled in Firebase Console'
      ]
    };

    // ========== 6. Send Response ==========
    res.status(200).json({
      success: true,
      ...result
    });

  } catch (error) {
    // Global error handler
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      message: 'An unexpected error occurred in the check script'
    });
  }
}
