// Kiểm tra cụ thể bug "xê dịch trang khi đổi tab" — đo vị trí trái của
// .app-body trên màn hình desktop (có thanh cuộn thật, không phải overlay
// như mobile) ở tab ngắn (Trang chủ) so với tab dài (Luyện đề).
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 700 } });
  await page.goto('http://localhost:8767/index.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#tab-home.active #hero-progress-pct');

  const homeBox = await page.locator('.app-body').boundingBox();
  console.log('Tab Trang chủ — .app-body left:', homeBox.x, 'width:', homeBox.width);

  await page.click('#top-tabs button[data-tab="exams"]');
  await page.waitForSelector('#tab-exams.active #exam-grid .level-card');
  await page.waitForTimeout(200);

  const examsBox = await page.locator('.app-body').boundingBox();
  console.log('Tab Luyện đề — .app-body left:', examsBox.x, 'width:', examsBox.width);

  const shift = Math.abs(homeBox.x - examsBox.x);
  console.log('Lệch ngang:', shift, 'px ->', shift < 1 ? 'OK, không lệch' : 'VẪN LỆCH');

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
