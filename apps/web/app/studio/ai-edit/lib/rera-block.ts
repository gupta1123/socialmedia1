import { loadImage } from "./editor-files";

export interface ReraBlockInput {
  authorityLabel: string;
  registrationNumber: string;
  websiteUrl: string;
  textColor: string;
  qrSourceUrl?: string | null;
}

export interface ReraBlockOutput {
  dataUrl: string;
  width: number;
  height: number;
}

export async function createReraComplianceBlockImage(input: ReraBlockInput): Promise<ReraBlockOutput> {
  const width = 920;
  const height = 250;
  const paddingX = 4;
  const qrSize = input.qrSourceUrl ? 190 : 0;
  const qrX = width - qrSize - paddingX;
  const textMaxWidth = input.qrSourceUrl ? qrX - paddingX - 26 : width - paddingX * 2;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Unable to create the RERA block.");
  }

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = input.textColor;
  ctx.textBaseline = "alphabetic";

  ctx.font = "700 34px 'Helvetica Neue', Arial, sans-serif";
  ctx.fillText(input.authorityLabel, paddingX, 48, textMaxWidth);
  const labelWidth = Math.min(ctx.measureText(input.authorityLabel).width, textMaxWidth * 0.42);
  ctx.strokeStyle = input.textColor;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(paddingX + labelWidth + 16, 48);
  ctx.lineTo(textMaxWidth, 48);
  ctx.stroke();

  ctx.font = fitCanvasFont(ctx, input.registrationNumber, "700", textMaxWidth, 86, 42);
  ctx.fillText(input.registrationNumber, paddingX, 132, textMaxWidth);

  ctx.font = fitCanvasFont(ctx, input.websiteUrl, "700", textMaxWidth, 34, 22);
  ctx.fillText(input.websiteUrl, paddingX, 196, textMaxWidth);

  if (input.qrSourceUrl) {
    const qrImage = await loadImage(input.qrSourceUrl);
    ctx.drawImage(qrImage, qrX, 30, qrSize, qrSize);
  }

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width,
    height,
  };
}

function fitCanvasFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: "600" | "700" | "800",
  maxWidth: number,
  startSize: number,
  minSize: number
): string {
  let size = startSize;
  while (size > minSize) {
    const font = `${weight} ${size}px 'Helvetica Neue', Arial, sans-serif`;
    ctx.font = font;
    if (ctx.measureText(text).width <= maxWidth) {
      return font;
    }
    size -= 2;
  }
  return `${weight} ${minSize}px 'Helvetica Neue', Arial, sans-serif`;
}
