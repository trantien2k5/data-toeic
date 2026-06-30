// Resize icons/icon.png (ảnh gốc 1254x1254, ~1.4MB) thành các size chuẩn cho
// PWA manifest + favicon, dùng Chromium (đã có sẵn qua Playwright) để vẽ lại
// qua <canvas> — không cần cài thêm sharp/ImageMagick.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'icons', 'icon.png');
const OUT_DIR = path.join(__dirname, '..', 'icons');
const SIZES = [512, 192, 32];

async function main() {
  const srcBuffer = fs.readFileSync(SRC);
  const srcBase64 = srcBuffer.toString('base64');

  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const size of SIZES) {
    const dataUrl = await page.evaluate(async ({ base64, size }) => {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = 'data:image/png;base64,' + base64;
      });

      // Thu nhỏ DẦN từng nửa (1254 -> 627 -> ... -> size) thay vì 1 bước
      // duy nhất. Giảm tỉ lệ lớn (vd 1254 -> 32, ~39 lần) trong 1 lần vẽ dễ
      // bị răng cưa/vỡ chi tiết nhỏ vì bộ lọc của canvas không mipmap như
      // phần mềm ảnh chuyên dụng — chia nhỏ thành nhiều bước x0.5 giữ chi
      // tiết mượt hơn hẳn, đây là kỹ thuật downscale tiêu chuẩn.
      let srcCanvas = img;
      let curW = img.naturalWidth;
      let curH = img.naturalHeight;
      while (curW > size * 2) {
        const nextW = Math.max(size, Math.round(curW / 2));
        const nextH = Math.max(size, Math.round(curH / 2));
        const stepCanvas = document.createElement('canvas');
        stepCanvas.width = nextW;
        stepCanvas.height = nextH;
        const stepCtx = stepCanvas.getContext('2d');
        stepCtx.imageSmoothingEnabled = true;
        stepCtx.imageSmoothingQuality = 'high';
        stepCtx.drawImage(srcCanvas, 0, 0, curW, curH, 0, 0, nextW, nextH);
        srcCanvas = stepCanvas;
        curW = nextW;
        curH = nextH;
      }

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(srcCanvas, 0, 0, curW, curH, 0, 0, size, size);
      return canvas.toDataURL('image/png');
    }, { base64: srcBase64, size });

    const outBuffer = Buffer.from(dataUrl.split(',')[1], 'base64');
    const outPath = path.join(OUT_DIR, `icon-${size}.png`);
    fs.writeFileSync(outPath, outBuffer);
    console.log(`Đã tạo ${outPath} (${(outBuffer.length / 1024).toFixed(0)} KB)`);
  }

  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
