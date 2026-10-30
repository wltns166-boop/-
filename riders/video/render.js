// 특약 교육 영상 렌더러: template.html 을 시간별로 그려 ffmpeg 로 MP4 를 만든다.
// 사용법:
//   node render.js <작업폴더/카테고리id> <출력.mp4> [fps]
//   node render.js <작업폴더/카테고리id> --stills <출력폴더> t1 t2 ...   (미리보기 이미지)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const [dir, outArg, ...rest] = process.argv.slice(2);
const tl = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
const tpl = 'file://' + path.join(__dirname, 'template.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(tpl);
  await page.evaluate(t => window.setup(t), tl);

  if (outArg === '--stills') {
    const [outDir, ...times] = rest;
    fs.mkdirSync(outDir, { recursive: true });
    for (const t of times) {
      await page.evaluate(x => window.render(x), +t);
      await page.screenshot({ path: path.join(outDir, `${tl.id}_${t}.png`) });
    }
    await browser.close();
    return;
  }

  const fps = +(rest[0] || 30);
  const frames = Math.ceil(tl.duration * fps);
  const audio = path.join(dir, 'mix.wav');
  const ff = spawn('ffmpeg', [
    '-v', 'error', '-y',
    '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-',
    '-i', audio,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-tune', 'stillimage',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart',
    outArg,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const t0 = Date.now();
  let lastKey = null, buf = null, shots = 0;
  for (let f = 0; f < frames; f++) {
    const key = await page.evaluate(x => window.render(x), f / fps);
    if (key !== lastKey || !buf) { buf = await page.screenshot({ type: 'jpeg', quality: 92 }); shots++; }
    lastKey = key;
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % (fps * 20) === 0) console.log(`${tl.id}: ${f}/${frames} frames, ${shots} captures (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  console.log(`${tl.id}: done → ${outArg}`);
})();
