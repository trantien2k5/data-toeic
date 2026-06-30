// Kiểm tra bug: chế độ "Xem từng câu" lúc đang thi, đáp án cuối cùng có bị
// thanh nút Trước/Tiếp (fixed bottom) che mất không.
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
  await page.goto('http://localhost:8769/index.html', { waitUntil: 'networkidle' });

  await page.click('#mobile-bottom-nav button[data-tab="exams"]');
  await page.waitForSelector('#screen-exam-list.active #exam-grid .level-card');
  await page.click('#screen-exam-list.active #exam-grid .level-card');
  await page.waitForSelector('#level-exam-grid .exam-card');
  await page.click('#level-exam-grid .exam-card button');
  await page.waitForSelector('#screen-quiz.active');

  // Chuyển sang "Xem từng câu" (single view)
  await page.click('#btn-toggle-view');
  await page.waitForSelector('#single-view:not(.hidden)');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shot-single-view.png' });

  const lastOption = page.locator('#q-options .option').last();
  const optBox = await lastOption.boundingBox();
  const navBox = await page.locator('.nav-buttons').boundingBox();
  console.log('Đáp án cuối: top=', optBox.y, 'bottom=', optBox.y + optBox.height);
  console.log('Thanh nav-buttons: top=', navBox.y, 'height=', navBox.height, 'bottom=', navBox.y + navBox.height);
  const overlap = (optBox.y + optBox.height) > navBox.y;
  console.log('Bị che:', overlap, '— lệch:', (optBox.y + optBox.height) - navBox.y, 'px');

  const mainColPB = await page.locator('.main-col').evaluate(el => getComputedStyle(el).paddingBottom);
  console.log('main-col padding-bottom hiện tại:', mainColPB);
  const bodyClass = await page.evaluate(() => document.body.className);
  console.log('body class:', bodyClass);

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
