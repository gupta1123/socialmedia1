export interface ReraBlockInput {
  authorityLabel: string;
  registrationNumber: string;
  websiteUrl: string;
  textColor: string;
  colorMode?: "text" | "all";
  qrSourceUrl?: string | null;
  qrDataUrl?: string | null;
}

export interface ReraBlockOutput {
  dataUrl: string;
  width: number;
  height: number;
  qrDataUrl?: string | null;
}

const RERA_BLOCK_WIDTH = 920;
const RERA_BLOCK_HEIGHT = 250;

export async function createReraComplianceBlockImage(input: ReraBlockInput): Promise<ReraBlockOutput> {
  const width = RERA_BLOCK_WIDTH;
  const height = RERA_BLOCK_HEIGHT;
  const paddingX = 4;
  const embeddedQrDataUrl = input.qrDataUrl
    ? normalizeQrDataUrl(input.qrDataUrl)
    : input.qrSourceUrl
      ? await sourceToDataUrl(input.qrSourceUrl)
      : null;
  const qrSize = embeddedQrDataUrl ? 190 : 0;
  const qrX = width - qrSize - paddingX;
  const textMaxWidth = embeddedQrDataUrl ? qrX - paddingX - 26 : width - paddingX * 2;
  const safeColor = normalizeSvgColor(input.textColor);
  const shouldColorQr = input.colorMode === "all";
  const authorityFontSize = 34;
  const registrationFontSize = fitSvgFontSize(input.registrationNumber, textMaxWidth, 86, 42, 0.58);
  const websiteFontSize = fitSvgFontSize(input.websiteUrl, textMaxWidth, 34, 22, 0.55);
  const authorityLabelWidth = Math.min(estimateTextWidth(input.authorityLabel, authorityFontSize, 0.58), textMaxWidth * 0.42);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="RERA compliance block">
  <rect width="${width}" height="${height}" fill="none"/>
  <text x="${paddingX}" y="48" fill="${safeColor}" font-family="Helvetica Neue, Arial, sans-serif" font-size="${authorityFontSize}" font-weight="700">${escapeSvgText(input.authorityLabel)}</text>
  <line x1="${paddingX + authorityLabelWidth + 16}" y1="48" x2="${textMaxWidth}" y2="48" stroke="${safeColor}" stroke-width="5" stroke-linecap="round"/>
  <text x="${paddingX}" y="132" fill="${safeColor}" font-family="Helvetica Neue, Arial, sans-serif" font-size="${registrationFontSize}" font-weight="700">${escapeSvgText(input.registrationNumber)}</text>
  <text x="${paddingX}" y="196" fill="${safeColor}" font-family="Helvetica Neue, Arial, sans-serif" font-size="${websiteFontSize}" font-weight="700">${escapeSvgText(input.websiteUrl)}</text>
  ${embeddedQrDataUrl ? `<image href="${escapeSvgAttribute(shouldColorQr ? recolorQrDataUrl(embeddedQrDataUrl, safeColor) : embeddedQrDataUrl)}" x="${qrX}" y="30" width="${qrSize}" height="${qrSize}" preserveAspectRatio="xMidYMid meet"/>` : ""}
</svg>`;

  return {
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width,
    height,
    qrDataUrl: embeddedQrDataUrl,
  };
}

async function sourceToDataUrl(source: string): Promise<string> {
  if (source.startsWith("data:")) {
    return normalizeQrDataUrl(source);
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Unable to load the RERA QR (${response.status}).`);
  }
  const blob = await response.blob();

  if (blob.type === "image/svg+xml" || source.toLowerCase().includes(".svg")) {
    return svgToDataUrl(stripWhiteSvgBackground(await blob.text()));
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unable to read the RERA QR."));
    };
    reader.onerror = () => reject(new Error("Unable to read the RERA QR."));
    reader.readAsDataURL(blob);
  });
}

function normalizeQrDataUrl(source: string): string {
  if (!source.startsWith("data:image/svg+xml")) {
    return source;
  }

  const svg = decodeSvgDataUrl(source);
  return svg ? svgToDataUrl(stripWhiteSvgBackground(svg)) : source;
}

function recolorQrDataUrl(source: string, color: string): string {
  if (!source.startsWith("data:image/svg+xml")) {
    return source;
  }

  const svg = decodeSvgDataUrl(source);
  return svg ? svgToDataUrl(recolorSvgQr(stripWhiteSvgBackground(svg), color)) : source;
}

function decodeSvgDataUrl(source: string): string | null {
  const commaIndex = source.indexOf(",");
  if (commaIndex === -1) {
    return null;
  }

  const metadata = source.slice(0, commaIndex);
  const payload = source.slice(commaIndex + 1);

  try {
    if (/;base64/i.test(metadata)) {
      const binary = atob(payload);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }

    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function stripWhiteSvgBackground(svg: string): string {
  return svg.replace(
    /<rect\b(?=[^>]*\bfill=["'](?:#fff(?:fff)?|white)["'])(?=[^>]*(?:\bwidth=["']100%["']|\bwidth=["'][^"']+["']))(?=[^>]*(?:\bheight=["']100%["']|\bheight=["'][^"']+["']))[^>]*\/?>/i,
    ""
  );
}

function recolorSvgQr(svg: string, color: string): string {
  return svg
    .replace(/\bfill=["'](?:#000(?:000)?|black|rgb\\(0\\s*,\\s*0\\s*,\\s*0\\))["']/gi, `fill="${color}"`)
    .replace(/\bstroke=["'](?:#000(?:000)?|black|rgb\\(0\\s*,\\s*0\\s*,\\s*0\\))["']/gi, `stroke="${color}"`);
}

function fitSvgFontSize(text: string, maxWidth: number, startSize: number, minSize: number, widthFactor: number): number {
  let size = startSize;
  while (size > minSize) {
    if (estimateTextWidth(text, size, widthFactor) <= maxWidth) {
      return size;
    }
    size -= 2;
  }
  return minSize;
}

function estimateTextWidth(text: string, fontSize: number, widthFactor: number): number {
  return text.length * fontSize * widthFactor;
}

function normalizeSvgColor(value: string): string {
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#111111";
}

function escapeSvgText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeSvgAttribute(value: string): string {
  return escapeSvgText(value).replaceAll('"', "&quot;");
}
