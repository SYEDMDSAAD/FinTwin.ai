// Setu bank linking needs the ngrok + Cloudflare tunnels running, so it's off
// for the beta. Build with VITE_BANK_LINK_ENABLED=true to switch it back on.
export const BANK_LINK_ENABLED = import.meta.env.VITE_BANK_LINK_ENABLED === "true";

export const BANK_LINK_OFF_MESSAGE =
  "Bank linking is a demo and isn't switched on during the beta. Please upload a bank or UPI statement instead — you can download one from PhonePe, Paytm or your bank's app.";
