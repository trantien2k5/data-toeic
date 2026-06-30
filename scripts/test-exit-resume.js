const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
  await page.goto('http://localhost:8772/index.html', { waitUntil: 'networkidle' });

  await page.click('#mobile-bottom-nav button[data-tab="exams"]');
  await page.waitForSelector('#screen-exam-list.active #exam-grid .level-card');
  await page.click('#screen-exam-list.active #exam-grid .level-card');
  await page.waitForSelector('#level-exam-grid .exam-card');
  const examTitle = await page.locator('#level-exam-grid .exam-card h3').first().innerText();
  console.log('Đề đang test:', examTitle);
  await page.click('#level-exam-grid .exam-card button');
  await page.waitForSelector('#screen-quiz.active');

  // Trả lời 3 câu đầu trong list-view.
  const radios = await page.$$('#list-view input[type="radio"][value="A"]');
  for (let i = 0; i < 3; i++) await radios[i].check();
  await page.waitForTimeout(100);

  const word1 = await page.locator('#list-view .q-card').first().locator('.q-text').innerText();
  console.log('Câu 1:', word1);

  // Thoát đề (xác nhận thoát) — quay thẳng về "Danh sách đề" (screen-exam-list).
  await page.click('#exit-exam-btn');
  await page.waitForSelector('.modal-overlay');
  await page.click('.modal-ok');
  await page.waitForSelector('#screen-exam-list.active');

  // Vào lại đúng level rồi đúng đề đó.
  await page.click('#screen-exam-list.active #exam-grid .level-card');
  await page.waitForSelector('#level-exam-grid .exam-card');
  const badgeText = await page.locator('#level-exam-grid .exam-card').first().locator('.status-badge').innerText();
  const btnText = await page.locator('#level-exam-grid .exam-card').first().locator('button').innerText();
  console.log('Badge trạng thái sau khi thoát:', badgeText.trim());
  console.log('Nút bấm sau khi thoát:', btnText.trim());

  await page.click('#level-exam-grid .exam-card button');
  await page.waitForSelector('#screen-quiz.active');
  await page.waitForTimeout(200);

  const answeredCount = await page.locator('#answered-count').innerText();
  const word1Again = await page.locator('#list-view .q-card').first().locator('.q-text').innerText();
  const firstOptionChecked = await page.locator('#list-view .q-card').first().locator('input[type="radio"]:checked').count();

  console.log('Sau khi vào lại — Đã làm:', answeredCount);
  console.log('Câu 1 (vào lại):', word1Again, '— cùng câu cũ:', word1Again === word1);
  console.log('Số đáp án đã được tick sẵn ở câu 1:', firstOptionChecked);
  console.log('=> CÒN GIỮ tiến độ cũ (bug nếu true):', answeredCount !== 'Đã làm: 0/20' || firstOptionChecked > 0);

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
