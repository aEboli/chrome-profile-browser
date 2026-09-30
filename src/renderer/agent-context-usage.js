(function exposeAgentContextUsage(root, factory) {
  const usage = factory();
  if (root) root.browserAgentContextUsage = usage;
  if (typeof module === 'object' && module.exports) module.exports = usage;
})(typeof window !== 'undefined' ? window : null, () => {
  function formatTokenCount(value, fractionDigits = 0) {
    const count = Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
    const digits = Number.isInteger(fractionDigits) && fractionDigits > 0 ? fractionDigits : 0;
    if (count < 1_000) return String(count);
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(digits)} m`;
    const thousands = count / 1_000;
    if (digits > 0) return `${thousands.toFixed(digits)} k`;
    const roundedThousands = Math.round(thousands);
    if (roundedThousands >= 1_000) return '1 m';
    return `${roundedThousands} k`;
  }

  return Object.freeze({ formatTokenCount });
});
