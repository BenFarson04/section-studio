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
  ["μ", "{sym:μ}"],
  ["ν", "{sym:ν}"],
  ["σ", "{sym:σ}"],
  ["τ", "{sym:τ}"],
  ["ω", "{sym:ω}"],
  ["λ", "{sym:λ}"],
  ["χ", "{sym:χ}"],
  ["Γ", "{sym:Γ}"],
  ["Δ", "{sym:Δ}"],
  ["Θ", "{sym:Θ}"],
  ["Λ", "{sym:Λ}"],
  ["Σ", "{sym:Σ}"],
  ["Φ", "{sym:Φ}"],
  ["Ω", "{sym:Ω}"],
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
  ["÷", "/"],
  ["•", "*"],
];

const PDF_FONT_PATHS = {
  regular: new URL("../../fonts/NotoSans-Regular.ttf", import.meta.url),
  bold: new URL("../../fonts/NotoSans-Regular.ttf", import.meta.url),
};

async function embedPdfFont(pdfDoc, fontUrl, fallbackFont) {
  try {
    if (typeof process !== "undefined" && process.versions?.node && String(fontUrl).startsWith("file:")) {
      const { readFile } = await import("node:fs/promises");
      const { fileURLToPath } = await import("node:url");
      return await pdfDoc.embedFont(await readFile(fileURLToPath(fontUrl)));
    }

    const response = await fetch(fontUrl);
    if (!response.ok) throw new Error(`Font fetch failed: ${response.status}`);
    return await pdfDoc.embedFont(await response.arrayBuffer());
  } catch (error) {
    if (fallbackFont) {
      console.warn(`Falling back to standard font for PDF text: ${error.message}`);
      return fallbackFont;
    }

    throw error;
  }
}

export async function loadPdfFonts(pdfDoc) {
  const pdfLib = globalThis.PDFLib;
  const standardFonts = pdfLib?.StandardFonts;

  if (globalThis.fontkit && typeof pdfDoc.registerFontkit === "function") {
    pdfDoc.registerFontkit(globalThis.fontkit);
  }

  const regularFallback = standardFonts?.Helvetica
    ? await pdfDoc.embedFont(standardFonts.Helvetica)
    : null;

  const boldFallback = standardFonts?.HelveticaBold
    ? await pdfDoc.embedFont(standardFonts.HelveticaBold)
    : null;

  const regular = await embedPdfFont(pdfDoc, PDF_FONT_PATHS.regular, regularFallback);
  const bold = await embedPdfFont(pdfDoc, PDF_FONT_PATHS.bold, boldFallback);

  return {
    regular,
    bold,
    mono: regular,
    symbol: regular,
  };
}

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

  // Keep the fallback intentionally conservative, but allow the custom Unicode
  // font to retain professional engineering notation when available.
  sanitized = sanitized.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

  for (const [key, token] of protectedTokens.entries()) {
    sanitized = sanitized.split(key).join(token);
  }

  return sanitized;
}
