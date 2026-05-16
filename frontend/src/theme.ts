// Theme constants - Neo-brutalism + Glassmorphism + dark gradients
export const Colors = {
  bg: "#050505",
  bgSoft: "#0c0c10",
  bgCard: "#111118",
  glass: "rgba(255,255,255,0.05)",
  glassHeavy: "rgba(255,255,255,0.09)",
  border: "rgba(255,255,255,0.12)",
  borderStrong: "rgba(255,255,255,0.22)",
  text: "#FFFFFF",
  textSoft: "#A1A1AA",
  textMuted: "#6b6b75",
  cyan: "#00FFFF",
  cyanDim: "#00b3b3",
  magenta: "#FF007F",
  green: "#39FF14",
  yellow: "#FFD700",
  purple: "#9D4CDD",
  orange: "#FF8A00",
  danger: "#FF3B5C",
  success: "#39FF14",
};

export const CURRENCIES: { code: string; name: string; flag: string; symbol: string }[] = [
  { code: "EUR", name: "Euro", flag: "EU", symbol: "EUR" },
  { code: "XOF", name: "Franc CFA (BCEAO)", flag: "XOF", symbol: "XOF" },
  { code: "XAF", name: "Franc CFA (BEAC)", flag: "XAF", symbol: "XAF" },
  { code: "USD", name: "US Dollar", flag: "US", symbol: "USD" },
  { code: "GBP", name: "Pound Sterling", flag: "GB", symbol: "GBP" },
  { code: "NGN", name: "Naira", flag: "NG", symbol: "NGN" },
  { code: "MAD", name: "Dirham marocain", flag: "MA", symbol: "MAD" },
  { code: "CAD", name: "Dollar canadien", flag: "CA", symbol: "CAD" },
  { code: "CHF", name: "Franc suisse", flag: "CH", symbol: "CHF" },
  { code: "JPY", name: "Yen", flag: "JP", symbol: "JPY" },
  { code: "CNY", name: "Yuan", flag: "CN", symbol: "CNY" },
  { code: "AUD", name: "Dollar australien", flag: "AU", symbol: "AUD" },
  { code: "INR", name: "Roupie indienne", flag: "IN", symbol: "INR" },
  { code: "BRL", name: "Real bresilien", flag: "BR", symbol: "BRL" },
  { code: "ZAR", name: "Rand sud-africain", flag: "ZA", symbol: "ZAR" },
  { code: "KES", name: "Shilling kenyan", flag: "KE", symbol: "KES" },
  { code: "GHS", name: "Cedi ghaneen", flag: "GH", symbol: "GHS" },
  { code: "SEK", name: "Couronne suedoise", flag: "SE", symbol: "SEK" },
  { code: "AED", name: "Dirham EAU", flag: "AE", symbol: "AED" },
];

export const ZERO_DECIMALS = ["XOF", "XAF", "JPY", "NGN", "KES"];

export const currencyMeta = (code: string) =>
  CURRENCIES.find((c) => c.code === code) || { code, name: code, flag: "--", symbol: code };

export const formatMoney = (amount: number, code: string) => {
  const m = currencyMeta(code);
  const zero = ZERO_DECIMALS.includes(code);
  const opts: Intl.NumberFormatOptions = {
    minimumFractionDigits: zero ? 0 : 2,
    maximumFractionDigits: zero ? 0 : 2,
  };
  try {
    return `${m.symbol} ${amount.toLocaleString("fr-FR", opts)}`;
  } catch {
    return `${m.symbol} ${amount.toFixed(zero ? 0 : 2)}`;
  }
};
