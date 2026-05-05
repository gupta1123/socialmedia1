import type { CanvasLayer, CanvasTextLayer, CanvasImageLayer, CanvasShapeLayer, CanvasDrawLayer, EditableImage } from "./editor-types";
import { isLayerVisible } from "./editor-types";
import { getElementById } from "./elements-registry";

export async function renderCompositionToFile(
  sourceImage: EditableImage,
  layers: CanvasLayer[],
  fileName: string
): Promise<File> {
  const sourceUrl = URL.createObjectURL(sourceImage.file);

  try {
    const image = await loadImage(sourceUrl);
    const canvas = document.createElement("canvas");
    canvas.width = sourceImage.width;
    canvas.height = sourceImage.height;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Unable to export the composition.");
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const layer of layers) {
      if (!isLayerVisible(layer)) {
        continue;
      }

      ctx.save();
      ctx.globalAlpha = layer.opacity;

      if (layer.type === "image") {
        const layerImage = await loadImage(layer.src);
        applyCanvasFilter(ctx, layer.filter);
        drawRotated(ctx, layer.x * canvas.width, layer.y * canvas.height, layer.width * canvas.width, layer.height * canvas.height, layer.rotation, () => {
          drawContainedImage(ctx, layerImage, layer.width * canvas.width, layer.height * canvas.height);
        });
      } else if (layer.type === "shape") {
        if (layer.svgElementId) {
          const svgDef = getElementById(layer.svgElementId);
          if (svgDef) {
            let svgString = svgDef.svg;
            
            // Inject width and height to prevent 0x0 rendering bug in canvas
            if (!svgString.includes('width=')) {
              svgString = svgString.replace('<svg ', '<svg width="100%" height="100%" ');
            }

            if (layer.fill) {
              svgString = svgString.replace(/fill="currentColor"/g, `fill="${layer.fill}"`)
                                   .replace(/stroke="currentColor"/g, `stroke="${layer.fill}"`)
                                   .replace(/color="currentColor"/g, `color="${layer.fill}"`);
            }

            const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
            const layerImage = await loadImage(svgDataUrl);
            
            drawRotated(ctx, layer.x * canvas.width, layer.y * canvas.height, layer.width * canvas.width, layer.height * canvas.height, layer.rotation, () => {
              drawContainedImage(ctx, layerImage, layer.width * canvas.width, layer.height * canvas.height);
            });
          }
        } else {
          drawShapeLayer(ctx, layer, canvas.width, canvas.height);
        }
      } else if (layer.type === "draw") {
        drawFreehandLayer(ctx, layer, canvas.width, canvas.height);
      } else {
        drawWrappedText(ctx, layer, canvas.width, canvas.height);
      }

      ctx.restore();
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (!value) {
          reject(new Error("Unable to export the composition."));
          return;
        }
        resolve(value);
      }, "image/png");
    });

    return new File([blob], fileName, { type: "image/png" });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export function drawShapeLayer(
  ctx: CanvasRenderingContext2D,
  layer: CanvasShapeLayer,
  canvasWidth: number,
  canvasHeight: number
) {
  const x = layer.x * canvasWidth;
  const y = layer.y * canvasHeight;
  const width = layer.width * canvasWidth;
  const height = layer.height * canvasHeight;

  ctx.fillStyle = layer.fill;
  drawRotated(ctx, x, y, width, height, layer.rotation, () => {
    if (layer.shape === "circle") {
      ctx.beginPath();
      ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (layer.shape === "triangle") {
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();
      return;
    }

    if (layer.shape === "star") {
      drawStarPath(ctx, width / 2, height / 2, Math.min(width, height) / 2, Math.min(width, height) / 4);
      ctx.fill();
      return;
    }

    roundedRect(ctx, 0, 0, width, height, layer.shape === "badge" ? height / 2 : Math.min(width, height) * 0.08);
    ctx.fill();

    if (layer.shape === "badge") {
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 ${Math.max(12, height * 0.34)}px 'Helvetica Neue', Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("NEW", width / 2, height / 2, width * 0.78);
    }
  });
}

export function drawFreehandLayer(
  ctx: CanvasRenderingContext2D,
  layer: CanvasDrawLayer,
  canvasWidth: number,
  canvasHeight: number
) {
  if (layer.points.length < 1) return;

  ctx.save();
  ctx.strokeStyle = layer.color;
  ctx.lineWidth = layer.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();

  layer.points.forEach((point, index) => {
    const x = point.x * canvasWidth;
    const y = point.y * canvasHeight;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();
  ctx.restore();
}

export function drawRotated(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  draw: () => void
) {
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-width / 2, -height / 2);
  draw();
  ctx.restore();
}

export function drawContainedImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number },
  targetWidth: number,
  targetHeight: number
) {
  const sourceWidth = "naturalWidth" in image && typeof image.naturalWidth === "number" && image.naturalWidth > 0
    ? image.naturalWidth
    : "width" in image && typeof image.width === "number" && image.width > 0
      ? image.width
      : null;
  const sourceHeight = "naturalHeight" in image && typeof image.naturalHeight === "number" && image.naturalHeight > 0
    ? image.naturalHeight
    : "height" in image && typeof image.height === "number" && image.height > 0
      ? image.height
      : null;

  if (!sourceWidth || !sourceHeight || targetWidth <= 0 || targetHeight <= 0) {
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
    return;
  }

  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = (targetWidth - drawWidth) / 2;
  const offsetY = (targetHeight - drawHeight) / 2;

  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
}

export function applyCanvasFilter(ctx: CanvasRenderingContext2D, filter: CanvasImageLayer["filter"]) {
  ctx.filter = filter === "grayscale" ? "grayscale(1)" : filter === "sepia" ? "sepia(0.85)" : "none";
}

export function drawStarPath(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number
) {
  ctx.beginPath();
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = (Math.PI * 2 * index) / 10 - Math.PI / 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

export function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  layer: CanvasTextLayer,
  canvasWidth: number,
  canvasHeight: number
) {
  const x = layer.x * canvasWidth;
  const y = layer.y * canvasHeight;
  const maxWidth = layer.width * canvasWidth;
  const fontSize = layer.fontSize;
  const lineHeight = fontSize * layer.lineHeight;
  const paragraphs = layer.text.split(/\n/g);
  const lines: string[] = [];

  ctx.font = `${layer.fontWeight} ${fontSize}px ${layer.fontFamily}`;
  ctx.fillStyle = layer.color;
  ctx.textAlign = layer.align;
  ctx.textBaseline = "top";
  ctx.shadowColor = layer.shadow ? "rgba(0, 0, 0, 0.3)" : "transparent";
  ctx.shadowBlur = layer.shadow ? Math.max(6, fontSize * 0.12) : 0;
  ctx.shadowOffsetY = layer.shadow ? Math.max(2, fontSize * 0.06) : 0;

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().length > 0 ? paragraph.split(/\s+/g) : [""];
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (measureTextWithLetterSpacing(ctx, testLine, layer.letterSpacing) <= maxWidth || !currentLine) {
        currentLine = testLine;
        continue;
      }

      lines.push(currentLine);
      currentLine = word;
    }

    lines.push(currentLine);
  }

  const alignedX = layer.align === "center" ? maxWidth / 2 : layer.align === "right" ? maxWidth : 0;
  const blockHeight = Math.max(lineHeight, lines.length * lineHeight);

  drawRotated(ctx, x, y, maxWidth, blockHeight, layer.rotation, () => {
    if (!isTransparentColorForCanvas(layer.backgroundColor)) {
      ctx.save();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = layer.backgroundColor;
      roundedRect(ctx, -fontSize * 0.22, -fontSize * 0.18, maxWidth + fontSize * 0.44, blockHeight + fontSize * 0.28, fontSize * 0.16);
      ctx.fill();
      ctx.restore();
    }

    ctx.font = `${layer.fontWeight} ${fontSize}px ${layer.fontFamily}`;
    ctx.fillStyle = layer.color;
    ctx.textAlign = layer.align;
    ctx.textBaseline = "top";
    ctx.shadowColor = layer.shadow ? "rgba(0, 0, 0, 0.3)" : "transparent";
    ctx.shadowBlur = layer.shadow ? Math.max(6, fontSize * 0.12) : 0;
    ctx.shadowOffsetY = layer.shadow ? Math.max(2, fontSize * 0.06) : 0;

    lines.forEach((line, index) => {
      const nextY = index * lineHeight;
      if (y + nextY <= canvasHeight) {
        fillTextWithLetterSpacing(ctx, line, alignedX, nextY, layer.letterSpacing);
      }
    });
  });
}

function isTransparentColorForCanvas(value: string): boolean {
  return value === "transparent" || value === "#00000000" || value.trim().length === 0;
}

function measureTextWithLetterSpacing(ctx: CanvasRenderingContext2D, text: string, letterSpacing: number) {
  if (text.length <= 1) return ctx.measureText(text).width;
  return ctx.measureText(text).width + (text.length - 1) * letterSpacing;
}

function fillTextWithLetterSpacing(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacing: number
) {
  if (letterSpacing === 0 || text.length <= 1) {
    ctx.fillText(text, x, y);
    return;
  }

  const totalWidth = measureTextWithLetterSpacing(ctx, text, letterSpacing);
  let cursorX = ctx.textAlign === "center" ? x - totalWidth / 2 : ctx.textAlign === "right" ? x - totalWidth : x;

  for (const char of text) {
    ctx.fillText(char, cursorX, y);
    cursorX += ctx.measureText(char).width + letterSpacing;
  }
}

async function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (/^https?:\/\//i.test(source)) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = source;
  });
}
