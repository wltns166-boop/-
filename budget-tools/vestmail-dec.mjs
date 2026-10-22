// VestMail(예티소프트) 보안 메일 HTML을 헤드리스 브라우저에서 비밀번호로 복호화해 본문 HTML을 저장
import { chromium } from 'playwright-core';
import fs from 'fs';
const [,, file, pw, out] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
const p = await b.newPage({ viewport: { width: 1000, height: 1400 } });
const dialogs = [];
p.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
const reqs = [];
p.on('requestfailed', r => reqs.push('FAIL ' + r.url() + ' ' + (r.failure() || {}).errorText));
p.on('response', r => reqs.push(r.status() + ' ' + r.url()));
await p.route('**/*', r => { const u = r.request().url(); (u.startsWith('file:') || /samsungcard\.com/.test(u)) ? r.continue() : r.abort(); });
await p.goto('file://' + file);
await p.waitForTimeout(500);
await p.fill('#password', pw);
await p.evaluate(() => doAction());
await p.waitForURL(/UBLDRP0201M0|statement/, { timeout: 30000 }).catch(() => {});
await p.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(2000);
// 삼성카드 명세서: '더보기'를 끝까지 눌러 전체 내역을 펼친 뒤 행을 추출
for (let i = 0; i < 20; i++) {
  const more = await p.$('button.more_view_arr');
  if (!more) break;
  await more.click().catch(() => {});
  await p.waitForTimeout(1200);
}
const rows = await p.evaluate(() => [...document.querySelectorAll('li.li')].map(li => {
  const g = sel => { const e = li.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
  return { desc: g('.store_2') || g('.name'), amount: g('.abs_em strong'), date: g('.td.date'), card: g('.td.clr'), head: g('.head') };
}).filter(r => r.date && r.amount));
const header = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300));
fs.writeFileSync(out + '.rows.json', JSON.stringify({ header, rows }, null, 1));
console.log('rows:', rows.length, 'sum:', rows.reduce((s, r) => s + Number(r.amount.replace(/[^\d]/g, '')), 0));
await p.screenshot({ path: out + '.png', fullPage: true }).catch(() => {});
const html = await p.evaluate(() => document.documentElement.outerHTML);
const text = await p.evaluate(() => document.body ? document.body.innerText : '');
fs.writeFileSync(out, html);
console.log(JSON.stringify({ reqs, dialogs, textLen: text.length, tables: (html.match(/<table/gi) || []).length, head: text.replace(/\s+/g, ' ').slice(0, 400) }));
await b.close();
