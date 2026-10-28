/* TOPS 인트라넷 연결 (2026-10-28) — 보장분석 프로그램(bojang/index.html)을 인트라넷 [신보장분석작성] 화면 안에서 쓰기 위한 다리.
 * 프로그램은 claude.ai 아티팩트용으로 만들어져 window.claude.use('db'|'sample'|'downloads'|'user')로 기능을 가져온다.
 * 여기서 그 함수를 인트라넷 것으로 채운다 — 저장소=인트라넷 Firestore(부모 창의 window.db), AI 인식=/api/analyze(Gemini),
 * 다운로드=브라우저 저장, 로그인=부모 창의 인트라넷 로그인(window._bojangUser).
 * 부모 창(같은 출처 인트라넷)이 없으면 아무것도 하지 않는다 → 프로그램이 "저장소에 연결할 수 없습니다" 화면을 보여 준다. */
(function(){
  'use strict';
  var P=null;
  try{ if(window.parent && window.parent!==window && window.parent.location.origin===location.origin && window.parent.db) P=window.parent; }catch(e){ P=null; }
  if(!P) return;

  var ME=null; try{ ME=P._bojangUser ? P._bojangUser() : null; }catch(e){ ME=null; }
  if(!ME || !ME.sabun) return; // 인트라넷 로그인 전이면 연결하지 않음(자체 '최초 관리자 만들기' 화면이 열리지 않게)
  window.BOJANG_CONFIG={
    prefix:'bojang_',                 // 인트라넷 컬렉션과 겹치지 않게: bojang_customers, bojang_config, bojang_fcprefs
    staffPath:'bojang_data/staff/emp',// 자체 사번 로그인은 쓰지 않음(인트라넷 로그인 연동) — 관리 화면의 사번 목록용 자리만
    externalUser:function(){ return ME; },
    branchName:'TOPS'
  };

  var FDB=P.db;
  // 실시간 구독 해제 목록 — 화면(iframe)이 사라져도 부모 창 Firestore 구독은 살아남으므로(리뷰) 여기 모아 두고 닫을 때 전부 해제.
  var UNSUBS=[];
  function track(un){ UNSUBS.push(un); return function(){ try{ un(); }catch(e){} var i=UNSUBS.indexOf(un); if(i>=0) UNSUBS.splice(i,1); }; }
  window._bojangTeardown=function(){ UNSUBS.splice(0).forEach(function(u){ try{ u(); }catch(e){} }); };
  window.addEventListener('pagehide',function(){ try{ if(typeof window.flushSave==='function') window.flushSave(); }catch(e){} window._bojangTeardown(); });

  // ── 저장 형식: 고객 문서는 통째 JSON 글자로 보관(_j) ──
  //   Firestore는 배열 안의 배열·undefined를 거부한다(인트라넷 4.94 v-4 실사고). 고객 문서는 구조가 깊어 안전하게 글자로 저장하고,
  //   목록 조회에 쓰는 ownerSabun·updatedAt만 바깥에 둔다. 다른 문서(설정·사전)는 그대로 저장.
  function isCust(path){ return /^bojang_customers\//.test(path); }
  function enc(path,data){
    if(!isCust(path)) return data;
    data=data||{};
    return { ownerSabun:String(data.ownerSabun||''), updatedAt:+data.updatedAt||0, _j:JSON.stringify(data) };
  }
  function dec(raw){
    if(raw && typeof raw._j==='string'){ try{ return JSON.parse(raw._j); }catch(e){ return null; } }
    return raw;
  }
  function wrapDoc(s){
    return { id:s.id, exists:!!s.exists, data:function(){ return s.exists ? dec(s.data()) : undefined; } };
  }
  function wrapQuery(qs){
    var docs=qs.docs.map(wrapDoc);
    return { docs:docs, empty:docs.length===0, size:docs.length, forEach:function(f){ docs.forEach(f); } };
  }
  // ⚠️ 이 창(iframe)에서 만든 객체를 부모 창 Firestore에 그대로 넘기면 SDK가 "다른 창의 객체"라며 거부한다
  //   (invalid-argument "Data must be an object, but it was: a custom Object object" — 2026-10-28 실사고 "저장 실패").
  //   부모 창의 JSON.parse로 다시 만들어 부모 창 객체로 바꿔 넘긴다(undefined 칸도 함께 사라짐).
  function toP(v){ if(v===undefined||v===null) return v; try{ return P.JSON.parse(JSON.stringify(v)); }catch(e){ return v; } }
  var CODE_MAP={ 'permission-denied':'invalid_argument', 'resource-exhausted':'quota_exceeded', 'unavailable':'unavailable', 'deadline-exceeded':'unavailable' };
  function errCode(e){ // 프로그램은 claude.ai 저장소 코드(invalid_argument=권한 없음·quota_exceeded·unavailable)로 안내문을 고른다 — Firestore 코드를 맞춰 준다
    if(e && e.code && CODE_MAP[e.code]) e.code=CODE_MAP[e.code];
    if(e && !e.code) e.code='error';
    try{ console.warn('[bojang] Firestore 오류:', e && e.code, e && e.message); }catch(x){}
    return e;
  }
  function docApi(path){
    var ref=FDB.doc(path);
    return {
      id:ref.id,
      get:function(){ return ref.get().then(wrapDoc).catch(function(e){ throw errCode(e); }); },
      set:function(d,opt){ return ref.set(toP(enc(path,d)), opt&&opt.merge?toP({merge:true}):undefined).catch(function(e){ throw errCode(e); }); },
      // 프로그램의 update는 '그 필드만 합치기' 의도(예: 담보명 학습 사전 map에 한 항목 추가) — Firestore update는 map을 통째 바꾸므로 merge set으로.
      update:function(d){
        if(isCust(path)) return Promise.reject(errCode({code:'unsupported',message:'update on customer doc'}));
        return ref.set(toP(d),toP({merge:true})).catch(function(e){ throw errCode(e); });
      },
      delete:function(){ return ref.delete().catch(function(e){ throw errCode(e); }); },
      onSnapshot:function(ok,bad){ return track(ref.onSnapshot(function(s){ ok(wrapDoc(s)); }, function(e){ bad&&bad(errCode(e)); })); }
    };
  }
  function queryApi(q,path){
    return {
      where:function(a,op,b){ return queryApi(q.where(a,op,b),path); },
      orderBy:function(a,d){ return queryApi(q.orderBy(a,d),path); },
      limit:function(n){ return queryApi(q.limit(n),path); },
      get:function(){ return q.get().then(wrapQuery).catch(function(e){ throw errCode(e); }); },
      onSnapshot:function(ok,bad){ return track(q.onSnapshot(function(s){ ok(wrapQuery(s)); }, function(e){ bad&&bad(errCode(e)); })); },
      doc:function(id){ return docApi(path+'/'+id); }
    };
  }
  var dbApi={
    doc:function(path){ return docApi(String(path)); },
    collection:function(path){ path=String(path); return queryApi(FDB.collection(path),path); }
  };

  // ── AI 담보 인식: 인트라넷 /api/analyze (Gemini) ──
  var AI_MAX_IMG=4; // 서버가 한 번에 받는 사진 수(functions /api/analyze 이미지 상한)
  function blobToDataUrl(b){
    return new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){ res(r.result); }; r.onerror=function(){ rej(r.error); }; r.readAsDataURL(b); });
  }
  function pickJson(t){
    t=String(t||'').replace(/^\s*```(?:json)?/i,'').replace(/```\s*$/,'').trim();
    try{ return JSON.parse(t); }catch(e){}
    var a=t.indexOf('{'), z=t.lastIndexOf('}');
    if(a>=0 && z>a){ try{ return JSON.parse(t.slice(a,z+1)); }catch(e){} }
    var e2=new Error('invalid_json'); e2.code='invalid_json'; throw e2;
  }
  function aiModel(){ var m=''; try{ m=localStorage.getItem('tops_ai_bojang_model')||''; }catch(e){} return /^gemini[\w.\-]*$/i.test(m)?m:'gemini-2.5-flash'; }
  var sampleApi={
    limits:function(){ return Promise.resolve({ images:{ maxCount:AI_MAX_IMG } }); },
    json:function(prompt,opt){
      var imgs=(opt&&opt.images)||[];
      return Promise.all(imgs.slice(0,AI_MAX_IMG).map(function(b){ return typeof b==='string'?b:blobToDataUrl(b); })).then(function(urls){
        var body={ model:aiModel(), max_tokens:32000, prompt:String(prompt||'')+'\n\n반드시 JSON 객체 하나만 출력하세요(설명·코드블록 표시 없이).' };
        if(urls.length) body.images=urls;
        return fetch('/api/analyze',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      }).then(function(r){
        return r.json().catch(function(){ return {}; }).then(function(d){
          if(!r.ok){
            var e=new Error((d&&d.error&&d.error.message)||('AI 서버 오류 '+r.status));
            e.code = r.status===429?'rate_limited':'ai_error';
            throw e;
          }
          var txt=((d&&d.content)||[]).map(function(c){ return (c&&c.text)||''; }).join('');
          if(/MAX_TOKENS/i.test(String(d&&d.stop||''))){ try{ return pickJson(txt); }catch(e){ var e3=new Error('AI 응답이 너무 길어 잘렸습니다. PDF를 나눠서 올려 주세요'); e3.code='ai_error'; throw e3; } }
          return pickJson(txt);
        });
      });
    }
  };

  // ── PDF 저장 ──
  var dlApi={
    save:function(o){
      return new Promise(function(res){
        var data=o&&o.data; var b=(data instanceof Blob)?data:new Blob([data],{type:'application/octet-stream'});
        var u=URL.createObjectURL(b); var a=document.createElement('a');
        a.href=u; a.download=String((o&&o.filename)||'download').replace(/[\\/:*?"<>|]/g,'_');
        document.body.appendChild(a); a.click();
        setTimeout(function(){ try{ URL.revokeObjectURL(u); a.remove(); }catch(e){} },4000);
        res({status:'saved'});
      });
    }
  };

  // PDF 올리는 칸 클릭 = 초록 선택 표시(.sel) — 다른 곳을 누르면 해제 (인트라넷의 다른 업로드 칸과 같은 느낌)
  document.addEventListener('mousedown',function(e){
    var d=e.target && e.target.closest ? e.target.closest('.drop') : null;
    document.querySelectorAll('.drop.sel').forEach(function(x){ if(x!==d) x.classList.remove('sel'); });
    if(d) d.classList.add('sel');
  },true);
  // ── 구글드라이브 보관 (2026-10-28, 사용자 요청 "자동으로 저장 · 구글드라이브에도 · 저장된 것 불러오기") ──
  //   폴더: TEAM TOPS 자료/{로그인 이름}/보장분석/{고객명_id끝6자리}/ — 데이터 백업 `보장분석데이터_고객명.json`(같은 이름이라 늘 최신 1개),
  //   출력한 보장분석표 PDF. 업로드는 내 자료함과 같은 앱스크립트 직접 POST(no-cors — 응답을 못 읽어 dvList의 이름·크기로 확인), 목록·내용은 /api/drive 프록시.
  //   백업은 Firestore 저장 뒤 20초 디바운스(연속 편집 중 매번 올리지 않게), 화면을 떠날 때는 바로 시작(최선 노력 — 창을 닫으면 끊길 수 있음).
  //   고객별 대기열(Map) — 다른 고객으로 옮겨도 앞 고객 대기분이 사라지지 않고, 삭제한 고객은 cancel로 대기분을 버림(되살아남 방지).
  var DRV_DEBOUNCE=20000, DRV_T=null, DRV_PEND=new Map(), DRV_BUSY=false;
  function driveUrl(){ try{ return (P._driveSyncUrl?P._driveSyncUrl():'')||''; }catch(e){ return ''; } }
  function member(){ return String(ME.name||'').trim(); }
  function safeName(n){ return String(n||'파일').replace(/[\\/:*?"<>|]/g,'_').replace(/^\.+$/,'_'); }
  function custFolder(c){ var nm=String((c&&c.name)||'고객').trim()||'고객'; return safeName(nm)+'_'+String((c&&c.id)||'').replace(/[^\w\-]/g,'').slice(-6); } // 동명이인·이름 변환 충돌 방지
  function b64Of(blob){ return blobToDataUrl(blob).then(function(u){ var i=u.indexOf(','); return i<0?'':u.slice(i+1); }); }
  function utf8B64(str){ var bytes=new TextEncoder().encode(str); var bin=''; for(var i=0;i<bytes.length;i+=0x8000) bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000)); return { b64:btoa(bin), size:bytes.length }; }
  function b64Utf8(b64){ var bin=atob(b64); var bytes=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i); return new TextDecoder().decode(bytes); }
  function proxy(payload){ return P._driveProxy(payload).then(function(r){ if(!r||r.error||!r.ok){ var e=new Error((r&&r.error&&(r.error.message||r.error))||'drive_error'); e.r=r; throw e; } return r; }); }
  function listHas(r, filename, size){ return (r.files||[]).some(function(x){ return String(x&&x.name)===filename && (size==null || +x.size===size); }); }
  function upload(pathStr, filename, mime, b64, size){
    var url=driveUrl(); if(!url||!member()) return Promise.reject(new Error('드라이브 미연결'));
    var path=pathStr;
    return fetch(url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},
      body:JSON.stringify({action:'dvUpload',member:member(),path:path,filename:filename,mime:mime,data:b64})})
      .then(function(){ return new Promise(function(r){ setTimeout(r,1200); }); })
      .then(function(){ return proxy({action:'dvList',member:member(),path:path}); })
      .then(function(r){ if(listHas(r,filename,size)) return r;
        return new Promise(function(r2){ setTimeout(r2,2500); }).then(function(){ return proxy({action:'dvList',member:member(),path:path}); })  // 반영 지연 — 한 번 더 확인
          .then(function(r3){ if(!listHas(r3,filename,size)) throw new Error('업로드 확인 실패'); return r3; }); });
  }
  function setDrvMsg(m){ try{ var el=document.getElementById('drvMsg'); if(el) el.textContent=m; }catch(e){} }
  function backupNow(){
    clearTimeout(DRV_T); DRV_T=null;
    if(DRV_BUSY||!DRV_PEND.size) return Promise.resolve();
    if(!driveUrl()){ DRV_PEND.clear(); setDrvMsg(''); return Promise.resolve(); }
    var id=DRV_PEND.keys().next().value, c=DRV_PEND.get(id); DRV_PEND.delete(id);
    DRV_BUSY=true; setDrvMsg('드라이브 저장 중…');
    var enc=utf8B64(JSON.stringify(c)), fn='보장분석데이터_'+safeName(c.name||'고객')+'.json';
    return upload('보장분석/'+custFolder(c), fn, 'application/json', enc.b64, enc.size).then(function(){
      setDrvMsg('드라이브 저장됨 '+new Date().toTimeString().slice(0,5));
    }).catch(function(e){ console.warn('보장분석 드라이브 백업 실패:',e); setDrvMsg('드라이브 저장 실패'); })
      .then(function(){ DRV_BUSY=false; if(DRV_PEND.size) return backupNow(); });
  }
  var CUST_KEYS=['id','ownerSabun','ownerName','name','birth','gender','phone','memo','before','proposals','history','mats','createdAt','updatedAt'];
  var driveApi={
    enabled:function(){ return !!(driveUrl()&&member()); },
    // Firestore 저장이 끝난 고객 — 20초 뒤 드라이브에 백업(그 사이 또 바뀌면 마지막 것만)
    changed:function(c){ if(!c||!c.id||!driveUrl()) return; DRV_PEND.set(c.id,JSON.parse(JSON.stringify(c))); clearTimeout(DRV_T); DRV_T=setTimeout(backupNow,DRV_DEBOUNCE); setDrvMsg('드라이브 저장 대기'); },
    cancel:function(id){ DRV_PEND.delete(id); if(!DRV_PEND.size){ clearTimeout(DRV_T); DRV_T=null; } }, // 삭제한 고객의 대기분 — 올라가면 되살아남
    flush:function(){ return backupNow(); },
    // 출력한 보장분석표 PDF도 같은 폴더에
    pdf:function(c, blob, filename){
      if(!driveUrl()) return Promise.resolve(false);
      return b64Of(blob).then(function(b64){ return upload('보장분석/'+custFolder(c), safeName(filename), 'application/pdf', b64, blob.size); })
        .then(function(){ return true; }).catch(function(e){ console.warn('보장분석 PDF 드라이브 저장 실패:',e); return false; });
    },
    folders:function(){ return proxy({action:'dvList',member:member(),path:'보장분석'}).then(function(r){ return (r.folders||[]).map(function(f){ return String(f.name||''); }).filter(Boolean); }); },
    files:function(folder){ return proxy({action:'dvList',member:member(),path:'보장분석/'+folder}).then(function(r){ return r.files||[]; }); },
    // 백업 JSON을 읽어 고객 객체로 — 드라이브 파일은 누구나 바꿔 둘 수 있으므로 모양을 검사하고 아는 칸만 남긴다.
    //   소유 확인: 저장소에 같은 id 문서가 있고 남의 것이면(관리자 아님) 거부 — 팀원이 남의 고객을 덮어쓰거나 되가져가는 경로 차단.
    load:function(folder, name){
      return proxy({action:'dvFile',member:member(),path:'보장분석/'+folder,name:name}).then(function(r){
        var c=JSON.parse(b64Utf8(String(r.data||'')));
        if(!c||typeof c!=='object'||typeof c.id!=='string'||!/^[\w\-]{1,80}$/.test(c.id)||typeof c.name!=='string'||!c.name.trim()) throw new Error('보장분석 백업 파일이 아닙니다');
        var o={}; CUST_KEYS.forEach(function(k){ if(c[k]!==undefined) o[k]=c[k]; });
        ['name','birth','gender','phone','memo','ownerName','ownerSabun'].forEach(function(k){ if(o[k]!=null&&typeof o[k]!=='string') o[k]=String(o[k]); if(typeof o[k]==='string'&&o[k].length>2000) o[k]=o[k].slice(0,2000); });
        o.before=Array.isArray(o.before)?o.before:[]; o.proposals=Array.isArray(o.proposals)?o.proposals:[]; o.history=Array.isArray(o.history)?o.history:[];
        o.updatedAt=+o.updatedAt||0; o.createdAt=+o.createdAt||o.updatedAt||Date.now();
        if(ME.role!=='admin'||!o.ownerSabun){ o.ownerSabun=ME.sabun; o.ownerName=ME.name; }
        return FDB.doc('bojang_customers/'+o.id).get().then(function(sn){
          var ex=sn.exists?dec(sn.data()):null;
          if(ex&&ME.role!=='admin'&&String(ex.ownerSabun||'')!==String(ME.sabun)){ var e=new Error('다른 담당자의 고객이라 불러올 수 없습니다'); e.code='owner'; throw e; }
          return { cust:o, existing:ex };
        });
      });
    },
    openDrive:function(c){ // 인트라넷 [내 자료함]을 그 고객 폴더로 열기
      try{ var st=P._dvState||(P._dvState={}); st.member=member(); st.path=['보장분석',custFolder(c)]; st.busy=false; P.showPage('drive'); }catch(e){}
    }
  };
  window._bjDrive=driveApi;
  window.addEventListener('pagehide',function(){ try{ driveApi.flush(); }catch(e){} });
  var API={ db:dbApi, sample:sampleApi, downloads:dlApi, user:null };
  window.claude={ use:function(n){ return Promise.resolve(API[n]||null); } };
})();
