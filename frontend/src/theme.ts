// Theme constants — Neo-brutalism + Glassmorphism + dark gradients
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
  { code: "EUR", name: "Euro", flag: "🇪🇺", symbol: "€" },
  { code: "XOF", name: "Franc CFA (BCEAO)", flag: "🇸🇳", symbol: "F" },
  { code: "XAF", name: "Franc CFA (BEAC)", flag: "🇨🇲", symbol: "F" },
  { code: "USD", name: "US Dollar", flag: "🇺🇸", symbol: "$" },
  { code: "GBP", name: "Pound Sterling", flag: "🇬🇧", symbol: "£" },
  { code: "NGN", name: "Naira", flag: "🇳🇬", symbol: "₦" },
  { code: "MAD", name: "Dirham marocain", flag: "🇲🇦", symbol: "DH" },
  { code: "CAD", name: "Dollar canadien", flag: "🇨🇦", symbol: "$" },
  { code: "CHF", name: "Franc suisse", flag: "🇨🇭", symbol: "Fr" },
  { code: "JPY", name: "Yen", flag: "🇯🇵", symbol: "¥" },
  { code: "CNY", name: "Yuan", flag: "🇨🇳", symbol: "¥" },
  { code: "AUD", name: "Dollar australien", flag: "🇦🇺", symbol: "$" },
  { code: "INR", name: "Roupie indienne", flag: "🇮🇳", symbol: "₹" },
  { code: "BRL", name: "Real brésilien", flag: "🇧🇷", symbol: "R$" },
  { code: "ZAR", name: "Rand sud-africain", flag: "🇿🇦", symbol: "R" },
  { code: "KES", name: "Shilling kenyan", flag: "🇰🇪", symbol: "KSh" },
  { code: "GHS", name: "Cedi ghanéen", flag: "🇬🇭", symbol: "₵" },
  { code: "SEK", name: "Couronne suédoise", flag: "🇸🇪", symbol: "kr" },
  { code: "AED", name: "Dirham EAU", flag: "🇦🇪", symbol: "د.إ" },
];

export const ZERO_DECIMALS = ["XOF", "XAF", "JPY", "NGN", "KES"];

export const currencyMeta = (code: string) =>
  CURRENCIES.find((c) => c.code === code) || { code, name: code, flag: "🏳️", symbol: code };

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
