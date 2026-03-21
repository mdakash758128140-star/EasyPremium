// --- Voucher Code ---
let voucherCode = null;

// সবচেয়ে নির্ভরযোগ্য: truncate ক্লাস + style="--text-length" যুক্ত <p> এর টেক্সট
let match = html.match(/<p[^>]*truncate[^>]*style="--text-length[^>]*>([A-Z0-9]{10,20})<\/p>/i);
if (match) {
  voucherCode = match[1].trim();
}

// ফলব্যাক: Your Voucher Code টেক্সটের পরের বড় অক্ষরের কোড (১২-২০ অক্ষর)
if (!voucherCode) {
  match = html.match(/Your Voucher Code[^<]*(?:<\/p>[\s\S]*?<p[^>]*>)([A-Z0-9]{12,20})/i);
  if (match) voucherCode = match[1].trim();
}

// আরও ফলব্যাক: শুধু ১৪-১৮ অক্ষরের alphanumeric (UUID এড়ানো)
if (!voucherCode) {
  const candidates = [...html.matchAll(/([A-Z0-9]{14,18})/g)]
    .map(m => m[1])
    .filter(code => !code.includes('-')); // UUID ফিল্টার
  if (candidates.length > 0) {
    voucherCode = candidates.find(c => c.length === 16) || candidates[0]; // এই কেসে 16 অক্ষরেরটা
  }
}
