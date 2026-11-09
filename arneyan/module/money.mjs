/**
 * Money as the books print it (Handbook v0.10.59, K103, prices in gold): values are kept in silver, and an amount of
 * 10 sp or more that divides evenly by 10 prints in gold (150 sp is 15 gp, 1,000 sp is 100 gp); other amounts stay
 * silver (15 sp, 25 sp), and less than 1 sp is copper.
 */
export function priceText(sp) {
  const n = Number(sp);
  if (!Number.isFinite(n)) return "";
  const fmt = v => v.toLocaleString("en-GB");
  if (n >= 10 && Number.isInteger(n) && n % 10 === 0) return `${fmt(n / 10)} gp`;
  if (Number.isInteger(n)) return `${fmt(n)} sp`;
  const cp = Math.round(n * 10);
  return cp % 10 === 0 ? `${fmt(cp / 10)} sp` : cp > 10 ? `${fmt(Math.floor(cp / 10))} sp ${cp % 10} cp` : `${cp} cp`;
}
