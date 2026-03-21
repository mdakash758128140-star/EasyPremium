// --- Voucher Code ---
let voucherCode = null;

// প্যাটার্ন ১: সবচেয়ে স্পেসিফিক — Your Voucher Code এর পরের button > p টেক্সট
let match = html.match(/Your Voucher Code[^<]*<\/p>\s*(?:<[^>]+>)*\s*<p[^>]*class="[^"]*truncate[^"]*"[^>]*>([^<]+)</i);
if (match) {
  voucherCode = match[1].trim();
}

// প্যাটার্ন ২: যদি উপরেরটা না মেলে — শুধু truncate ক্লাসের p খুঁজে নাও
if (!voucherCode) {
  match = html.match(/<p[^>]*truncate[^>]*>([A-Z0-9]{10,20})<\/p>/i);
  if (match) voucherCode = match[1].trim();
}

// প্যাটার্ন ৩: ফলব্যাক — ১৪–১৮ অক্ষরের বড় হাতের + সংখ্যার কোড (এই HTML-এর ক্ষেত্রে কাজ করবে)
if (!voucherCode) {
  // সিরিয়াল কোড (UUID) এড়িয়ে যাওয়ার জন্য ফিল্টার করা
  const codeCandidates = html.matchAll(/([A-Z0-9]{14,18})/g);
  for (const candidate of codeCandidates) {
    const code = candidate[1];
    if (!code.includes('-') && code !== 'TESTSQVR39WT14PM'.substring(0, code.length)) {  // UUID অংশ এড়ানো
      voucherCode = code;
      break;
    }
  }
}
