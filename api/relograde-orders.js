// api/relograde-orders.js
// Vercel Serverless Function to fetch orders from Relograde API

export default async function handler(req, res) {
    // 1. অনুমোদিত HTTP মেথড চেক করুন (শুধু GET)
    if (req.method !== 'GET') {
        return res.status(405).json({ 
            error: 'Method not allowed. Only GET requests are accepted.' 
        });
    }

    try {
        // 2. এনভায়রনমেন্ট ভেরিয়েবল থেকে Relograde API কী নিন
        const apiKey = process.env.RELOGRADE_API_KEY;
        
        if (!apiKey) {
            console.error('RELOGRADE_API_KEY is not set in environment variables');
            return res.status(500).json({ 
                error: 'Server configuration error: API key missing' 
            });
        }

        // 3. Relograde API-র সঠিক এন্ডপয়েন্ট (ডকুমেন্টেশন অনুযায়ী পরিবর্তন করুন)
        // সাধারণত এটি https://api.relograde.com/v1/orders বা অনুরূপ হয়
        const apiUrl = 'https://api.relograde.com/orders'; // আপনার প্রকৃত এন্ডপয়েন্ট বসান

        // 4. API-তে অনুরোধ পাঠান (টাইমআউট ও হেডারসহ)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // ১০ সেকেন্ড টাইমআউট

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        // 5. রেসপন্স স্ট্যাটাস চেক করুন
        if (!response.ok) {
            // API থেকে ত্রুটি বার্তা পড়ার চেষ্টা করুন
            let errorText = '';
            try {
                const errorData = await response.json();
                errorText = errorData.message || JSON.stringify(errorData);
            } catch {
                errorText = await response.text();
            }
            
            console.error(`Relograde API error (${response.status}):`, errorText);
            return res.status(response.status).json({ 
                error: `Relograde API responded with status ${response.status}`,
                details: errorText
            });
        }

        // 6. সফল রেসপন্স থেকে JSON ডেটা নিন
        const data = await response.json();

        // 7. ডেটা আপনার অ্যাডমিন প্যানেলের জন্য ফরম্যাট করুন (প্রয়োজন অনুযায়ী)
        // ধরে নিচ্ছি API থেকে অ্যারে আকারে অর্ডার আসছে
        const orders = Array.isArray(data) ? data : (data.orders || data.data || []);

        // 8. ক্লায়েন্টকে JSON রেসপন্স পাঠান
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json(orders);

    } catch (error) {
        // 9. নেটওয়ার্ক বা অন্য কোনো ত্রুটি হ্যান্ডল করুন
        console.error('Error fetching orders from Relograde:', error.message);
        
        if (error.name === 'AbortError') {
            return res.status(504).json({ error: 'Request timeout. Relograde API did not respond in time.' });
        }
        
        res.status(500).json({ 
            error: 'Failed to fetch orders from Relograde',
            details: error.message 
        });
    }
}
