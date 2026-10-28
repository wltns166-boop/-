# TOPS 보장분석 프로그램 — 인트라넷 설치 안내

> 이 문서는 인트라넷을 운영하는 Claude(또는 개발자)가 읽고 설치할 수 있게 작성했습니다.
> 아래 **"Claude에게 이렇게 요청하세요"**를 그대로 복사해 전달하면 됩니다.

---

## 0. Claude에게 이렇게 요청하세요

```
첨부한 bojang 폴더는 '보장분석 프로그램'입니다. README.md를 끝까지 읽고 우리 인트라넷 아티팩트에 추가해 주세요.
1) 인트라넷 아티팩트의 하위 폴더 bojang/ 에 폴더 안 파일을 모두 게시하고, 인트라넷 메뉴에 '보장분석' 링크(bojang/index.html)를 추가
2) README의 '필요한 기능(capabilities)'을 기존 선언에 합쳐서 선언 (기존 것은 유지)
3) bojang/index.html 상단 BOJANG_CONFIG에서 prefix를 "bojang_"으로 바꾸고,
   인트라넷 로그인 정보를 externalUser로 연결 (우리 인트라넷이 로그인 사용자를 어디에 저장하는지 확인해서)
4) seed/staff.json 을 사번 저장 위치에 넣기 (인트라넷 로그인 연동을 쓰면 생략 가능)
```

---

## 1. 무엇을 하는 프로그램인가

| 기능 | 설명 |
|---|---|
| 사번 로그인 | 관리자/FC 권한. FC는 본인 고객만, 관리자는 지점 전체 고객 |
| 보장분석 (전) | 기존보험 PDF(증권·가입내역·보험사 보장분석) 업로드 → AI가 담보를 읽어 표준 항목에 배치 |
| 보장분석 (후) | 유지할 기존보험 선택 + 제안서 PDF 업로드, 통합치료비 자동전개, 업계누적 인수한도 점검(사내용) |
| 전후 비교 | 월보험료·앞으로 낼 총보험료, 항목별 증감 |
| 질환별 수령액 | 암·뇌·심장·용종·골절 시나리오, 치료 단계별 금액 |
| 점검·상담자료 | 14개 항목 자동 점검(실손 세대·5세대 전환, 뇌·심장 보장 범위 등) + 상담자료 100장 추천 |
| PDF 출력 | 요약·보장분석표(전/후)·질환별·치료단계·점검결과·상담자료를 A4 PDF로 저장 |
| 교육·약관 | TOPS BOOK 166쪽 검색·열람, 1~5종 수술분류표 101항목 조회 |
| 설정 | FC별 보장분석표 표시 항목 선택, 종수술 기본금액, 담보명 학습 사전 |

---

## 2. 파일 구성

```
bojang/
├─ index.html          프로그램 본체 (HTML+CSS+JS 한 파일, 완전한 문서)
├─ dict.js             담보명 사전 (보험사 담보명 → 표준 항목)
├─ jong5.js            1~5종 수술분류표 데이터
├─ book.js             교육자료(TOPS BOOK) 검색 색인
├─ kcmaps.js           한글 PDF 글꼴 정보(한화손보 등 일부 PDF 읽기에 필요)
├─ pdf.worker.min.js   PDF 읽기 도구(pdf.js 3.11.174)
├─ mat/                상담자료 이미지 100장 (고객 PDF에 첨부 가능)
├─ book/               TOPS BOOK 166쪽 이미지 (사내 교육용)
└─ seed/
   ├─ staff.json       현재 사번 목록 (비밀번호 해시 포함, 초기 비밀번호 0000)
   └─ config_jong.json 종수술 기본금액
```

외부 라이브러리는 cdnjs에서 불러옵니다: pdf.js 3.11.174, html2canvas 1.4.1, jsPDF 2.5.1, Google Fonts(IBM Plex Sans KR, Noto Serif KR).

모든 경로가 **상대경로**라서 `bojang/` 같은 하위 폴더에 그대로 두면 동작합니다.

---

## 3. 필요한 기능 (claude.ai 아티팩트 capabilities)

인트라넷 아티팩트의 **기존 선언에 아래를 합쳐서** 선언해야 합니다. capabilities는 전체를 다시 선언하는 방식이라, 기존 항목을 빼먹으면 기존 기능이 꺼집니다.

```json
{
  "db": { "rules": [ { "path": "data/staff", "read": "view", "write": "admin" } ] },
  "user": {},
  "sample": { "images": true },
  "downloads": true
}
```

| 기능 | 쓰는 곳 | 없으면 |
|---|---|---|
| `db` | 사번·고객·설정 저장 | 프로그램이 동작하지 않음 |
| `user` | 최초 관리자 생성 권한 확인 | 최초 설정 화면만 영향 |
| `sample` (images:true) | PDF 담보 자동 인식(AI), 스캔 PDF는 이미지로 인식 | 자동 인식 대신 직접 입력 |
| `downloads` | PDF 보고서 저장 | PDF 다운로드 버튼 비활성 |

- `staffPath`를 바꾸면 위 rules의 `path`도 같은 상위 경로로 바꾸세요 (예: `bojang_staff/emp` → path `"bojang_staff"`는 문서 경로가 아니므로, `data/bojang_staff/emp`처럼 짝수 단계 경로로 두고 path `"data/bojang_staff"`).
- 인트라넷 db 규칙(rules)이 이미 있으면 같은 배열에 위 규칙을 추가합니다. (최대 64개)

---

## 4. 설치 방법

### 방법 A — 인트라넷 안에 넣기 (권장, 같은 로그인·같은 저장소)

1. 인트라넷 아티팩트에 `bojang/` 하위 폴더로 모든 파일을 게시합니다.
   Artifact 도구 기준: `files`에 `{"bojang/index.html": "...", "bojang/dict.js": "...", "bojang/mat/xxx.jpg": "...", ...}` (총 약 280개 파일, 43MB → 한 번에 255개까지이므로 2번에 나눠 게시)
2. 인트라넷 메뉴에 링크 추가: `<a href="bojang/index.html">보장분석</a>`
3. `bojang/index.html` 맨 위의 `window.BOJANG_CONFIG`를 설정합니다.

```html
<script>
window.BOJANG_CONFIG = {
  prefix: "bojang_",              // ★ 인트라넷 저장소와 겹치지 않게 (customers → bojang_customers)
  staffPath: "data/staff/emp",    // 자체 사번 로그인을 쓸 때 사번 저장 위치
  externalUser: () => {           // ★ 인트라넷 로그인 연동 (있으면 사번 로그인 화면을 건너뜀)
    // 인트라넷이 로그인 사용자를 저장하는 곳에 맞게 바꾸세요. 같은 아티팩트라 같은 origin이므로 storage 공유됨.
    try {
      const u = JSON.parse(sessionStorage.getItem("인트라넷_로그인_키") || "null");
      return u ? { sabun: u.사번, name: u.이름, role: u.관리자여부 ? "admin" : "fc" } : null;
    } catch (e) { return null; }
  }
};
</script>
```

- `externalUser`가 `null`을 돌려주면 자체 사번 로그인 화면이 나옵니다.
- `externalUser`를 쓰면 로그아웃 버튼은 숨겨집니다(인트라넷 로그아웃 사용).
- 고객은 `ownerSabun`(사번)으로 구분하므로, 인트라넷 사번과 같은 값을 넘기면 됩니다.

### 방법 B — 별도 아티팩트로 두고 링크만 걸기 (가장 간단)

`bojang/` 폴더를 새 아티팩트로 게시하고(위 capabilities 선언), 인트라넷 메뉴에 그 아티팩트 링크를 겁니다. 저장소가 분리되어 충돌 걱정이 없지만, 로그인은 따로 합니다(사번+비밀번호).

> 다른 아티팩트를 iframe으로 넣는 방식은 claude.ai에서 막혀 있으니 쓰지 마세요.

---

## 5. 초기 데이터 넣기

### 사번 (`seed/staff.json`)
자체 사번 로그인을 쓸 때만 필요합니다. ArtifactData `batch`로 `staffPath` 컬렉션에 넣습니다 (문서 id = 사번).

```json
{ "sabun": "2331535", "name": "백동현", "role": "admin", "salt": "...", "hash": "...", "active": true }
```
- `hash = SHA-256(salt + ":" + 비밀번호)` (16진수). 현재 모든 사번의 비밀번호는 `0000`.
- 새로 만들 때: salt는 임의 문자열, 위 공식으로 hash 계산.

### 종수술 기본금액 (`seed/config_jong.json`)
선택. `{prefix}config/jong` 문서에 넣습니다. 넣지 않으면 프로그램 기본값(같은 값)을 씁니다.

---

## 6. 데이터 구조 (db)

| 경로 | 내용 |
|---|---|
| `{staffPath}/{사번}` | 사번·이름·권한·비밀번호 해시·사용여부·직급(title)·소속(team) |
| `{prefix}customers/{고객id}` | 고객 1명 = 문서 1개. `ownerSabun`, `name`, `birth`, `before[]`(기존보험), `proposals[]`(제안), `mats[]`(선택 상담자료), `history[]` |
| `{prefix}config/dict` | `{map: {정규화된 담보명: 항목key}}` FC가 고친 담보 분류 학습 사전 (지점 공용) |
| `{prefix}config/jong` | 종수술 기본금액 `{life[5], nl5[5], nl7[7]}` |
| `{prefix}fcprefs/{사번}` | FC별 표시 항목 설정 `{hidden[], shown[]}` |

보험 1건(`before[]`/`proposals[]` 항목): `company, product, joinDate, premium(월,원), payYears, renewal, expiry, silson, values{항목key: 만원}, cov[{name, amount, key, src}], expand, keep, summary`

---

## 7. claude.ai가 아닌 곳(일반 웹서버)에서 쓰려면

프로그램은 `window.claude.use(이름)`으로 기능을 가져옵니다. 일반 서버에서는 이 함수를 직접 만들어 주면 됩니다(index.html보다 먼저 로드).

```html
<script>
window.claude = { use: async (name) => ({
  db: myDb,           // Firestore와 같은 형태: doc(path).get/set/update/delete/onSnapshot, collection(path).where/limit/get/onSnapshot/doc
  sample: mySample,   // mySample.json(promptText, {images}) → AI가 돌려준 JSON 객체 (Claude API 등 호출), mySample.limits()
  downloads: { save: async ({filename, data}) => { /* Blob 다운로드 */ return {status:"saved"} } },
  user: null
})[name] || null };
</script>
```
- Firebase Firestore를 쓰면 `doc/collection/where/onSnapshot` 형태가 거의 같아서 얇은 래퍼로 연결됩니다.
- `sample`이 없으면 PDF 자동 인식만 빠지고(직접 입력), 나머지 기능은 모두 동작합니다.

---

## 8. 주의사항

- `book/`(TOPS BOOK)과 프로그램 안의 **업계누적 인수한도 표**는 **사내 교육용·고객 배포 금지** 자료입니다. FC 화면에만 보이고 고객 PDF에는 들어가지 않게 되어 있습니다.
- 고객 보험 정보는 개인정보입니다. 인트라넷 아티팩트의 공유 범위(누가 열 수 있는지)를 확인하세요. db는 아티팩트를 열 수 있는 사람이면 기술적으로 읽을 수 있습니다.
- 이 프로그램의 사번/비밀번호는 프로그램 내부의 FC 구분용입니다. 실제 접근 통제는 아티팩트 공유 설정(참여자 이상만 저장 가능)으로 합니다.
- 원본 프로그램: 백동현님 claude.ai 아티팩트 "TOPS 보장분석". 이후 수정 사항은 원본에서 새 패키지로 받아 같은 방식으로 덮어쓰면 됩니다(저장된 데이터는 유지).
