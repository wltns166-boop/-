/* 담보명 사전: 보험사 담보명 → 보장분석표 87항목. 위에서부터 먼저 맞는 규칙 적용.
   반환: {k:[keys], agg:'sum'|'max'} / {k:null}=항목 없음(분류 보류) / undefined=사전에 없음(AI 판단 사용) */
(function(){
const R=[];const r=(re,k,agg)=>R.push({re,k:k==null?null:[].concat(k),agg:agg||'sum'});
const N=s=>String(s||'').replace(/\s+/g,'').replace(/[·ㆍ]/g,'').replace(/～|~/g,'-').replace(/Ⅰ/g,'1').replace(/Ⅱ/g,'2').replace(/Ⅲ/g,'3').replace(/Ⅳ/g,'4').replace(/Ⅴ/g,'5').replace(/[\[\]]/g,m=>m==='['?'(':')').replace(/^(┗|\(무\)|무배당|\(감액및면책없음\)|\(\d+년갱신\)|갱신형|계약|선택|기본)+/g,'').replace(/\([^()]*제외[^()]*\)/g,'');
/* 0) 추가 항목(병원급 수술·인실·기타 진단/수술/치료) */
r(/생활(비|자금|급여)|매월|연금|납입지원|납입면제/,null);
r(/상급종합병원.*질병수술/,'surg_dis_top');r(/종합병원.*질병수술/,'surg_dis_gen');
r(/상급종합병원.*(상해|재해)수술/,'surg_inj_top');r(/종합병원.*(상해|재해)수술/,'surg_inj_gen');
r(/상급종합.*(2-?3인실|다인실)|(2-?3인실|다인실).*상급종합/,'room23_top');r(/(2-?3인실|다인실)/,'room23_gen');
r(/수술입원일당/,'hosp_surg');r(/간호간병통합/,'nursing');
r(/간병인.*\(요양병원\)|요양병원.*간병인/,'care_nh');
r(/^(?!.*질병).*80%이상.*후유장해/,'dis_inj80');
r(/벌금.*대물|대물.*벌금/,'drv_fine_obj','max');
r(/응급실.*비응급|비응급/,'er_non');r(/응급실/,'er_emg');
r(/양성뇌종양/,'benign_brain');r(/I49/,'heart_arr');r(/심근병증|판막|심혈관특정|심혈관질환\(특정|심장질환\(특정|\d대심장질환/,'heart_spec');
r(/경증치매/,'dementia_mild');r(/중증치매/,'dementia_sev');r(/당뇨.*진단/,'diabetes');r(/갑상선기능|갑상선항진|갑상선저하/,'thyroid_fn');
r(/대상포진/,'zoster');r(/통풍/,'gout');r(/말기신부전/,'kidney');r(/간경화|간경변/,'liver');r(/결핵/,'tb');
r(/장기이식/,'transplant');r(/조혈모/,'stem');r(/각막이식/,'cornea');r(/인공관절|관절증/,'joint');r(/추간판/,'disc');r(/충수/,'appendix');r(/유방절제/,'mastect');
r(/중대한특정상해수술/,'severe_inj_surg');r(/흉터/,'scar');r(/철심제거/,'pin_remove');
r(/(유사암|소액암|기타피부암및갑상선암|갑상선암|기타피부암|제자리암|경계성종양).*수술/,'cancer_small_surg');
r(/요양병원.*암|암.*요양병원/,'nh_cancer');r(/암.*통원/,'cancer_outp');r(/암.*입원(일당|자금|비)|암직접치료입원/,'cancer_inp');
r(/호르몬/,'hormone');r(/CT|MRI/,'ctmri');r(/독감|인플루엔자/,'flu');
r(/입원수술|당일입원제외/,'surg_adm');r(/통원수술/,'surg_out');
/* 1) 보장분석표에 없는 담보 / 이중계산 위험 → 분류 보류 */
r(/생활(비|자금|급여)|매월|연금|납입지원|납입면제/,null);
r(/80%이상|50%이상|20-100%|20%이상/,null);
r(/\(요양병원\)|181일이상|간호간병통합/,null);
r(/대물|보복운전|성형치료|자동차사고치아|면허|의료사고|중과실중상해피해/,null);
r(/뇌내장|내장손상|장기이식|조혈모|각막이식|흉터|창상봉합|철심제거|탈구|인대|연골|아킬레스|추간판|관절|척추/,null);
r(/호르몬|정위적방사선|특정상해성|치매|민사소송/,null);
r(/고액항암/,'chemo_target');
r(/치아보철/,'tooth_implant');
r(/치아보존/,'tooth_crown');
r(/(주요|통합)치료.*(기타피부암|갑상선암|유사암)/,null);
r(/(기타피부암및갑상선암|유사암|소액암|갑상선암|기타피부암|제자리암|경계성종양).*(수술|치료|방사선|약물|입원|통원)/,null);
r(/암.*(입원|통원)(일당|자금|비)|요양병원암|암직접치료/,null);
r(/(다빈치|로봇).*갑상선암/,null);
r(/수술입원일당|입원수술|통원수술|당일입원/,null);
r(/응급실|CT|MRI|검사지원|양성신생물/,null);
/* 2) 실손 → 별도 처리 */
r(/^(?!.*(처리지원|벌금|변호사|배상)).*(실손의료비|질병입원형|상해입원형|질병통원형|상해통원형|전환실손|3대비급여)/,'__silson');
r(/^(질병|상해)(입원|통원)$/,'__silson');
/* 3) 운전자 */
r(/^(?!.*화재).*벌금/,'drv_fine','max');
r(/처리지원금|처리지원/,'drv_support','max');
r(/변호사/,'drv_lawyer','max');
r(/자동차(사고)?부상|자동차사고부상치료/,'drv_injury','max');
/* 4) 배상·화재·치아 */
r(/화재.*벌금/,'fire_fine');
r(/가족.*배상|배상.*가족/,'liab_fam','max');
r(/일상생활.*배상|배상책임/,'liab','max');
r(/크라운/,'tooth_crown'); r(/임플란트/,'tooth_implant');
/* 5) 골절·화상 */
r(/5대골절.*수술/,'frac5_surg'); r(/5대골절/,'frac5');
r(/골절.*수술/,'frac_surg'); r(/깁스|부목/,'cast'); r(/골절.*진단|골절진단|성장판손상골절/,'frac');
r(/중증화상|중대한화상|화상및부식진단/,null);
r(/화상.*수술/,'burn_surg'); r(/화상.*진단/,'burn');
/* 6) 통합·주요치료비 */
r(/비급여.*암.*(통합|주요)치료|암.*(통합|주요)치료.*비급여/,'tx_cancer_nb');
r(/암.*(통합|주요)치료/,'tx_cancer');
r(/(순환계|심뇌혈관|2대질병|2대질환|심혈관|뇌심장).*(통합|주요)치료/,'tx_circ');
r(/혈전(용해|제거|치료)/,'tx_thromb','max');
/* 7) 항암 */
r(/표적항암방사선|세기조절/,'chemo_rad');
r(/CAR-T|카티/,'chemo_immune');
r(/표적항암/,'chemo_target');
r(/면역항암/,'chemo_immune');
r(/양성자/,'rad_proton');
r(/중입자/,'rad_heavy');
r(/항암(방사선약물|약물방사선)/,['chemo_drug','chemo_rad'],'max');
r(/항암약물/,'chemo_drug');
r(/항암방사선|세기조절방사선/,'chemo_rad');
/* 8) 종수술 (질병/상해 n종) */
r(/^(질병|상해|재해)종수술/,'__jongsum');
r(/[1-7]종/,'__jong');
/* 9) 수술 */
r(/(다빈치|로봇).*(암|특정)/,'surg_robot');
r(/암.*수술/,'surg_cancer');
r(/(심뇌혈관|심뇌|심장뇌).*수술/,['surg_brain','surg_heart']);
r(/뇌(혈관)?.*수술|모야모야/,'surg_brain');
r(/(허혈성?심(장)?질?환?|심장|관상동맥|심혈관).*(수술|성형)/,'surg_heart');
r(/\d+대.*수술|다발성질병수술/,'surg_n');
r(/^(상급종합병원)?질병수술(비)?(\(|특약|$|\d)/,'surg_dis');
r(/^(상급종합병원)?(일반)?(상해|재해)수술(비)?(\(|특약|$|\d)/,'surg_inj');
/* 10) 후유장해·사망 */
r(/암.*후유장해/,'dis_cancer');
r(/질병.*후유장해/,'dis_dis');
r(/상해사망.*후유장해/,'death_inj');
r(/상해.*후유장해|후유장해\(3/,'dis_inj');
r(/질병사망/,'death_dis');
r(/(상해|재해|교통상해)사망/,'death_inj');
r(/^(일반)?사망|종신|주계약.*사망/,'death_gen');
/* 11) 입원·간병 */
r(/(상해|재해).*중환자실/,'icu_inj'); r(/질병.*중환자실/,'icu_dis');
r(/(1인실|상급병실).*상급종합|상급종합.*(1인실|상급병실)/,'room_top');
r(/(1인실|상급병실)/,'room_gen');
r(/간병인지원|간병지원|간병인파견/,'__care_sup');
r(/간병인사용|간병인입원/,'__care_use');
r(/재가/,'home_care');
r(/(상해|재해).*입원(일당|비)/,'hosp_inj'); r(/질병.*입원(일당|비)/,'hosp_dis');
/* 12) 진단 */
r(/뇌.*산정특례|중증질환자.*뇌/,'brain_severe');
r(/심장.*산정특례|중증질환자.*심장/,'heart_severe');
r(/뇌혈관질환/,'brain_vasc'); r(/뇌졸중/,'brain_stroke'); r(/뇌출혈/,'brain_hem');
r(/허혈성?심(장)?질환/,'heart_isch'); r(/급성심근경색/,'heart_ami'); r(/부정맥|I49/,'heart_arr');
r(/(암|경계성종양).*(진단|급여금|자금|보장)|^암(보험)?$/,'__cancer');
function lookup(name){
  const n=N(name);if(!n)return undefined;
  for(const x of R){if(!x.re.test(n))continue;
    if(x.k===null)return{k:null};
    const k0=x.k[0];
    if(k0==='__silson')return{silson:true};
    if(k0==='__jongsum')return{jongAll:true,side:/상해|재해/.test(n)?'is':'ds',n:0};
    if(k0==='__jong'){const m=n.replace(/1-[57]종/g,'').match(/([1-7])종/);if(!/수술/.test(n))continue;const inj=/상해|재해/.test(n),dis=/질병/.test(n);if(!m){if(!inj&&!dis)return{k:null};return{jongAll:true,side:inj?'is':'ds',n:/1-7종/.test(n)?7:/1-5종/.test(n)?5:0}}if(!inj&&!dis)continue;return{k:[(inj?'is':'ds')+m[1]],agg:'sum'}}
    if(k0==='__cancer'){if(/통합(전이)?암|기관별|\d+대(특정|주요)?암|특정소화기암|특정소액암|다발성소아암|특정암|유방암/.test(n))return{k:['cancer_int'],agg:'sum'};if(/고액/.test(n))return{k:['cancer_high'],agg:'sum'};if(/유사암|소액암|갑상선암|피부암|제자리암|경계성종양|점막내암/.test(n))return{k:['cancer_small'],agg:'sum'};return{k:['cancer_gen'],agg:'sum'}}
    if(k0==='__care_sup'||k0==='__care_use'){const inj=/상해|재해/.test(n)&&!/질병/.test(n);return{k:[(inj?'care_inj':'care_dis')+(k0==='__care_sup'?'_sup':'_use')],agg:'sum'}}
    return{k:x.k,agg:x.agg};
  }
  return undefined;
}
(typeof window!=='undefined'?window:globalThis).COVDICT={lookup,norm:N,size:R.length};
})();
