const PDF_REPLACEMENTS = [
  ["≤", "<="],
  ["≥", ">="],
  ["—", "-"],
  ["–", "-"],
  ["−", "-"],
  ["√", "{sym:√}"],
  ["π", "{sym:π}"],
  ["η", "{sym:η}"],
  ["ε", "{sym:ε}"],
  ["δ", "{sym:δ}"],
  ["θ", "{sym:θ}"],
  ["φ", "{sym:φ}"],
  ["ρ", "{sym:ρ}"],
  ["γ", "{sym:γ}"],
  ["β", "{sym:β}"],
  ["α", "{sym:α}"],
  ["²", "{sup:2}"],
  ["³", "{sup:3}"],
  ["⁰", "{sup:0}"],
  ["¹", "{sup:1}"],
  ["⁴", "{sup:4}"],
  ["⁵", "{sup:5}"],
  ["⁶", "{sup:6}"],
  ["⁷", "{sup:7}"],
  ["⁸", "{sup:8}"],
  ["⁹", "{sup:9}"],
  ["₀", "{sub:0}"],
  ["₁", "{sub:1}"],
  ["₂", "{sub:2}"],
  ["₃", "{sub:3}"],
  ["₄", "{sub:4}"],
  ["₅", "{sub:5}"],
  ["₆", "{sub:6}"],
  ["₇", "{sub:7}"],
  ["₈", "{sub:8}"],
  ["₉", "{sub:9}"],
  ["Ø", "O"],
  ["×", " x "],
];

export function sanitizePdfText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  const protectedTokens = new Map();
  let tokenIndex = 0;

  const protectedText = text.replace(/\{(?:sub|sup|sym):[^}]*\}/g, (match) => {
    const key = `__PDF_TOKEN_${tokenIndex++}__`;
    protectedTokens.set(key, match);
    return key;
  });

  let sanitized = protectedText;

  for (const [source, replacement] of PDF_REPLACEMENTS) {
    sanitized = sanitized.split(source).join(replacement);
  }

  for (const [key, token] of protectedTokens.entries()) {
    sanitized = sanitized.split(key).join(token);
  }

  return sanitized;
}
