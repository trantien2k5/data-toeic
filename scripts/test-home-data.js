// Kiểm tra: làm xong 1 đề, RELOAD trang (không bấm tab nào), tab Trang chủ
// (mặc định active) phải hiện đúng số liệu ngay — không cần đổi tab qua lại.
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 700 } });
  const page = await context.newPage();

  // Lượt 1: làm 1 đề để có dữ liệu trong localStorage.
  await page.goto('http://localhost:8771/index.html', { waitUntil: 'networkidle' });
  await page.click('#mobile-bottom-nav button[data-tab="exams"]');
  await page.waitForSelector('#screen-exam-list.active #exam-grid .level-card');
  await page.click('#screen-exam-list.active #exam-grid .level-card');
  await page.waitForSelector('#level-exam-grid .exam-card');
  await page.click('#level-exam-grid .exam-card button');
  await page.waitForSelector('#screen-quiz.active');
  const radios = await page.$$('#list-view input[type="radio"][value="A"]');
  for (const r of radios) await r.check();
  page.on('dialog', d => d.accept());
  await page.click('#btn-submit');
  await page.waitForSelector('.modal-overlay');
  await page.click('.modal-ok');
  await page.waitForSelector('#screen-result.active');

  // Lượt 2: RELOAD trang mới hoàn toàn (giống tắt mở lại app) — không click
  // tab nào cả, chỉ chờ load xong rồi đọc số liệu ở Trang chủ ngay.
  await page.goto('http://localhost:8771/index.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#tab-home.active #hero-progress-pct');
  await page.waitForTimeout(300);

  const answered = await page.locator('#ov-answered').innerText();
  const attempts = await page.locator('#ov-attempts').innerText();
  const heroPct = await page.locator('#hero-progress-pct').innerText();
  console.log('Đã làm (ov-answered):', answered);
  console.log('Lượt làm (ov-attempts):', attempts);
  console.log('Hero progress %:', heroPct);
  console.log('=> Có dữ liệu ngay khi load, KHÔNG cần đổi tab:', answered !== '0' || attempts !== '0');

  await page.screenshot({ path: 'shot-home-after-reload.png' });
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
