const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console.error: ' + msg.text()); });

  await page.goto('http://localhost:8772/index.html', { waitUntil: 'networkidle' });
  // Mặc định mở tab "Trang chủ" (tab-home), không phải Luyện đề — chờ hero
  // load xong mới chụp.
  await page.waitForSelector('#tab-home.active #hero-progress-pct', { timeout: 10000 });
  await page.screenshot({ path: 'shot-1-home.png' });

  // Mobile bottom nav: 5 tabs
  const tabs = await page.$$eval('#mobile-bottom-nav button', els => els.map(e => e.dataset.tab));
  console.log('bottom-nav tabs:', tabs);

  // Click "Luyện đề"
  await page.click('#mobile-bottom-nav button[data-tab="exams"]');
  await page.waitForSelector('#screen-exam-list.active #exam-grid .level-card');
  await page.screenshot({ path: 'shot-2-exams.png' });

  // Open level 1
  await page.click('#screen-exam-list.active #exam-grid .level-card');
  await page.waitForSelector('#level-exam-grid .exam-card');
  await page.screenshot({ path: 'shot-3-level-detail.png' });

  // Start first exam
  await page.click('#level-exam-grid .exam-card button');
  await page.waitForSelector('#screen-quiz.active');
  await page.screenshot({ path: 'shot-4-quiz.png' });

  // Exit exam -> bottom-sheet confirm modal
  await page.click('#exit-exam-btn');
  await page.waitForSelector('.modal-overlay');
  await page.waitForTimeout(400); // chờ animation slide-up của bottom-sheet xong
  await page.screenshot({ path: 'shot-5-modal.png' });
  await page.click('.modal-ok');
  await page.waitForSelector('#screen-exam-list.active');

  // Check other tabs
  for (const tab of ['home', 'reports', 'review', 'profile']) {
    await page.click(`#mobile-bottom-nav button[data-tab="${tab}"]`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `shot-tab-${tab}.png` });
  }

  // Drill into a report card
  await page.click('#mobile-bottom-nav button[data-tab="reports"]');
  await page.waitForSelector('#report-grid .level-card');
  await page.click('#report-grid .level-card');
  await page.waitForSelector('#stat-detail-trend.active, #stat-detail-level.active, #stat-detail-category.active, #stat-detail-time.active, #stat-detail-confusion.active, #stat-detail-exams.active, #stat-detail-history.active');
  await page.screenshot({ path: 'shot-report-detail.png' });
  // back button
  await page.click('#tab-reports .stat-back');
  await page.waitForSelector('#report-home.active');

  console.log('errors:', errors);
  console.log('DONE');
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
