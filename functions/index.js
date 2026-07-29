// TEAM TOPS — AI API 중계 함수 (구글 Gemini / Anthropic Claude)
// 프론트엔드(index.html)의 보장분석 기능이 호출하는 /api/analyze 엔드포인트.
// API 키를 브라우저에 노출하지 않기 위해 서버(Cloud Functions)에서 중계한다.
// 모델 이름으로 분기: "gemini-*" → 구글 Gemini, "claude-*" → Anthropic Claude.
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

// ═══════════════════════════════════════════════════════════════
// 카카오톡 일일보고서 자동 발송 ("나에게 보내기" API)
//   - 설정/토큰은 Firestore `kakao_private` 컬렉션에 저장 (보안규칙으로 클라이언트 접근 차단 — 서버 전용)
//   - cfg 문서:    { restKey, clientSecret?, enabled, sendTime:'HH:MM', skipWeekend, lastSentDate, logs:[...] }
//   - tokens 문서: { users: { [카카오ID]: { nick, rt, at, atExp, linkedAt, needsRelink? } } }
//   - 매 5분 스케줄(kakaoDaily)이 KST 기준 발송시각 도달 여부를 검사해 하루 1회 발송
// ═══════════════════════════════════════════════════════════════
const KK_CFG = () => admin.firestore().collection("kakao_private").doc("cfg");
const KK_TOK = () => admin.firestore().collection("kakao_private").doc("tokens");
const KK_DATA = () => admin.firestore().collection("tops").doc("data");
const KK_SITE = "https://team-tops-intranet.web.app";
// OAuth Redirect URI는 서버에서 고정 — 클라이언트가 보낸 값을 쓰면 공격자가 자기 도메인으로
// 인가 코드를 가로채는 경로가 생긴다 (카카오 앱에도 이 주소만 등록)
const KK_REDIRECT = KK_SITE + "/kakao-link.html";

function _kkPad(n) { return String(n).padStart(2, "0"); }
// KST 현재 시각 — 이후 getUTC* 로 읽으면 한국시간이 나온다
function _kkNow() { return new Date(Date.now() + 9 * 3600 * 1000); }
function _kkToday() { const d = _kkNow(); return d.getUTCFullYear() + "-" + _kkPad(d.getUTCMonth() + 1) + "-" + _kkPad(d.getUTCDate()); }
function _kkYm() { return _kkToday().slice(0, 7); }
function _kkHm() { const d = _kkNow(); return _kkPad(d.getUTCHours()) + ":" + _kkPad(d.getUTCMinutes()); }

// 카카오 API 호출 (form-urlencoded)
async function _kkForm(url, params, bearer) {
  const body = new URLSearchParams();
  Object.keys(params).forEach((k) => { if (params[k] !== undefined && params[k] !== null && params[k] !== "") body.append(k, params[k]); });
  const headers = { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" };
  if (bearer) headers.Authorization = "Bearer " + bearer;
  const r = await fetch(url, { method: "POST", headers, body: body.toString() });
  let j; try { j = await r.json(); } catch (e) { j = {}; }
  return { ok: r.ok, status: r.status, data: j };
}

// index.html 일일보고서와 동일한 집계: 당월 인정/영수/건수 + 스냅샷 diff로 "오늘 반영"
function _kkPerfMonth(p, ym) {
  if (p && p.ym) return String(p.ym);
  if (p && p.d && /^\d{4}-\d{2}/.test(p.d)) return String(p.d).slice(0, 7);
  return ym;
}
function _kkAggFor(prf, ym) {
  const a = {};
  (prf || []).forEach((p) => {
    if (_kkPerfMonth(p, ym) !== ym || !p.m) return;
    if (!a[p.m]) a[p.m] = { c: 0, a: 0, ay: 0 };
    a[p.m].c += +p.c || 0; a[p.m].a += +p.a || 0; a[p.m].ay += +p.ay || 0;
  });
  return a;
}
function _kkSum(slim) {
  const r = { c: 0, a: 0, ay: 0 };
  Object.keys(slim || {}).forEach((n) => { const v = slim[n] || [0, 0, 0]; r.c += v[0] || 0; r.a += v[1] || 0; r.ay += v[2] || 0; });
  return r;
}

// 일별 스냅샷 기록(서버판 _dsnapRecord) — 오늘 상태를 dsnap에 반영하고 관련 데이터 반환.
// 발송 시각과 별개로 매일 밤 마감 기록(kakaoDaily)에도 사용된다.
async function _kkRecordSnapshot() {
  const snap = await KK_DATA().get();
  const d = snap.exists ? (snap.data() || {}) : {};
  const prf = Array.isArray(d.prf) ? d.prf : [];
  let dsnap = Array.isArray(d.dsnap) ? d.dsnap.slice() : [];
  const ym = _kkYm(), today = _kkToday();

  // 오늘 스냅샷 최신화 (변동 없으면 스킵 — 클라이언트 _dsnapRecord와 동일 규칙)
  const agg = _kkAggFor(prf, ym);
  const slim = {};
  Object.keys(agg).forEach((n) => { slim[n] = [agg[n].c, agg[n].a, agg[n].ay]; });
  let idx = -1;
  dsnap.forEach((s, i) => { if (s && s.d === today) idx = i; });
  let changed = false;
  if (idx >= 0) {
    if (dsnap[idx].ym !== ym || JSON.stringify(dsnap[idx].agg) !== JSON.stringify(slim)) {
      dsnap[idx] = { d: today, ym, agg: slim }; changed = true;
    }
  } else { dsnap.push({ d: today, ym, agg: slim }); changed = true; }
  let wrote = true; // 저장 성공 여부 — 마감 기록 게이트(lastSnapDate)가 이 값으로 판단
  if (changed) {
    dsnap.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    while (dsnap.length > 60) dsnap.shift();
    try { await KK_DATA().set({ dsnap }, { merge: true }); }
    catch (e) { wrote = false; console.warn("dsnap 서버 기록 실패:", e.message); }
  }
  return { d, dsnap, slim, ym, today, wrote };
}

// 보고서 요약 계산 (스냅샷 최신화 포함)
async function _kkBuildSummary() {
  const rec = await _kkRecordSnapshot();
  const d = rec.d, dsnap = rec.dsnap, slim = rec.slim, ym = rec.ym, today = rec.today;
  const drcfg = (d.drcfg && typeof d.drcfg === "object") ? d.drcfg : {};

  // 직전 스냅샷 대비 "오늘 반영" (전월 스냅샷이면 비교 기반 없음 → 당월 전체가 신규)
  const sorted = dsnap.slice().sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  let prevS = null;
  for (let i = sorted.length - 1; i >= 0; i--) { if (sorted[i].d < today) { prevS = sorted[i]; break; } }
  const base = (prevS && prevS.ym === ym) ? prevS.agg : {};
  const cur = _kkSum(slim), prev = _kkSum(base);
  const diff = { c: cur.c - prev.c, a: cur.a - prev.a, ay: cur.ay - prev.ay };

  const goal = +(drcfg.goal || 10000000);
  const rate = goal > 0 ? Math.round(cur.a / goal * 1000) / 10 : 0;
  const won = (n) => (n || 0).toLocaleString("ko-KR");
  const dt = _kkNow();
  const yoil = ["일", "월", "화", "수", "목", "금", "토"][dt.getUTCDay()];
  const head = "📊 TEAM TOPS 일일보고 " + (dt.getUTCMonth() + 1) + "/" + dt.getUTCDate() + "(" + yoil + ")";
  const lines = [];
  if (prevS) lines.push("오늘 반영: 인정 " + won(diff.a) + "원 / " + diff.c + "건");
  else lines.push("오늘 반영: 집계 시작 (내일부터 표시)");
  lines.push("월 누적: 인정 " + won(cur.a) + "원 · 영수 " + won(cur.ay) + "원 · " + cur.c + "건");
  lines.push("목표 대비 " + rate + "% (목표 " + won(goal) + "원)");
  let text = head + "\n" + lines.join("\n");
  if (text.length > 200) text = text.slice(0, 199) + "…"; // 카카오 텍스트 템플릿 200자 제한
  return { text, title: head, desc: lines.join("\n") };
}

// ── 보고서 화면 캡처 (헤드리스 크로미움) ─────────────────────
// 서버가 실제 인트라넷 일일보고서 페이지를 열어 #dr_paper 를 이미지로 찍는다.
// 클라이언트와 동일한 화면이 나오므로 보고서 로직을 서버에 중복 구현할 필요가 없다.
// ?rr=1 : 렌더 모드(푸시 초기화·드라이브 정리 등 부수효과 생략), &dr=1 : 일일보고서로 자동 이동
async function _kkCaptureReport() {
  const chromium = require("@sparticuz/chromium");
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({
    args: [...chromium.args, "--lang=ko-KR"],
    executablePath: await chromium.executablePath(),
    headless: chromium.headless, // 공식 권장값 — 이 바이너리는 headless_shell 빌드('shell')
    defaultViewport: { width: 1100, height: 1400, deviceScaleFactor: 1.5 }
  });
  try {
    const page = await browser.newPage();
    await page.emulateTimezone("Asia/Seoul"); // _drToday()/_curYm() 이 KST 기준으로 계산되도록
    // 관리자 세션 주입 — 클라이언트 복원 로직이 ADMINS 이름 매칭으로 유효 처리
    await page.evaluateOnNewDocument(() => {
      try { sessionStorage.setItem("tops_session", JSON.stringify({ id: "render", name: "백동현", role: "BM", admin: true })); } catch (e) {}
    });
    await page.goto(KK_SITE + "/?rr=1&dr=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    // _drRendered 만으로는 부족 — 헤드리스 세션은 로컬 캐시가 없어 Firestore 로드가
    // 실패하면 "실적 0원" 빈 보고서가 그려진다. 구성원 데이터(mem)가 실제로 로드됐는지
    // 함께 확인해, 로드 실패 시 캡처를 포기(타임아웃)하고 텍스트 요약 폴백으로 보낸다.
    await page.waitForFunction(
      "window._drRendered===true && typeof mem!=='undefined' && Array.isArray(mem) && mem.length>0",
      { timeout: 90000, polling: 500 }
    );
    // 웹폰트(Noto Sans KR) 로딩 대기 — 한글 깨짐 방지 (최대 10초, 매달리지 않게 race)
    await Promise.race([
      page.evaluate(() => document.fonts.ready),
      new Promise((r) => setTimeout(r, 10000))
    ]).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500)); // 레이아웃 안정화
    const el = await page.$("#dr_paper");
    if (!el) throw new Error("dr_paper 요소 없음");
    return await el.screenshot({ type: "jpeg", quality: 85 });
  } finally {
    await browser.close().catch(() => {});
  }
}

// 캡처 이미지를 Storage(daily_reports/auto/)에 올리고 다운로드 토큰 URL 반환
async function _kkUploadReport(buf) {
  const crypto = require("crypto");
  const token = crypto.randomUUID();
  const name = "daily_reports/auto/" + _kkToday() + "-" + crypto.randomBytes(8).toString("hex") + ".jpg";
  const bucket = admin.storage().bucket();
  await bucket.file(name).save(buf, {
    metadata: { contentType: "image/jpeg", metadata: { firebaseStorageDownloadTokens: token } }
  });
  // 30일 지난 자동발송 이미지 정리 (무한 누적 방지 — 실패해도 발송엔 지장 없게 베스트에포트)
  try {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const [files] = await bucket.getFiles({ prefix: "daily_reports/auto/" });
    await Promise.all(files.filter((f) => {
      const d = f.name.slice("daily_reports/auto/".length, "daily_reports/auto/".length + 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(d) && d < cutoff;
    }).map((f) => f.delete().catch(() => {})));
  } catch (e) { console.warn("오래된 보고서 이미지 정리 실패(무시):", String((e && e.message) || e)); }
  return "https://firebasestorage.googleapis.com/v0/b/" + bucket.name + "/o/" + encodeURIComponent(name) + "?alt=media&token=" + token;
}

// 토큰 갱신 후 유효한 access_token 확보 (만료 10분 전이면 미리 갱신)
async function _kkAccessToken(cfg, u) {
  if (u.at && u.atExp && Date.now() < u.atExp - 10 * 60 * 1000) return { at: u.at };
  const r = await _kkForm("https://kauth.kakao.com/oauth/token", {
    grant_type: "refresh_token", client_id: cfg.restKey, client_secret: cfg.clientSecret, refresh_token: u.rt
  });
  if (!r.ok || !r.data.access_token) {
    return { err: (r.data.error_description || r.data.error || ("토큰 갱신 실패 " + r.status)), relink: r.status === 400 || r.status === 401 };
  }
  const upd = { at: r.data.access_token, atExp: Date.now() + (r.data.expires_in || 21600) * 1000 };
  if (r.data.refresh_token) upd.rt = r.data.refresh_token; // 만료 임박 시에만 새로 발급됨
  return { at: upd.at, upd };
}

// 연동된 전원(또는 onlyId 한 명)에게 발송. kind: 'auto' | 'test'
async function _kkSendAll(kind, onlyId) {
  const [cfgSnap, tokSnap] = await Promise.all([KK_CFG().get(), KK_TOK().get()]);
  const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
  const tok = tokSnap.exists ? (tokSnap.data() || {}) : {};
  const users = tok.users || {};
  const ids = Object.keys(users)
    .filter((id) => users[id] && users[id].approved) // 승인된 수신자만
    .filter((id) => !onlyId || id === String(onlyId)); // 개인별 테스트 발송 지원
  if (!cfg.restKey) return { ok: false, error: "REST API 키가 등록되지 않았습니다." };
  if (!ids.length) return { ok: false, error: onlyId ? "해당 수신자가 없거나 미승인 상태입니다." : "승인된 수신자가 없습니다. 연동 후 [승인]을 눌러주세요." };

  const sum = await _kkBuildSummary();
  const link = KK_SITE + "/?dr=1";
  // 보고서 화면 전체를 이미지로 캡처 — 실패하면 텍스트 요약으로 자동 대체
  let imgUrl = null;
  try {
    const buf = await _kkCaptureReport();
    imgUrl = await _kkUploadReport(buf);
  } catch (e) {
    console.warn("보고서 캡처 실패 — 텍스트 요약으로 대체:", String((e && e.message) || e));
  }
  const tpl = imgUrl
    ? JSON.stringify({
        object_type: "feed",
        content: {
          title: sum.title, description: sum.desc,
          image_url: imgUrl,
          link: { web_url: imgUrl, mobile_web_url: imgUrl }
        },
        buttons: [
          { title: "보고서 크게 보기", link: { web_url: imgUrl, mobile_web_url: imgUrl } },
          { title: "인트라넷 열기", link: { web_url: link, mobile_web_url: link } }
        ]
      })
    : JSON.stringify({
        object_type: "text",
        // 접미사 포함 총 200자 제한 준수 — 넘기면 카카오가 거부해 폴백까지 실패(무한 재시도)한다
        text: (sum.text.slice(0, 160) + "\n(보고서 이미지 생성 실패 — 요약만 발송)").slice(0, 200),
        link: { web_url: link, mobile_web_url: link },
        button_title: "보고서 열기"
      });
  const results = [];
  let tokChanged = false;
  for (const id of ids) {
    const u = users[id] || {};
    const nick = u.nick || ("사용자" + String(id).slice(-4));
    const t = await _kkAccessToken(cfg, u);
    if (!t.at) {
      if (t.relink) { u.needsRelink = true; tokChanged = true; }
      results.push({ nick, ok: false, err: t.err });
      continue;
    }
    if (t.upd) { Object.assign(u, t.upd); u.needsRelink = false; tokChanged = true; }
    const s = await _kkForm("https://kapi.kakao.com/v2/api/talk/memo/default/send", { template_object: tpl }, t.at);
    if (s.ok) results.push({ nick, ok: true, img: !!imgUrl });
    else results.push({ nick, ok: false, err: (s.data.msg || ("전송 실패 " + s.status)) });
  }
  if (tokChanged) await KK_TOK().set({ users }, { merge: true }).catch(() => {});

  // 발송 로그 (최근 31건 — 한 달치 보고서 이미지 링크 열람용. 이미지 파일 자체도 30일 보관)
  const logs = Array.isArray(cfg.logs) ? cfg.logs.slice() : [];
  logs.unshift({ t: _kkToday() + " " + _kkHm(), kind, img: imgUrl || null, results });
  while (logs.length > 31) logs.pop();
  await KK_CFG().set({ logs }, { merge: true }).catch(() => {});
  const sent = results.filter((r) => r.ok).length;
  return { ok: sent > 0, sent, results }; // 실적 요약 원문(text)은 응답에 넣지 않음 — 불필요한 노출 방지
}

// /api 의 카카오 액션 분기 처리
async function _kkHandle(body, res) {
  const action = String(body.kakao || "");
  try {
    // 인증 검사: 'link'(카카오 인가코드 자체가 자격 증명이고, 착지 페이지엔 Firebase SDK가 없음) 외
    // 모든 액션은 Firebase ID 토큰(익명 인증 포함)을 검증한다 — 외부에서 curl 로
    // 키 바꿔치기(savekey)·연동 해제(unlink)·스팸 발송(sendnow)을 못 하도록 최소한의 장벽.
    if (action !== "link") {
      try {
        const tk = String(body.idToken || "");
        if (!tk) throw new Error("no token");
        await admin.auth().verifyIdToken(tk);
      } catch (e) {
        res.status(401).json({ error: { message: "인증이 필요합니다. 인트라넷 화면에서 다시 시도하세요." } });
        return;
      }
    }
    if (action === "savekey") {
      const restKey = String(body.restKey || "").trim();
      if (!restKey) { res.status(400).json({ error: { message: "REST API 키를 입력하세요." } }); return; }
      const set = { restKey };
      // 시크릿은 값이 왔을 때만 갱신 — 키만 재저장할 때 기존 시크릿이 조용히 지워지는 것 방지.
      // 삭제하려면 clearSecret:true 를 명시적으로 보낸다.
      const sec = String(body.clientSecret || "").trim();
      if (sec) set.clientSecret = sec;
      else if (body.clearSecret === true) set.clientSecret = "";
      await KK_CFG().set(set, { merge: true });
      res.json({ ok: true });
      return;
    }
    if (action === "savecfg") {
      const sendTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.sendTime || "")) ? body.sendTime : "18:00";
      await KK_CFG().set({ enabled: !!body.enabled, sendTime, skipWeekend: !!body.skipWeekend }, { merge: true });
      res.json({ ok: true });
      return;
    }
    if (action === "authurl") {
      const cfgSnap = await KK_CFG().get();
      const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
      if (!cfg.restKey) { res.status(400).json({ error: { message: "먼저 REST API 키를 저장하세요." } }); return; }
      // member: 인트라넷 로그인 팀원 이름 — state로 전달해 연동 완료 시 계정에 기록(배정 알림 대상 매칭용)
      const stMember = String(body.member || "").trim().slice(0, 30);
      const url = "https://kauth.kakao.com/oauth/authorize?response_type=code"
        + "&client_id=" + encodeURIComponent(cfg.restKey)
        + "&redirect_uri=" + encodeURIComponent(KK_REDIRECT)
        + "&scope=" + encodeURIComponent("talk_message,profile_nickname")
        + (stMember ? "&state=" + encodeURIComponent(stMember) : "");
      res.json({ ok: true, url });
      return;
    }
    if (action === "link") {
      const code = String(body.code || "");
      if (!code) { res.status(400).json({ error: { message: "인가 코드가 없습니다." } }); return; }
      const cfgSnap = await KK_CFG().get();
      const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
      if (!cfg.restKey) { res.status(400).json({ error: { message: "REST API 키가 등록되지 않았습니다." } }); return; }
      const t = await _kkForm("https://kauth.kakao.com/oauth/token", {
        grant_type: "authorization_code", client_id: cfg.restKey, client_secret: cfg.clientSecret,
        redirect_uri: KK_REDIRECT, code
      });
      if (!t.ok || !t.data.access_token) {
        res.status(400).json({ error: { message: "카카오 토큰 발급 실패: " + (t.data.error_description || t.data.error || t.status) } });
        return;
      }
      // 사용자 식별 (닉네임은 profile_nickname 동의 시에만 옴)
      const meR = await fetch("https://kapi.kakao.com/v2/user/me", { headers: { Authorization: "Bearer " + t.data.access_token } });
      const me = await meR.json().catch(() => ({}));
      const kid = String((me && me.id) || "");
      if (!kid) { res.status(400).json({ error: { message: "카카오 사용자 정보 조회 실패" } }); return; }
      const nick = (me.kakao_account && me.kakao_account.profile && me.kakao_account.profile.nickname)
        || (me.properties && me.properties.nickname) || ("사용자" + kid.slice(-4));
      const tokSnap = await KK_TOK().get();
      const users = (tokSnap.exists && (tokSnap.data() || {}).users) || {};
      // 신규 연동은 승인 대기 상태로 — 관리자가 설정 화면에서 [승인]해야 발송 대상이 된다
      // (외부인이 임의로 자기 계정을 수신자로 등록하는 것을 막는 장치. 재연동은 기존 승인 유지)
      const wasApproved = !!(users[kid] && users[kid].approved);
      // 연동 시 인트라넷 팀원 이름(state) 기록 — DB 배정 알림에서 '팀원 이름 → 카카오 계정' 매칭에 사용.
      // 재연동 시 state가 없으면 기존 매핑 유지.
      const memberNm = String(body.state || "").trim().slice(0, 30) || (users[kid] && users[kid].member) || "";
      users[kid] = {
        nick, rt: t.data.refresh_token || (users[kid] && users[kid].rt) || "",
        at: t.data.access_token, atExp: Date.now() + (t.data.expires_in || 21600) * 1000,
        linkedAt: _kkToday(), needsRelink: false, approved: wasApproved, member: memberNm
      };
      await KK_TOK().set({ users }, { merge: true });
      res.json({ ok: true, nick, approved: wasApproved });
      return;
    }
    if (action === "approve") {
      const kid = String(body.id || "");
      const tokSnap = await KK_TOK().get();
      const users = (tokSnap.exists && (tokSnap.data() || {}).users) || {};
      if (!users[kid]) { res.status(404).json({ error: { message: "해당 연동 계정이 없습니다." } }); return; }
      users[kid].approved = true;
      await KK_TOK().set({ users }, { merge: true });
      res.json({ ok: true });
      return;
    }
    if (action === "unlink") {
      const kid = String(body.id || "");
      const tokSnap = await KK_TOK().get();
      const users = (tokSnap.exists && (tokSnap.data() || {}).users) || {};
      if (users[kid]) { delete users[kid]; await KK_TOK().set({ users }); }
      res.json({ ok: true });
      return;
    }
    if (action === "status") {
      const [cfgSnap, tokSnap] = await Promise.all([KK_CFG().get(), KK_TOK().get()]);
      const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
      const users = (tokSnap.exists && (tokSnap.data() || {}).users) || {};
      res.json({
        ok: true,
        keySet: !!cfg.restKey,
        keyHint: cfg.restKey ? (String(cfg.restKey).slice(0, 4) + "····" + String(cfg.restKey).slice(-4)) : "",
        enabled: !!cfg.enabled, sendTime: cfg.sendTime || "18:00", skipWeekend: !!cfg.skipWeekend,
        lastSentDate: cfg.lastSentDate || "",
        users: Object.keys(users).map((id) => ({ id, nick: users[id].nick || "", member: users[id].member || "", linkedAt: users[id].linkedAt || "", needsRelink: !!users[id].needsRelink, approved: !!users[id].approved })),
        logs: (cfg.logs || []).slice(0, 31)
      });
      return;
    }
    if (action === "dbassign") {
      // DB 배정 알림 — 배정된 팀원의 카톡(나와의 채팅)으로 배정 내용을 발송.
      //   대상 매칭: 연동 시 기록된 member(팀원 이름) 우선, 없으면 카카오 닉네임 동일 시 폴백.
      //   미연동/미승인 팀원이면 ok:false 로 응답(클라이언트는 콘솔 로그만 — 웹푸시가 별도로 감).
      const member = String(body.member || "").trim();
      if (!member) { res.status(400).json({ error: { message: "member가 없습니다." } }); return; }
      const [cfgSnapA, tokSnapA] = await Promise.all([KK_CFG().get(), KK_TOK().get()]);
      const cfgA = cfgSnapA.exists ? (cfgSnapA.data() || {}) : {};
      const usersA = (tokSnapA.exists && (tokSnapA.data() || {}).users) || {};
      if (!cfgA.restKey) { res.json({ ok: false, error: "REST API 키 미설정" }); return; }
      // 매칭은 연동 시 기록된 member(팀원 이름)로만 — 카카오 닉네임 폴백은 쓰지 않는다
      //   (닉네임은 본인이 아무 이름으로나 바꿀 수 있어 타인 사칭 → 고객 정보 오발송 경로가 됨).
      // 같은 이름 매핑이 2개 이상이면 오발송 위험이므로 발송을 보류하고 관리자 확인을 요구한다.
      const matched = Object.keys(usersA).filter((id) => usersA[id] && usersA[id].approved && String(usersA[id].member || "") === member);
      if (!matched.length) { res.json({ ok: false, error: "카톡 미연동/미승인: " + member }); return; }
      if (matched.length > 1) {
        res.json({ ok: false, error: "'" + member + "' 매핑 계정이 " + matched.length + "개입니다 — 카톡 설정에서 중복 연동을 정리한 뒤 다시 시도하세요." });
        return;
      }
      const kidA = matched[0];
      // 남용 방지: 같은 팀원 대상 10초 간격
      const lda = (cfgA.lastDbAssign && typeof cfgA.lastDbAssign === "object") ? cfgA.lastDbAssign : {};
      if (lda[kidA] && Date.now() - lda[kidA] < 10 * 1000) {
        res.status(429).json({ error: { message: "같은 팀원에게는 10초에 1회만 발송됩니다." } });
        return;
      }
      lda[kidA] = Date.now();
      Object.keys(lda).forEach((k) => { if (Date.now() - lda[k] > 3600 * 1000) delete lda[k]; });
      await KK_CFG().set({ lastDbAssign: lda }, { merge: true }).catch(() => {});

      const uA = usersA[kidA];
      const tA = await _kkAccessToken(cfgA, uA);
      if (!tA.at) {
        if (tA.relink) { uA.needsRelink = true; await KK_TOK().set({ users: usersA }, { merge: true }).catch(() => {}); }
        res.json({ ok: false, error: "토큰 갱신 실패 — 재연동 필요: " + (tA.err || "") });
        return;
      }
      if (tA.upd) { Object.assign(uA, tA.upd); uA.needsRelink = false; await KK_TOK().set({ users: usersA }, { merge: true }).catch(() => {}); }

      // 메시지 구성 — 고객마다 항목 라벨(성함/연락처/생년월일/성별/보험료/통화가능시간/주소) 형식.
      //   카카오 텍스트 템플릿 200자 제한: 고객 블록 단위로 나눠 여러 통 발송(최대 5통, 초과분 생략 안내).
      //   body.items 배열이 오면 "관리자 수동 발송(이번 달 배정 내역 묶음)" 모드.
      const custBlock = (n, i, many) => {
        n = n || {};
        const f = (v, len) => (String(v || "").trim().slice(0, len) || "-");
        const L = [];
        if (many) L.push("[" + (i + 1) + "번 DB]");
        L.push("성함 : " + f(n.name, 20));
        L.push("연락처 : " + f(n.phone, 20));
        L.push("생년월일 : " + f(n.birth, 20));
        L.push("성별 : " + f(n.gender, 4));
        L.push("보험료 : " + f(n.premium, 15));
        L.push("통화가능시간 : " + f(n.calltime, 20));
        L.push("주소 : " + f(n.address, 50));
        return L.join("\n");
      };
      const items = Array.isArray(body.items) ? body.items.slice(0, 10) : null;
      let blocks = [];
      if (items) {
        let totalQ = 0; items.forEach((it) => { totalQ += (+((it || {}).qty) || 0); });
        blocks.push("[DB 배정 내역]\n" + member + "님, 이번 달 배정 내역 " + totalQ + "건입니다.");
        items.forEach((it) => {
          it = it || {};
          blocks.push("▶ 종류 : " + String(it.kind || "-").slice(0, 20) + " (" + String(it.region || "-").slice(0, 10) + ") "
            + (+it.qty || 0) + "건 · " + String(it.src || "현월").slice(0, 10) + " · " + String(it.dt || "").slice(0, 10));
          const ns = Array.isArray(it.notes) ? it.notes.slice(0, 50) : [];
          ns.forEach((n, i) => blocks.push(custBlock(n, i, ns.length > 1)));
        });
      } else {
        const kind = String(body.kind || "-").slice(0, 20);
        const region = String(body.region || "-").slice(0, 10);
        const qty = +body.qty || 0;
        const srcType = String(body.src || "현월").slice(0, 10);
        const dtStr = String(body.dt || "").slice(0, 10);
        const notes = Array.isArray(body.notes) ? body.notes.slice(0, 50) : [];
        blocks.push("[DB 배정]\n" + member + "님, DB " + qty + "건이 배정되었습니다.\n종류 : " + kind + " (" + region + ")\n배정종류 : " + srcType + " · 배정일 : " + dtStr);
        notes.forEach((n, i) => blocks.push(custBlock(n, i, notes.length > 1)));
      }
      // 블록 단위로 200자에 맞춰 묶기
      const msgs = [];
      let curMsg = "";
      for (const bk of blocks) {
        if (!curMsg) curMsg = bk;
        else if ((curMsg + "\n\n" + bk).length > 195) { msgs.push(curMsg); curMsg = bk; }
        else curMsg += "\n\n" + bk;
      }
      if (curMsg) msgs.push(curMsg);
      let cut = false;
      while (msgs.length > 5) { msgs.pop(); cut = true; }
      if (cut) msgs[msgs.length - 1] = msgs[msgs.length - 1].slice(0, 150) + "\n…이하 생략 — 인트라넷에서 확인";
      const linkA = KK_SITE + "/";
      let sentN = 0, lastErr = "";
      for (const msg of msgs) {
        const tplObj = JSON.stringify({
          object_type: "text",
          text: msg.slice(0, 200),
          link: { web_url: linkA, mobile_web_url: linkA },
          button_title: "인트라넷 열기"
        });
        const sr = await _kkForm("https://kapi.kakao.com/v2/api/talk/memo/default/send", { template_object: tplObj }, tA.at);
        if (sr.ok) sentN++;
        else { lastErr = (sr.data && (sr.data.msg || sr.data.error_description)) || ("전송 실패 " + sr.status); break; }
      }
      res.json({ ok: sentN > 0, sent: sentN, total: msgs.length, nick: uA.nick || "", error: lastErr || undefined });
      return;
    }
    if (action === "setmember") {
      // 연동 계정에 팀원 이름 지정 — 예전 방식(이름 미기록) 연동 계정을 재연동 없이 매핑
      const kidM = String(body.id || "");
      const memberM = String(body.member || "").trim().slice(0, 30);
      const tokSM = await KK_TOK().get();
      const usersM = (tokSM.exists && (tokSM.data() || {}).users) || {};
      if (!usersM[kidM]) { res.status(404).json({ error: { message: "해당 연동 계정이 없습니다." } }); return; }
      usersM[kidM].member = memberM;
      await KK_TOK().set({ users: usersM }, { merge: true });
      res.json({ ok: true, member: memberM });
      return;
    }
    if (action === "kktest") {
      // 연동 관리 화면 [테스트] — 해당 계정의 카톡으로 간단한 확인 메시지 발송 (보고서 캡처 없음)
      const kidT = String(body.id || "");
      const [cfgS, tokS] = await Promise.all([KK_CFG().get(), KK_TOK().get()]);
      const cfgT = cfgS.exists ? (cfgS.data() || {}) : {};
      const usersT = (tokS.exists && (tokS.data() || {}).users) || {};
      const uT = usersT[kidT];
      if (!uT) { res.status(404).json({ error: { message: "해당 연동 계정이 없습니다." } }); return; }
      if (!uT.approved) { res.status(400).json({ error: { message: "승인 후 테스트할 수 있습니다." } }); return; }
      const ldt = (cfgT.lastKkTest && typeof cfgT.lastKkTest === "object") ? cfgT.lastKkTest : {};
      if (ldt[kidT] && Date.now() - ldt[kidT] < 10 * 1000) {
        res.status(429).json({ error: { message: "같은 계정에는 10초에 1회만 테스트 발송할 수 있습니다." } });
        return;
      }
      ldt[kidT] = Date.now();
      Object.keys(ldt).forEach((k) => { if (Date.now() - ldt[k] > 3600 * 1000) delete ldt[k]; });
      await KK_CFG().set({ lastKkTest: ldt }, { merge: true }).catch(() => {});
      const tT = await _kkAccessToken(cfgT, uT);
      if (!tT.at) {
        if (tT.relink) { uT.needsRelink = true; await KK_TOK().set({ users: usersT }, { merge: true }).catch(() => {}); }
        res.json({ ok: false, error: "토큰 갱신 실패 — 재연동이 필요합니다." });
        return;
      }
      if (tT.upd) { Object.assign(uT, tT.upd); uT.needsRelink = false; await KK_TOK().set({ users: usersT }, { merge: true }).catch(() => {}); }
      const txtT = "[테스트]\n" + (uT.member ? uT.member + "님, " : "") + "TEAM TOPS 인트라넷 카톡 알림이 정상 연결되었습니다.\nDB 배정 시 이 채팅으로 알림이 발송됩니다.";
      const tplT = JSON.stringify({ object_type: "text", text: txtT.slice(0, 200), link: { web_url: KK_SITE + "/", mobile_web_url: KK_SITE + "/" }, button_title: "인트라넷 열기" });
      const sT = await _kkForm("https://kapi.kakao.com/v2/api/talk/memo/default/send", { template_object: tplT }, tT.at);
      if (sT.ok) res.json({ ok: true, nick: uT.nick || "" });
      else res.json({ ok: false, error: (sT.data && (sT.data.msg || sT.data.error_description)) || ("전송 실패 " + sT.status) });
      return;
    }
    if (action === "sendnow") {
      // 수동 발송 남용 방지: 대상(전체/개인)별 최소 1분 간격
      const onlyId = String(body.id || "");
      const rlKey = onlyId ? ("u" + onlyId) : "all";
      const cfgSnap = await KK_CFG().get();
      const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
      const lm = (cfg.lastManual && typeof cfg.lastManual === "object") ? cfg.lastManual : {};
      if (lm[rlKey] && Date.now() - lm[rlKey] < 60 * 1000) {
        res.status(429).json({ error: { message: "같은 대상에게는 1분에 1회만 테스트 발송할 수 있습니다." } });
        return;
      }
      // 대상별 제한과 별개로 전역 15초 간격 — 여러 대상 연타로 캡처(크로미움)를 무제한 돌리는 것 방지
      if (lm._g && Date.now() - lm._g < 15 * 1000) {
        res.status(429).json({ error: { message: "테스트 발송이 너무 잦습니다. 15초 후 다시 시도하세요." } });
        return;
      }
      lm[rlKey] = Date.now();
      lm._g = Date.now();
      await KK_CFG().set({ lastManual: lm }, { merge: true });
      const r = await _kkSendAll("test", onlyId);
      res.json(r);
      return;
    }
    res.status(400).json({ error: { message: "알 수 없는 kakao 액션: " + action } });
  } catch (e) {
    console.error("kakao action error:", action, e);
    res.status(500).json({ error: { message: String((e && e.message) || e) } });
  }
}

// ── 병력정리 PDF 드라이브 저장 (body.medpdf) ─────────────────
// 클라이언트가 만든 병력정리 HTML을 헤드리스 크로미움으로 진짜 PDF로 변환해
// Apps Script(claimFile)를 통해 {담당자}/병력정리/{고객}/ 폴더에 업로드한다.
// (구글시트 저장을 대체 — gs 서버 코드 변경 불필요)
async function _medPdfHandle(body, res) {
  try {
    // 인증 — kakao 액션과 동일한 최소 장벽 (Firebase ID 토큰)
    try {
      const tk = String(body.idToken || "");
      if (!tk) throw new Error("no token");
      await admin.auth().verifyIdToken(tk);
    } catch (e) { res.status(401).json({ error: { message: "인증이 필요합니다. 인트라넷에서 다시 시도하세요." } }); return; }
    const html = String(body.html || "");
    if (!html) { res.status(400).json({ error: { message: "html이 비어 있습니다." } }); return; }
    if (html.length > 2 * 1024 * 1024) { res.status(400).json({ error: { message: "html이 너무 큽니다." } }); return; }
    let driveHost = "";
    try { const u = new URL(String(body.driveUrl || "")); if (u.protocol === "https:") driveHost = u.hostname; } catch (e) {}
    if (driveHost !== "script.google.com") { res.status(400).json({ error: { message: "잘못된 드라이브 서버 주소" } }); return; }

    // 호출 빈도 제한 — 크로미움 기동(2GiB·최대 60초)이 비싼 작업이라 남용(비용 DoS) 방지.
    // 실사용(분석 저장)은 드문 이벤트라 전역 20초 간격이면 충분. 겹치면 클라이언트가 재시도.
    const rlSnap = await KK_CFG().get();
    const rlCfg = rlSnap.exists ? (rlSnap.data() || {}) : {};
    if (rlCfg.medLastTs && Date.now() - rlCfg.medLastTs < 20 * 1000) {
      res.status(429).json({ error: { message: "PDF 변환은 20초 간격으로만 가능합니다. 잠시 후 자동 재시도됩니다." } });
      return;
    }
    await KK_CFG().set({ medLastTs: Date.now() }, { merge: true });

    // HTML → PDF. 방어 2중: ① 페이지 JS 비활성(스크립트 실행 차단)
    // ② 요청 가로채기 — 웹폰트(구글 폰트)와 data: 외의 모든 외부 리소스 차단
    //    (img/iframe/css url() 등을 통한 내부망·메타데이터 서버 접근(SSRF) 방지)
    const chromium = require("@sparticuz/chromium");
    const puppeteer = require("puppeteer-core");
    const browser = await puppeteer.launch({
      args: [...chromium.args, "--lang=ko-KR"],
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      defaultViewport: { width: 900, height: 1200 }
    });
    let pdfB64;
    try {
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        try {
          const url = req.url();
          if (url.startsWith("data:") || url === "about:blank" || req.resourceType() === "document") { req.continue(); return; }
          const host = new URL(url).hostname;
          if (host === "fonts.googleapis.com" || host === "fonts.gstatic.com") { req.continue(); return; }
          req.abort();
        } catch (e) { try { req.abort(); } catch (e2) {} }
      });
      await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 }); // 웹폰트 로딩 대기 포함
      await new Promise((r) => setTimeout(r, 800));
      const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "8mm", right: "8mm" } });
      pdfB64 = Buffer.from(pdf).toString("base64");
    } finally { await browser.close().catch(() => {}); }

    // Apps Script 웹앱으로 업로드 (기존 claimFile 액션 재사용)
    const r = await fetch(String(body.driveUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "claimFile",
        member: String(body.member || "미지정"),
        folders: ["병력정리", String(body.cust || "(미입력)")],
        filename: String(body.filename || "병력분석.pdf"),
        b64: pdfB64, mime: "application/pdf"
      }),
      redirect: "follow"
    });
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch (e) { j = { raw: txt.slice(0, 300) }; }
    if (j && j.ok) res.json({ ok: true, url: j.url || "" });
    else res.status(500).json({ error: { message: "드라이브 저장 실패: " + ((j && j.error) || (j && j.raw) || r.status) } });
  } catch (e) {
    console.error("medpdf error:", e);
    res.status(500).json({ error: { message: String((e && e.message) || e) } });
  }
}

// 매 5분: 발송 시각 도달 여부 검사 → 하루 1회 자동 발송 (KST)
exports.kakaoDaily = onSchedule(
  { schedule: "*/5 * * * *", timeZone: "Asia/Seoul", region: "us-central1", memory: "2GiB", timeoutSeconds: 300 },
  async () => {
    const cfgSnap = await KK_CFG().get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
    const today = _kkToday();
    // ── 매일 밤 하루 마감 스냅샷 기록 (발송 여부·주말 제외 설정과 무관) ──
    // 주말·공휴일에도 그날 상태를 기록해 두어야 "오늘 반영 실적"이 항상
    // "어제 마감 대비 오늘 등록분"으로 정확히 잡힌다 (여러 날 합산 문제 방지)
    if (_kkHm() >= "23:30" && cfg.lastSnapDate !== today) {
      try {
        const rec = await _kkRecordSnapshot();
        // 실제 저장이 성공했을 때만 완료 처리 — 실패면 다음 5분 턴에 재시도 (자정 전 6회 기회)
        if (rec.wrote) await KK_CFG().set({ lastSnapDate: today }, { merge: true });
      } catch (e) { console.warn("마감 스냅샷 기록 실패(다음 턴 재시도):", String((e && e.message) || e)); }
    }
    // ── 이하 자동 발송 ──
    if (!cfg.enabled || !cfg.restKey) return;
    if (cfg.lastSentDate === today) return;                 // 오늘 이미 발송함
    if (_kkHm() < (cfg.sendTime || "18:00")) return;        // 아직 발송 시각 전
    if (cfg.skipWeekend) {
      const day = _kkNow().getUTCDay();
      if (day === 0 || day === 6) return;
    }
    // 중복 발송 방지를 위해 먼저 오늘 날짜를 기록하고, 실패(예외 포함) 시 되돌려 다음 턴에 재시도
    await KK_CFG().set({ lastSentDate: today }, { merge: true });
    let r;
    try { r = await _kkSendAll("auto"); }
    catch (e) { r = { ok: false, error: String((e && e.message) || e) }; }
    if (!r.ok) {
      console.warn("kakaoDaily 전원 발송 실패 — 다음 턴에 재시도:", JSON.stringify(r.results || r.error));
      await KK_CFG().set({ lastSentDate: "" }, { merge: true });
    } else {
      console.log("kakaoDaily 발송 완료:", r.sent + "명");
    }
  }
);

// Firebase 시크릿에 저장한 API 키
//   설정: firebase functions:secrets:set ANTHROPIC_API_KEY (Claude 키 — 현재 사용 중)
// 참고: Gemini 키는 아직 미등록이라 defineSecret 선언을 빼둔다(선언만 있어도 배포가 입력을 요구함).
//   Gemini 를 쓸 때 GEMINI_API_KEY 를 환경변수/시크릿으로 등록하면 process.env 로 자동 인식됨.
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

exports.api = onRequest(
  // memory 2GiB: 카카오 발송(sendnow)이 보고서 캡처용 헤드리스 크로미움을 띄우므로 필요
  { secrets: [ANTHROPIC_API_KEY], region: "us-central1", memory: "2GiB", timeoutSeconds: 300 },
  async (req, res) => {
    // 호스팅 rewrite로 같은 도메인에서 호출되므로 CORS는 기본적으로 불필요하지만 방어적으로 허용
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: { message: "POST only" } }); return; }

    var body = req.body || {};
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }

    // 카카오톡 일일보고서 자동 발송 관련 액션 (body.kakao = 'savekey'|'savecfg'|'authurl'|'link'|'unlink'|'approve'|'status'|'sendnow')
    if (body.kakao) { await _kkHandle(body, res); return; }

    // 병력정리 PDF 드라이브 저장 (HTML → PDF 변환 후 업로드)
    if (body.medpdf) { await _medPdfHandle(body, res); return; }

    // 드라이브(앱스크립트) 프록시 — 브라우저는 CORS로 앱스크립트 응답을 못 읽으므로
    // 같은 도메인의 이 함수가 대신 호출해 JSON을 그대로 돌려준다.
    if (body.driveProxy) {
      const target = String(body.url || "");
      let host = "";
      try { const u = new URL(target); if (u.protocol === "https:") host = u.hostname; } catch (e) {}
      if (host !== "script.google.com") {
        res.status(400).json({ error: { message: "invalid drive url" } });
        return;
      }
      try {
        const r = await fetch(target, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body.payload || {}),
          redirect: "follow"
        });
        const txt = await r.text();
        let j; try { j = JSON.parse(txt); } catch (e) { j = { raw: txt.slice(0, 500) }; }
        res.status(200).json(j);
      } catch (e) {
        res.status(500).json({ error: { message: String((e && e.message) || e) } });
      }
      return;
    }

    // ── 웹 푸시 알림 전송 (body.push) ──────────────────────────
    //   to: "ALL" | "ADMIN" | [이름,...]  →  push_tokens 컬렉션에서 토큰 조회 후 FCM 발송.
    if (body.push) {
      try {
        const to = body.to;
        const title = String(body.title || "TEAM TOPS");
        const text = String(body.body || "");
        const link = String(body.link || "/");
        const col = admin.firestore().collection("push_tokens");
        let docs = [];
        if (to === "ALL") {
          docs = (await col.get()).docs;
        } else if (to === "ADMIN") {
          docs = (await col.where("admin", "==", true).get()).docs;
        } else if (Array.isArray(to)) {
          const names = to.filter(Boolean);
          const seen = {};
          for (let i = 0; i < names.length; i += 10) {
            const chunk = names.slice(i, i + 10);
            const s = await col.where("name", "in", chunk).get();
            s.docs.forEach((d) => { if (!seen[d.id]) { seen[d.id] = 1; docs.push(d); } });
          }
        }
        const tokens = docs.map((d) => d.id);
        if (!tokens.length) { res.status(200).json({ ok: true, sent: 0 }); return; }
        // notification 페이로드 포함(FCM 표준 형태) — data 전용 + fcmOptions.link 조합은
        // 규격 위반으로 전송이 거부될 수 있고, iOS 웹푸시도 notification이 있어야 안정적으로 표시됨.
        const resp = await admin.messaging().sendEachForMulticast({
          tokens: tokens,
          notification: { title: title, body: text },
          data: { title: title, body: text, link: link },
          webpush: {
            headers: { Urgency: "high" },
            notification: { title: title, body: text, icon: "https://team-tops-intranet.web.app/icon-192.png" },
            fcmOptions: { link: link }
          }
        });
        // 전송 실패 원인을 Functions 로그에 남김 (알림 미수신 진단용)
        resp.responses.forEach((r, i) => {
          if (!r.success) console.warn("push fail:", (r.error && r.error.code) || "", (r.error && r.error.message) || "");
        });
        // 만료/무효 토큰 정리
        const dels = [];
        resp.responses.forEach((r, i) => {
          if (!r.success) {
            const code = (r.error && r.error.code) || "";
            if (/not-registered|invalid-argument|invalid-registration/.test(code)) {
              dels.push(col.doc(tokens[i]).delete().catch(() => {}));
            }
          }
        });
        await Promise.all(dels);
        res.status(200).json({ ok: true, sent: resp.successCount, failed: resp.failureCount });
      } catch (e) {
        console.error("push error:", e);
        res.status(500).json({ error: { message: String((e && e.message) || e) } });
      }
      return;
    }

    const model = body.model || "gemini-2.0-flash";
    const maxTokens = body.max_tokens || 4000;
    const prompt = body.prompt || "";
    if (!prompt) { res.status(400).json({ error: { message: "prompt is required" } }); return; }

    // ── 구글 Gemini 분기 (model 이 "gemini-*") ──────────────────
    //   응답을 Anthropic과 같은 형태 { content:[{text}] } 로 정규화 → 프론트는 그대로 사용.
    if (/^gemini/i.test(model)) {
      try {
        const gKey = process.env.GEMINI_API_KEY || "";
        if (!gKey) { res.status(400).json({ error: { message: "Gemini API 키가 설정되지 않았습니다. (현재 Claude 사용 중)" } }); return; }
        const gUrl = "https://generativelanguage.googleapis.com/v1beta/models/"
          + encodeURIComponent(model) + ":generateContent?key=" + gKey;
        // 2.5 Flash 계열은 기본으로 '생각(thinking)'을 켜서 출력 토큰을 잡아먹으므로 끈다
        //   (2.5 Pro는 thinkingBudget 0을 허용하지 않아 flash 계열에만 적용)
        const genCfg = { maxOutputTokens: maxTokens, temperature: 0 };
        if (/2\.5-flash/i.test(model)) genCfg.thinkingConfig = { thinkingBudget: 0 };
        const r = await fetch(gUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: genCfg
          })
        });
        const data = await r.json();
        if (!r.ok) {
          const msg = (data && data.error && data.error.message) || ("Gemini 오류 " + r.status);
          res.status(r.status).json({ error: { message: msg } });
          return;
        }
        let text = "";
        try {
          const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
          text = parts.map(function (p) { return (p && p.text) || ""; }).join("");
        } catch (e) { text = ""; }
        res.status(200).json({ content: [{ type: "text", text: text }] });
      } catch (e) {
        console.error("gemini proxy error:", e);
        res.status(500).json({ error: { message: String((e && e.message) || e) } });
      }
      return;
    }

    // ── Anthropic Claude 분기 (model 이 "claude-*") ─────────────
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY.value(),
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: model,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await r.json();
      // Anthropic 응답({ content: [{ text }] })을 그대로 전달 — 프론트가 data.content를 사용
      res.status(r.status).json(data);
    } catch (e) {
      console.error("anthropic proxy error:", e);
      res.status(500).json({ error: { message: String((e && e.message) || e) } });
    }
  }
);
