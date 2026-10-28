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
  function errCode(e){ // 프로그램은 e.code를 그대로 보여 줌 — Firestore 'permission-denied' 등
    if(e && !e.code) e.code='error';
    return e;
  }
  function docApi(path){
    var ref=FDB.doc(path);
    return {
      id:ref.id,
      get:function(){ return ref.get().then(wrapDoc).catch(function(e){ throw errCode(e); }); },
      set:function(d,opt){ return ref.set(enc(path,d), opt&&opt.merge?{merge:true}:undefined).catch(function(e){ throw errCode(e); }); },
      // 프로그램의 update는 '그 필드만 합치기' 의도(예: 담보명 학습 사전 map에 한 항목 추가) — Firestore update는 map을 통째 바꾸므로 merge set으로.
      update:function(d){
        if(isCust(path)) return Promise.reject(errCode({code:'unsupported',message:'update on customer doc'}));
        return ref.set(d,{merge:true}).catch(function(e){ throw errCode(e); });
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
  var API={ db:dbApi, sample:sampleApi, downloads:dlApi, user:null };
  window.claude={ use:function(n){ return Promise.resolve(API[n]||null); } };
})();
