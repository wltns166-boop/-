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
var SERVER_VERSION = 'gsheet-5';             // 범용 서버 버전(클라이언트가 doGet으로 확인)

function doPost(e) {
  var out = ContentService.createTextOutput();
  out.setMimeType(ContentService.MimeType.JSON);
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // 폴더를 만드는 작업은 동시 실행 시 중복 폴더가 생기므로 잠금으로 직렬화
    if (body.action === 'claimFile' || body.action === 'custFile' || body.action === 'custTable'
        || body.action === 'waRegister' || body.action === 'waGrid'
        || body.action === 'waCreate' || body.action === 'waExport') {
      var lock = LockService.getScriptLock();
      try { lock.waitLock(50000); } catch (e) {}
      try {
        if (body.action === 'claimFile') return _saveClaimFile(body, out);
        if (body.action === 'custTable') return _saveCustTable(body, out);
        if (body.action === 'waRegister') return _waRegisterTemplate(body, out);
        if (body.action === 'waGrid')     return _waTemplateGrid(body, out);
        if (body.action === 'waCreate')   return _waCreateSheet(body, out);
        if (body.action === 'waExport')   return _waExportXlsx(body, out);
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
    var vals = (lastR > 0 && lastC > 0) ? sh.getRange(1, 1, lastR, lastC).getDisplayValues() : [];
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

  // ── 색칠 규칙 ─────────────────────────────────────────────
  //  · 노란색(#ffe599): G12:T93 범위에서 "값이 채워진 칸"만
  //  · 빨간색(#f4cccc): 같은 범위에서 G~T 한 줄이 통째로 비면 그 줄 전체
  //  · 그 밖(라벨 B·C열, 보장합산 D열, 상단 헤더)은 절대 색칠하지 않음
  var YELLOW = '#ffe599', REDFILL = '#ff0000';   // 미입력 줄은 진한 빨강으로 확실히 표시
  var CR1 = 12, CR2 = 93, CC1 = 7, CC2 = 20;   // G12:T93 (1기준: 행 12~93, 열 G(7)~T(20))

  // 시트별로 edits 묶기
  var bySheet = {};
  for (var i = 0; i < edits.length; i++) {
    var e = edits[i]; if (!e) continue;
    var si = (e.s | 0); if (!bySheet[si]) bySheet[si] = [];
    bySheet[si].push(e);
  }

  Object.keys(bySheet).forEach(function (sk) {
    var si = sk | 0; var sheet = sheets[si]; if (!sheet) return;
    var maxR = sheet.getMaxRows(), maxC = sheet.getMaxColumns();
    var r2 = Math.min(CR2, maxR), c2 = Math.min(CC2, maxC);
    if (r2 < CR1 || c2 < CC1) return;
    var nC = c2 - CC1 + 1;

    // 1) 색칠 구역(G12:T93) 초기화 — 이전 작성/구버전 색을 지움
    try { sheet.getRange(CR1, CC1, r2 - CR1 + 1, nC).setBackground(null); } catch (_e) {}

    // 2) 값 기입 + 값이 채워진 칸만 노란색. 빈값('')은 칸을 비우고 색칠하지 않음(중복 열 제거용).
    var rowHasVal = {};
    var list = bySheet[si];
    for (var j = 0; j < list.length; j++) {
      var ed = list[j];
      var r = (ed.r | 0) + 1, c = (ed.c | 0) + 1; if (r < 1 || c < 1) continue;
      var v = ed.v, hasVal = (v !== '' && v !== null && v !== undefined);
      try {
        var cell = sheet.getRange(r, c);
        cell.setValue(hasVal ? v : '');
        if (hasVal && c >= CC1 && c <= c2 && r >= CR1 && r <= r2) { cell.setBackground(YELLOW); rowHasVal[r] = true; }
      } catch (_e) {}
    }

    // 3) G~T가 통째로 빈 줄은 그 줄 전체(G:T)를 빨간색으로 — 미입력 보장 표시
    for (var rr = CR1; rr <= r2; rr++) {
      if (!rowHasVal[rr]) { try { sheet.getRange(rr, CC1, 1, nC).setBackground(REDFILL); } catch (_e) {} }
    }
  });
  SpreadsheetApp.flush();

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
