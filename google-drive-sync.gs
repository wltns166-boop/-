/**
 * TEAM TOPS — 처리결과 구글드라이브 자동 저장 (Google Apps Script 웹앱)
 *
 * 고객등록 · DB배정현황 · 병력정리 · 보장분석 데이터를
 * "중앙 공용 구글시트 1개"에 시트(탭)별로 저장한다.
 * index.html 의 _driveSync() 가 데이터 변경 시마다 이 웹앱으로 POST 하고,
 * 이 스크립트는 해당 탭을 "전체 최신 내용으로 덮어쓰기"(최신화) 한다.
 *
 * ── 설정 방법 ─────────────────────────────────────────────
 * 1) script.google.com 접속 → [새 프로젝트]
 * 2) 기본 코드 전체 지우고, 이 파일 내용 전체 붙여넣기 → 저장(💾)
 * 3) (선택) 아래 ROOT_FOLDER_NAME / SPREADSHEET_NAME 을 원하는 이름으로 수정
 * 4) 오른쪽 위 [배포] → [새 배포] → 톱니바퀴(유형) → [웹 앱] 선택
 *      설명        : drive sync
 *      실행 계정   : 나
 *      액세스 권한 : 모든 사용자          ← 꼭 "모든 사용자"
 *    → [배포] → 권한 승인(본인 구글계정 허용)
 * 5) 나오는 [웹 앱 URL] (https://script.google.com/macros/s/..../exec) 복사
 *    → 이 URL 을 Claude 에게 전달하면 인트라넷에 연결해 드립니다.
 *
 * ※ 처음 한 번 POST 가 오면 본인 구글드라이브에
 *    "TEAM TOPS 자료" 폴더와 "TEAM TOPS 데이터" 시트가 자동 생성됩니다.
 *    이 시트가 곧 팀 공용 저장본입니다. (사장님 드라이브 한 곳에 모임)
 * ──────────────────────────────────────────────────────────
 */

var ROOT_FOLDER_NAME = 'TEAM TOPS 자료';     // 드라이브 폴더 이름
var SPREADSHEET_NAME = 'TEAM TOPS 데이터';    // 구글시트 파일 이름
var MAX_CELL = 45000;                        // 셀 최대 글자수(초과분 자름)
var SERVER_VERSION = 'gsheet-11';            // 범용 서버 버전(클라이언트가 doGet으로 확인)

function doPost(e) {
  var out = ContentService.createTextOutput();
  out.setMimeType(ContentService.MimeType.JSON);
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // 폴더를 만드는 작업은 동시 실행 시 중복 폴더가 생기므로 잠금으로 직렬화
    if (body.action === 'claimFile' || body.action === 'custFile' || body.action === 'custTable'
        || body.action === 'waRegister' || body.action === 'waGrid'
        || body.action === 'waCreate' || body.action === 'waExport' || body.action === 'waOpen') {
      var lock = LockService.getScriptLock();
      try { lock.waitLock(50000); } catch (e) {}
      try {
        if (body.action === 'claimFile') return _saveClaimFile(body, out);
        if (body.action === 'custTable') return _saveCustTable(body, out);
        if (body.action === 'waRegister') return _waRegisterTemplate(body, out);
        if (body.action === 'waGrid')     return _waTemplateGrid(body, out);
        if (body.action === 'waCreate')   return _waCreateSheet(body, out);
        if (body.action === 'waExport')   return _waExportXlsx(body, out);
        if (body.action === 'waOpen')     return _waOpenSheet(body, out);
        return _saveCustFile(body, out);
      } finally {
        try { lock.releaseLock(); } catch (e) {}
      }
    }

    var sheetName = String(body.sheet || '').trim();
    if (!sheetName) { out.setContent(JSON.stringify({ error: 'sheet name required' })); return out; }

    var headers = body.headers || [];
    var rows = body.rows || [];

    var ss = _getSpreadsheet();
    var sh = ss.getSheetByName(sheetName);
    if (!sh) sh = ss.insertSheet(sheetName);
    sh.clear();

    // 헤더 + 행 데이터를 2차원 배열로 구성
    var data = [];
    if (headers.length) data.push(headers.map(_cell));
    for (var i = 0; i < rows.length; i++) {
      data.push((rows[i] || []).map(_cell));
    }

    if (data.length) {
      // 모든 행을 가장 넓은 열 수에 맞춤
      var w = 0;
      for (var j = 0; j < data.length; j++) w = Math.max(w, data[j].length);
      for (var j2 = 0; j2 < data.length; j2++) {
        while (data[j2].length < w) data[j2].push('');
      }
      sh.getRange(1, 1, data.length, w).setValues(data);
      if (headers.length) {
        sh.getRange(1, 1, 1, w).setFontWeight('bold').setBackground('#e8eaf6');
        sh.setFrozenRows(1);
      }
    }
    // 마지막 갱신 시각 기록(시트 우상단 메모용 — 별도 셀 아님, 로그)
    out.setContent(JSON.stringify({ ok: true, sheet: sheetName, rows: rows.length, url: ss.getUrl() }));
    return out;
  } catch (err) {
    out.setContent(JSON.stringify({ error: String((err && err.message) || err) }));
    return out;
  }
}

function doGet(e) {
  // ?ping=1 → 배포된 서버 버전을 JSON으로 응답(클라이언트가 재배포 필요 여부 확인)
  if (e && e.parameter && e.parameter.ping) {
    var out = ContentService.createTextOutput(JSON.stringify({ ok: true, version: SERVER_VERSION }));
    out.setMimeType(ContentService.MimeType.JSON);
    return out;
  }
  var ss = _getSpreadsheet();
  return ContentService.createTextOutput('TEAM TOPS Drive sync OK (' + SERVER_VERSION + ')\n' + ss.getUrl());
}

// ===== 보장분석표 — 구글 스프레드시트 방식 =====

// 구글시트 URL/ID에서 시트 ID만 추출
function _extractSheetId(s) {
  s = String(s || '').trim();
  var m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;   // ID를 그대로 넣은 경우
  return '';
}

// 관리자: 공용 드라이브에 만들어 둔 "구글시트 양식"의 주소(URL/ID)를 등록
//   (이후 고객별로 이 양식을 복사해서 작성한다 — 변환 단계 없음)
function _waRegisterTemplate(body, out) {
  var id = _extractSheetId(body.url || body.id || '');
  if (!id) { out.setContent(JSON.stringify({ error: 'invalid_url' })); return out; }
  try { SpreadsheetApp.openById(id).getName(); }    // 열리는지(접근권한) 확인
  catch (e) { out.setContent(JSON.stringify({ error: 'cannot_open' })); return out; }
  PropertiesService.getScriptProperties().setProperty('WA_TPL_ID', id);
  out.setContent(JSON.stringify({ ok: true, templateId: id }));
  return out;
}

// 등록된 양식의 각 시트(탭)를 2차원 표(표시값)로 반환 — 클라이언트가 AI 프롬프트·좌표에 사용
function _waTemplateGrid(body, out) {
  var tplId = PropertiesService.getScriptProperties().getProperty('WA_TPL_ID');
  if (!tplId) { out.setContent(JSON.stringify({ error: 'no_template' })); return out; }
  var ss;
  try { ss = SpreadsheetApp.openById(tplId); }
  catch (e) { out.setContent(JSON.stringify({ error: 'cannot_open' })); return out; }
  var sheets = ss.getSheets();
  var grids = [];
  for (var i = 0; i < sheets.length && i < 5; i++) {
    var sh = sheets[i];
    var lastR = sh.getLastRow(), lastC = sh.getLastColumn();
    // ★ 상품 칸(G~T)·보장행(~93)이 양식에서 비어 있어도 AI가 그 칸의 존재를 알도록
    //   항상 최소 93행 × 20열(T)까지 읽는다(시트 실제 크기 내로 제한).
    var rr = Math.min(Math.max(lastR, 93), sh.getMaxRows());
    var cc = Math.min(Math.max(lastC, 20), sh.getMaxColumns());
    var vals = (rr > 0 && cc > 0) ? sh.getRange(1, 1, rr, cc).getDisplayValues() : [];
    grids.push({ name: sh.getName(), grid: vals });
  }
  out.setContent(JSON.stringify({ ok: true, sheets: grids }));
  return out;
}

// 고객별 보장분석표 생성/갱신: 양식 복사 → 전달받은 셀(edits)만 기입 → 임베드 주소 반환
//   edits: [{ s:시트index(0=전,1=후), r:0기준행, c:0기준열, v:값 }]
function _waCreateSheet(body, out) {
  var member = String(body.member || '미지정').trim() || '미지정';
  var cust   = String(body.cust   || '고객').trim() || '고객';
  var edits  = body.edits || [];
  var tplId  = PropertiesService.getScriptProperties().getProperty('WA_TPL_ID');
  if (!tplId) { out.setContent(JSON.stringify({ error: 'no_template' })); return out; }

  var custFolder = _resolveFolderPath(_getFolder(), member, ['보장분석표', cust]);
  var fileName = cust + '님 보장분석표';
  var ssId = null;
  var ex = custFolder.getFilesByName(fileName);
  if (ex.hasNext()) { ssId = ex.next().getId(); }
  else { ssId = DriveApp.getFileById(tplId).makeCopy(fileName, custFolder).getId(); }

  var ss = SpreadsheetApp.openById(ssId);
  var sheets = ss.getSheets();

  // ── 기입·중복제거·색칠 (모두 서버에서 결정론적으로 처리) ──────────────
  //  · 매 작성마다 제품영역(G4:T93)을 비워 이전 실행 누적을 제거
  //  · 같은 상품(보험료+납기/만기 동일)이 여러 열이면 뒤 열을 비움
  //  · 보장합산 "총 납입보험료"는 남은 상품 열로 다시 합산
  //  · 색칠: 값 있는 칸=노랑, G~T 통째로 빈 줄=빨강(조건부서식 제거 후 우리 색이 이김)
  var YELLOW = '#ffe599', REDFILL = '#ff0000', WHITE = '#ffffff';
  var CR1 = 12, CR2 = 93, CC1 = 7, CC2 = 20;   // 색칠 구역 G12:T93
  var HR1 = 4;                                   // 제품 데이터 시작 행(가입회사) — 헤더+보장 전체
  var P0 = 7, PSTRIDE = 2;                       // 상품 열: G(7)부터 2칸 간격(좌=데이터/납기, 우=만기)

  // 시트별로 edits 묶기
  var bySheet = {};
  for (var i = 0; i < edits.length; i++) {
    var e = edits[i]; if (!e) continue;
    var si = (e.s | 0); if (!bySheet[si]) bySheet[si] = [];
    bySheet[si].push(e);
  }

  Object.keys(bySheet).forEach(function (sk) {
    var sheet = sheets[sk | 0]; if (!sheet) return;
    var maxR = sheet.getMaxRows(), maxC = sheet.getMaxColumns();
    var rEnd = Math.min(CR2, maxR), cEnd = Math.min(CC2, maxC);
    if (rEnd < HR1 || cEnd < CC1) return;

    // A) 제품 영역(G4:T93) 값 비우기 — 이전 실행 누적 제거(양식이 비어있으므로 안전)
    try { sheet.getRange(HR1, CC1, rEnd - HR1 + 1, cEnd - CC1 + 1).clearContent(); } catch (_e) {}

    // B) 이번 edits 기입(빈값 ''은 칸 비우기)
    var list = bySheet[sk];
    for (var j = 0; j < list.length; j++) {
      var ed = list[j];
      var r = (ed.r | 0) + 1, c = (ed.c | 0) + 1; if (r < 1 || c < 1) continue;
      var v = ed.v, hasVal = (v !== '' && v !== null && v !== undefined);
      try { sheet.getRange(r, c).setValue(hasVal ? v : ''); } catch (_e) {}
    }
    SpreadsheetApp.flush();

    // C) 라벨로 보험료/납기/총납입 행, 보장합산 열 찾기 (A~T 스캔)
    var rBoryo = -1, rNapgi = -1, rTotal = -1, cHapsan = -1;
    try {
      var head = sheet.getRange(1, 1, rEnd, cEnd).getValues();
      for (var hr = 0; hr < head.length; hr++) {
        for (var hc = 0; hc < head[hr].length; hc++) {
          var t = String(head[hr][hc] == null ? '' : head[hr][hc]).replace(/\s/g, '');
          if (!t) continue;
          if (t === '보험료' && rBoryo < 0) rBoryo = hr + 1;
          if (t.indexOf('납기') >= 0 && rNapgi < 0) rNapgi = hr + 1;
          if (t.indexOf('총') >= 0 && t.indexOf('납입') >= 0 && rTotal < 0) rTotal = hr + 1;
          if (t.indexOf('보장합산') >= 0 && cHapsan < 0) cHapsan = hc + 1;
        }
      }
    } catch (_e) {}

    // D) 같은 상품(보험료+납기/만기 동일) 중복 열 제거 — 뒤 열을 통째로 비움
    if (rBoryo > 0) {
      var seen = {};
      for (var pc = P0; pc <= cEnd; pc += PSTRIDE) {
        var bo = '';
        try { bo = String(sheet.getRange(rBoryo, pc).getValue() || '').replace(/[^\d]/g, ''); } catch (_e) {}
        if (!bo) continue;                       // 보험료 없는 빈 상품 열 건너뜀
        var na = '';
        if (rNapgi > 0) {
          try { na = (String(sheet.getRange(rNapgi, pc).getValue() || '') + '/' + String(sheet.getRange(rNapgi, pc + 1).getValue() || '')).replace(/\s/g, ''); } catch (_e) {}
        }
        var id = bo + '|' + na;
        if (seen[id]) { try { sheet.getRange(HR1, pc, rEnd - HR1 + 1, 2).clearContent(); } catch (_e) {} }
        else seen[id] = 1;
      }
      SpreadsheetApp.flush();
    }

    // E) 보장합산 "총 납입보험료" 다시 합산(중복 제거 후 남은 상품 열만)
    if (rTotal > 0 && cHapsan > 0) {
      var sum = 0, any = false;
      for (var pc2 = P0; pc2 <= cEnd; pc2 += PSTRIDE) {
        var tv; try { tv = sheet.getRange(rTotal, pc2).getValue(); } catch (_e) { tv = ''; }
        var sv = String(tv == null ? '' : tv).replace(/\s/g, '');
        if (sv === '') continue;
        var n = Number(sv.replace(/[^\d.\-]/g, ''));
        if (!isNaN(n)) { sum += n; any = true; }
      }
      if (any) { try { sheet.getRange(rTotal, cHapsan).setValue(sum); } catch (_e) {} }
    }

    // F) 조건부 서식 제거(G12:T93에 걸린 규칙) → 우리 배경색(노랑)이 이김
    try {
      var rules = sheet.getConditionalFormatRules(), kept = [];
      for (var ri = 0; ri < rules.length; ri++) {
        var rgs = rules[ri].getRanges(), hit = false;
        for (var qi = 0; qi < rgs.length; qi++) {
          var gg = rgs[qi];
          var gr1 = gg.getRow(), gc1 = gg.getColumn(), gr2 = gr1 + gg.getNumRows() - 1, gc2 = gc1 + gg.getNumColumns() - 1;
          if (!(gr2 < CR1 || gr1 > rEnd || gc2 < CC1 || gc1 > cEnd)) { hit = true; break; }
        }
        if (!hit) kept.push(rules[ri]);
      }
      if (kept.length !== rules.length) sheet.setConditionalFormatRules(kept);
    } catch (_e) {}

    // G) 색칠: G12:T93의 실제 최종값 기준
    var nR = rEnd - CR1 + 1, nC = cEnd - CC1 + 1;
    if (nR >= 1 && nC >= 1) {
      var rng = sheet.getRange(CR1, CC1, nR, nC);
      var vals; try { vals = rng.getValues(); } catch (_e) { vals = null; }
      if (vals) {
        var bg = [];
        for (var i2 = 0; i2 < nR; i2++) {
          var rowEmpty = true;
          for (var k = 0; k < nC; k++) { var cv = vals[i2][k]; if (cv !== '' && cv !== null) { rowEmpty = false; break; } }
          var rowBg = [];
          for (var k2 = 0; k2 < nC; k2++) {
            var cv2 = vals[i2][k2], filled = (cv2 !== '' && cv2 !== null);
            rowBg.push(filled ? YELLOW : (rowEmpty ? REDFILL : WHITE));
          }
          bg.push(rowBg);
        }
        try { rng.setBackgrounds(bg); } catch (_e) {}
      }
    }
  });
  SpreadsheetApp.flush();

  // 고객 "이름 / 나이"를 D2에 기입 — 전(0)·후(1) 두 시트 모두 동일하게
  var nameAge = String(body.nameAge || '').trim();
  if (nameAge) {
    for (var di = 0; di < 2; di++) {
      var sh2 = sheets[di];
      if (sh2) { try { sh2.getRange(2, 4).setValue(nameAge); } catch (_e) {} }
    }
    SpreadsheetApp.flush();
  }

  var file = DriveApp.getFileById(ssId);
  // 인트라넷 임베드에서 팀원이 직접 보고/편집할 수 있도록 링크 공유(편집).
  //  ※ 더 엄격히 하려면 Permission.VIEW(보기전용) 또는 Access.DOMAIN(도메인 한정)으로 변경.
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT); } catch (e) {}
  out.setContent(JSON.stringify({
    ok: true, id: ssId, url: ss.getUrl(),
    embedUrl: 'https://docs.google.com/spreadsheets/d/' + ssId + '/edit?rm=embedded&widget=true&headers=false'
  }));
  return out;
}

// 고객명으로 이미 저장된 "{고객}님 보장분석표"를 찾아 임베드 주소 반환(없으면 not_found)
//   → 전(前) 작성 후, 같은 고객의 표를 불러와 후(後)를 이어서 작성할 때 사용
function _waOpenSheet(body, out) {
  var member = String(body.member || '미지정').trim() || '미지정';
  var cust   = String(body.cust   || '').trim();
  if (!cust) { out.setContent(JSON.stringify({ error: 'cust required' })); return out; }
  var custFolder = _resolveFolderPath(_getFolder(), member, ['보장분석표', cust]);
  var ex = custFolder.getFilesByName(cust + '님 보장분석표');
  if (!ex.hasNext()) { out.setContent(JSON.stringify({ ok: false, error: 'not_found' })); return out; }
  var f = ex.next(), id = f.getId();
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT); } catch (e) {}
  out.setContent(JSON.stringify({
    ok: true, id: id, url: f.getUrl(),
    embedUrl: 'https://docs.google.com/spreadsheets/d/' + id + '/edit?rm=embedded&widget=true&headers=false'
  }));
  return out;
}

// 고객 보장분석표(구글시트) → 엑셀(xlsx) base64로 내보내기
function _waExportXlsx(body, out) {
  var id = String(body.id || '').trim();
  if (!id) { out.setContent(JSON.stringify({ error: 'id required' })); return out; }
  // 보안: 임의 시트 ID 내보내기 방지 — '보장분석표' 파일만 허용
  try {
    var chk = DriveApp.getFileById(id);
    if (chk.getName().indexOf('보장분석표') < 0) { out.setContent(JSON.stringify({ error: 'not_allowed' })); return out; }
  } catch (e) { out.setContent(JSON.stringify({ error: 'not_found' })); return out; }
  var resp = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx',
    { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) { out.setContent(JSON.stringify({ error: 'export ' + resp.getResponseCode() })); return out; }
  out.setContent(JSON.stringify({ ok: true, b64: Utilities.base64Encode(resp.getContent()) }));
  return out;
}

// 셀 값 정규화: 문자열화 + 길이 제한
function _cell(c) {
  c = (c == null) ? '' : String(c);
  if (c.length > MAX_CELL) c = c.substring(0, MAX_CELL) + '…(생략)';
  return c;
}

// 중앙 공용 스프레드시트 가져오기(없으면 생성, ID는 스크립트 속성에 저장)
function _getSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SS_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* 삭제됨 → 재생성 */ }
  }
  var folder = _getFolder();
  var ss = SpreadsheetApp.create(SPREADSHEET_NAME);
  var file = DriveApp.getFileById(ss.getId());
  // 루트에서 지정 폴더로 이동
  try { folder.addFile(file); DriveApp.getRootFolder().removeFile(file); } catch (e) {}
  // 기본 'Sheet1' 빈 탭은 그대로 두어도 무방
  props.setProperty('SS_ID', ss.getId());
  return ss;
}

// 저장 폴더 가져오기(없으면 생성)
function _getFolder() {
  var it = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(ROOT_FOLDER_NAME);
}

// 하위 폴더 가져오기(없으면 생성)
function _getChildFolder(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

// {팀원}/seg1/seg2/... 경로 폴더를 차례로 만들며 마지막 폴더 반환. folders=[] 면 팀원 폴더.
function _resolveFolderPath(root, member, folders) {
  var f = _getChildFolder(root, member);
  if (folders && folders.length) {
    for (var i = 0; i < folders.length; i++) {
      var nm = String(folders[i] == null ? '' : folders[i]).trim();
      if (nm) f = _getChildFolder(f, nm);
    }
  }
  return f;
}

// 보험금 청구 PDF 저장: {팀원이름} / 보험청구서 / {고객명} / {파일명}
//   folders(경로 배열)가 오면 그대로 사용. 없으면 cust/예전 방식으로 호환 처리.
function _saveClaimFile(body, out) {
  var member   = String(body.member || '미지정').trim() || '미지정';
  var cust     = String(body.cust || '').trim();
  var folder   = String(body.folder || '보험금청구').trim() || '보험금청구';
  var fileName = String(body.filename || 'file.pdf').trim() || 'file.pdf';
  var b64      = body.b64 || '';
  if (!b64) { out.setContent(JSON.stringify({ error: 'b64 required' })); return out; }

  var root    = _getFolder();
  var subF;
  if (body.folders) {
    subF = _resolveFolderPath(root, member, body.folders);   // 예: 보험청구서 / {고객}
  } else if (cust) {
    subF = _getChildFolder(_getChildFolder(root, member), cust);
  } else {
    var claimRoot = _getChildFolder(root, '보험금청구');       // 예전 방식 호환
    var memF2     = _getChildFolder(claimRoot, member);
    subF          = _getChildFolder(memF2, folder);
  }

  // 같은 이름 파일이 있으면 휴지통으로(덮어쓰기 효과)
  var ex = subF.getFilesByName(fileName);
  while (ex.hasNext()) ex.next().setTrashed(true);

  var mime = String(body.mime || 'application/pdf').trim() || 'application/pdf';
  var bytes = Utilities.base64Decode(b64);
  var blob = Utilities.newBlob(bytes, mime, fileName);
  var f = subF.createFile(blob);
  out.setContent(JSON.stringify({ ok: true, file: fileName, url: f.getUrl() }));
  return out;
}

// 팀원/하위폴더 경로에 파일 1개 저장(문서/시트)
//   folders(경로 배열) 사용. 예) 병력정리/{고객}=['병력정리'], 보장분석=['보장분석표','{고객}']
//   형식:  kind='sheet' → 구글시트(헤더+행),  kind='doc' → 구글문서(텍스트)
function _saveCustFile(body, out) {
  var member   = String(body.member   || '미지정').trim() || '미지정';
  var cust     = String(body.cust     || '').trim();
  var category = String(body.category || '').trim();
  var fileName = String(body.filename || cust).trim() || cust;
  var kind     = String(body.kind     || 'sheet');
  if (!fileName) { out.setContent(JSON.stringify({ error: 'filename required' })); return out; }

  var root    = _getFolder();
  var catF;
  if (body.folders) {
    catF = _resolveFolderPath(root, member, body.folders);
  } else {
    // 예전 방식(category) 호환
    var memberF = _getChildFolder(root, member);
    if (category === '고객등록')        catF = _getChildFolder(memberF, '고객정보');
    else if (category === 'DB배정현황')  catF = _getChildFolder(memberF, 'DB배정');
    else                                catF = _getChildFolder(memberF, cust);
  }

  // 같은 이름 파일이 있으면 휴지통으로(덮어쓰기 효과)
  var ex = catF.getFilesByName(fileName);
  while (ex.hasNext()) ex.next().setTrashed(true);

  var f;
  if (kind === 'doc') {
    var doc = DocumentApp.create(fileName);
    doc.getBody().setText(String(body.text || ''));
    doc.saveAndClose();
    f = DriveApp.getFileById(doc.getId());
  } else {
    var ss = SpreadsheetApp.create(fileName);
    var sh = ss.getSheets()[0];
    var headers = body.headers || [];
    var rows    = body.rows || [];
    var data = [];
    if (headers.length) data.push(headers.map(_cell));
    for (var i = 0; i < rows.length; i++) data.push((rows[i] || []).map(_cell));
    if (data.length) {
      var w = 0;
      for (var j = 0; j < data.length; j++) w = Math.max(w, data[j].length);
      for (var j2 = 0; j2 < data.length; j2++) { while (data[j2].length < w) data[j2].push(''); }
      sh.getRange(1, 1, data.length, w).setValues(data);
      if (headers.length) {
        sh.getRange(1, 1, 1, w).setFontWeight('bold').setBackground('#e8eaf6');
        sh.setFrozenRows(1);
      }
    }
    SpreadsheetApp.flush();
    f = DriveApp.getFileById(ss.getId());
  }

  // 루트에서 대상 폴더로 이동
  try { catF.addFile(f); DriveApp.getRootFolder().removeFile(f); } catch (e) {}
  out.setContent(JSON.stringify({ ok: true, file: fileName, url: f.getUrl() }));
  return out;
}

// 통합 표 저장: {팀원}/{folders...}/{filename} 구글시트 1개에 가로(행)로 전부 저장
//   (전체 덮어쓰기). 예) 고객리스트=folders[], DB리스트=folders['DB배정']
function _saveCustTable(body, out) {
  var member   = String(body.member   || '미지정').trim() || '미지정';
  var fileName = String(body.filename || '목록').trim() || '목록';
  var headers  = body.headers || [];
  var rows     = body.rows || [];

  var root = _getFolder();
  var catF = _resolveFolderPath(root, member, body.folders || []);

  // 같은 이름의 통합 파일이 있으면 휴지통으로(덮어쓰기 효과)
  var ex = catF.getFilesByName(fileName);
  while (ex.hasNext()) ex.next().setTrashed(true);

  var ss = SpreadsheetApp.create(fileName);
  var sh = ss.getSheets()[0];
  var data = [];
  if (headers.length) data.push(headers.map(_cell));
  for (var i = 0; i < rows.length; i++) data.push((rows[i] || []).map(_cell));
  if (data.length) {
    var w = 0;
    for (var j = 0; j < data.length; j++) w = Math.max(w, data[j].length);
    for (var j2 = 0; j2 < data.length; j2++) { while (data[j2].length < w) data[j2].push(''); }
    sh.getRange(1, 1, data.length, w).setValues(data);
    if (headers.length) {
      sh.getRange(1, 1, 1, w).setFontWeight('bold').setBackground('#e8eaf6');
      sh.setFrozenRows(1);
    }
  }
  SpreadsheetApp.flush();
  var f = DriveApp.getFileById(ss.getId());
  try { catF.addFile(f); DriveApp.getRootFolder().removeFile(f); } catch (e) {}
  out.setContent(JSON.stringify({ ok: true, file: fileName, rows: rows.length, url: f.getUrl() }));
  return out;
}
