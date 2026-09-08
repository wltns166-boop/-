#!/usr/bin/env node
/**
 * intranet-guard — TEAM TOPS 인트라넷 자동 점검 (Stop 훅용)
 * CLAUDE.md 의 반복 함정(A~E)을 매 턴 종료 시 자동 검사한다.
 *
 * 치명 문제(JS 문법 오류 / HTML id 중복)가 있으면 exit code 2 로 보고하여
 * 모델이 마무리 전에 고치도록 유도한다. 경고(패턴 B 등)는 알리되 막지는 않는다.
 *
 * 동작 디렉터리: 프로젝트 루트. 대상: index.html
 */
import { readFileSync, existsSync } from 'node:fs';

const FILE = 'index.html';
if (!existsSync(FILE)) process.exit(0);   // 파일 없으면 조용히 통과

let html;
try { html = readFileSync(FILE, 'utf8'); } catch { process.exit(0); }

const errors = [];   // 치명 → exit 2
const warns  = [];   // 경고 → 알림만

// ── 함정 E: HTML id 중복 ───────────────────────────────
{
  const ids = {};
  const re = /id="([a-zA-Z0-9_]+)"/g;
  let m;
  while ((m = re.exec(html))) ids[m[1]] = (ids[m[1]] || 0) + 1;
  const dup = Object.keys(ids).filter(k => ids[k] > 1);
  if (dup.length) errors.push('HTML id 중복: ' + dup.join(', ') + ' (getElementById가 첫 요소만 잡아 렌더가 엉뚱한 곳으로 들어감)');
}

// ── 인라인 <script> JS 문법 검사 ───────────────────────
{
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, i = 0;
  while ((m = re.exec(html))) {
    i++;
    try { new Function(m[1]); }
    catch (e) { errors.push(`인라인 script #${i} 문법 오류: ${e.message}`); }
  }
}

// ── 함정 E(JS판): 전역 function 선언 이름 중복 ─────────
// 모든 인라인 script는 같은 전역 스코프 — 뒤에 선언된 동명 함수가 앞의 것을 조용히 덮어쓴다.
// (실사고 2026-09-08: 공지용 _pdfToImages가 청구용 동명 함수에 덮여 pages 생성이 항상 무음 실패)
// 들여쓰기 없는(0열) 선언만 검사 — 중첩 함수(draw/esc 등 지역 헬퍼)는 스코프가 달라 무해하므로 제외.
{
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  const names = {};
  let m;
  while ((m = re.exec(html))) {
    const fre = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
    let f;
    while ((f = fre.exec(m[1]))) names[f[1]] = (names[f[1]] || 0) + 1;
  }
  const dup = Object.keys(names).filter(k => names[k] > 1);
  if (dup.length) errors.push('전역 JS 함수명 중복: ' + dup.join(', ') + ' (뒤 선언이 앞 선언을 덮어써 조용한 오동작 — 하나를 리네임할 것)');
}

// ── 함정 B: try/catch 없는 raw localStorage.setItem ────
{
  const lines = html.split('\n');
  const offenders = [];
  lines.forEach((ln, idx) => {
    if (!ln.includes('localStorage.setItem')) return;
    if (ln.includes('_lsSet(')) return;
    if (ln.includes('try{') || ln.includes('try {')) return;       // 같은 줄 try
    const prev = (lines[idx - 1] || '');
    if (prev.includes('try{') || prev.includes('try {')) return;    // 직전 줄 try
    // 알려진 안전/예외 줄 (init·sv 내부·saveClaim 폴백)
    if (ln.includes("'tops_mem', JSON.stringify(DEFAULT_TEAM)")) return;
    if (ln.includes('localStorage.setItem(k, JSON.stringify(lsVal))')) return;
    offenders.push(idx + 1);
  });
  if (offenders.length) warns.push('try/catch 없는 localStorage.setItem (줄 ' + offenders.join(', ') + ') → _lsSet() 사용 권장');
}

// ── 결과 출력 ──────────────────────────────────────────
if (errors.length === 0 && warns.length === 0) process.exit(0);

const out = [];
if (errors.length) {
  out.push('🚨 intranet-guard: 마무리 전 고쳐야 할 문제');
  errors.forEach(e => out.push('  - ' + e));
}
if (warns.length) {
  out.push('⚠️ intranet-guard 경고(권장):');
  warns.forEach(w => out.push('  - ' + w));
}
const msg = out.join('\n');

if (errors.length) {
  // exit 2 → stderr가 모델에게 피드백으로 전달됨
  process.stderr.write(msg + '\n');
  process.exit(2);
} else {
  // 경고만: 막지 않음
  process.stdout.write(msg + '\n');
  process.exit(0);
}
