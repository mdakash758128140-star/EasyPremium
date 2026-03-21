// --- Voucher Code ---
let voucherCode = null;

// পুরোনো প্যাটার্ন ১
match = html.match(/Your Voucher Code\s*<\/?\w+>\s*([^\s<]+)/);
if (match) voucherCode = match[1];

// পুরোনো প্যাটার্ন ২
if (!voucherCode) {
  match = html.match(/voucher-code["']?>\s*([^<]+)/i);
  if (match) voucherCode = match[1].trim();
}

// নতুন প্যাটার্ন ৩: class/id যেকোনো হতে পারে, শুধু Voucher Code শব্দ খুঁজে তার পরের টেক্সট
if (!voucherCode) {
  match = html.match(/(?:Voucher Code|Voucher|Code|কোড)[^<]*?<\/[^>]+>\s*([^<\s]{8,})[^<]*/i);
  if (match) voucherCode = match[1].trim();
}

// নতুন প্যাটার্ন ৪: সবচেয়ে সহজ — ১০-২০ অক্ষরের বড় হাতের/সংখ্যার কম্বিনেশন (অনেক ভাউচার কোড এরকম হয়)
if (!voucherCode) {
  match = html.match(/([A-Z0-9]{10,25})/g);   // গ্লোবাল ম্যাচ
  if (match && match.length > 0) {
    // সিরিয়াল কোড যদি UUID হয় তাহলে সেটা এড়ানোর চেষ্টা
    const possibleCodes = match.filter(code => 
      !code.includes('-') && code.length >= 12 && code.length <= 20
    );
    if (possibleCodes.length > 0) {
      voucherCode = possibleCodes[0];   // প্রথম সম্ভাব্যটা নাও
    }
  }
}

// নতুন প্যাটার্ন ৫: শেষ চেষ্টা — শুধু alphanumeric ১২+ অক্ষরের স্ট্রিং (সিরিয়াল কোডের পরে আসতে পারে)
if (!voucherCode && serialCode) {
  const afterSerial = html.split(serialCode)[1] || '';
  match = afterSerial.match(/([A-Z0-9]{10,})/);
  if (match) voucherCode = match[1];
}
