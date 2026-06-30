const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
  await page.goto('http://localhost:8768/index.html', { waitUntil: 'networkidle' });

  // Làm nhanh 1 đề (chọn đáp án bừa cho mỗi câu trong list-view) rồi nộp bài,
  // để có dữ liệu thật trong bảng "Lịch sử làm bài".
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

  // Sang Báo cáo > Lịch sử làm bài
  await page.click('#mobile-bottom-nav button[data-tab="reports"]');
  await page.waitForSelector('#report-grid .level-card');
  await page.click('#report-grid .level-card:has-text("Lịch sử")');
  await page.waitForSelector('#stat-detail-history.active #history-table');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shot-history-with-data.png' });

  const wrap = await page.locator('#stat-detail-history .table-scroll').boundingBox();
  const table = await page.locator('#history-table').boundingBox();
  const overflowX = await page.locator('#stat-detail-history .table-scroll').evaluate(el => getComputedStyle(el).overflowX);
  console.log('wrapper width:', wrap.width, '| table width:', table.width);
  console.log('overflow-x của wrapper:', overflowX);
  console.log('table rộng hơn wrapper (sẽ cuộn ngang):', table.width > wrap.width + 1);

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
