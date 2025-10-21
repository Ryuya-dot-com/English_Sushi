/* Sushi-typing vocabulary trainer (light, single-plate, LTR) */
(function(){
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));

  // DOM
  const elLane = $('#lane');
  const elInput = $('#typingInput');
  const elScore = $('#score');
  const elMiss = $('#miss');
  const elStreak = $('#streak');
  // WPM UI removed
  const elTime = $('#time');
  const elLives = $('#lives');
  const elTyped = $('#typed');
  const elRemain = $('#remain');
  const elPromptText = $('#promptText');

  const elBtnStart = $('#btnStart');
  const elBtnPause = $('#btnPause');
  const elBtnReset = $('#btnReset');
  const elBtnClose = $('#btnClose');
  const elBtnReview = $('#btnReview');
  const elBtnReplay = $('#btnReplay');
  const elBtnOpenMenu = $('#btnOpenMenu');
  const elBtnOpenMenuFromModal = $('#btnOpenMenuFromModal');
  const elModal = $('#modal');

  const elDifficulty = $('#difficulty');
  const elPromptMode = $('#promptMode');
  const elCourse = $('#course');
  const elMode = $('#mode');
  const elUnitType = $('#unitType');
  const elPackSize = $('#packSize');
  const elWordSet = $('#wordSet');
  const elRoundTime = $('#roundTime');
  const elCustomSeconds = $('#customSeconds');
  const elOptHints = $('#optHints');
  const elOptVoice = $('#optVoice');
  const elImportFile = $('#importFile');

  const elSumScore = $('#sumScore');
  const elSumAcc = $('#sumAcc');
  // WPM summary UI removed
  const elSumMiss = $('#sumMiss');
  const elReview = $('#review');
  const elPlayed = $('#played');

  // Menu
  const elMenu = $('#menu');
  const elMenuMode = $('#menuMode');
  const elMenuCourse = $('#menuCourse');
  const elMenuWordSet = $('#menuWordSet');
  const elMenuPrompt = $('#menuPrompt');
  const elBtnStartMenu = $('#btnStartMenu');
  const elMenuSeconds = $('#menuSeconds');
  const elMenuDifficulty = $('#menuDifficulty');
  const elMenuVoice = $('#menuVoice');
  const elMenuUnit = $('#menuUnit');
  const elMenuPack = $('#menuPack');

  const cfgDefaults = {
    difficulty: 'normal',
    roundTimeSec: 90,
    promptMode: 'jp2en',
    showHints: true,
    voice: false,
    lives: 3,
    wordSet: 'toeic',
    course: '5000',
    mode: 'learn'
  };

  const courseMap = {
    '3000': { seconds: 60, label: '\u00333000\u5186\u30b3\u30fc\u30b9' },
    '5000': { seconds: 90, label: '\u00355000\u5186\u30b3\u30fc\u30b9' },
    '10000': { seconds: 120, label: '\u003110000\u5186\u30b3\u30fc\u30b9' },
    'custom': { seconds: null, label: '\u81ea\u7531\u8a2d\u5b9a' }
  };

  const diffParams = {
    easy:   { speed: 80,  singleGap: 1200 },
    normal: { speed: 110, singleGap: 1100 },
    hard:   { speed: 150, singleGap: 1000 },
    insane: { speed: 190, singleGap: 900 }
  };

  let customVocab = null;
  const datasets = { toeic: null, highschool: null };
  const textsets = { phrases: null, sentences: null };
  let state = {};

  function resetState(wordsList){
    const difficulty = elDifficulty?.value || cfgDefaults.difficulty;
    const mode = elMode?.value || cfgDefaults.mode;
    const course = elCourse?.value || cfgDefaults.course;
    let roundTimeSec = getConfiguredSeconds();
    const promptMode = elPromptMode?.value || cfgDefaults.promptMode;
    const showHints = !!elOptHints?.checked;
    const voice = !!elOptVoice?.checked;
    const wordSet = elWordSet?.value || cfgDefaults.wordSet;
    const unitType = elUnitType?.value || 'word';

    state = {
      running:false,
      paused:false,
      phase:'prep',
      prepLeft:3,
      countdownActive:false,
      startTs:0,
      lastFrameTs:0,
      lastSpawnTs:0,
      elapsed:0,
      timeLeft:roundTimeSec,
      score:0,
      miss:0,
      streak:0,
      lives: mode==='test' ? cfgDefaults.lives : Infinity,
      targetId:null,
      typedChars:0,
      correctChars:0,
      charTimeline:[],
      plates:[],
      nextId:1,
      bag: shuffleArray((wordsList || datasetListCurrent()).slice()),
      packTarget: parseInt((elPackSize?.value||'0'),10) || 0,
      packCleared: 0,
      review:new Map(),
      played:[],
      mastery:new Map(),
      cfg:{ difficulty, roundTimeSec, promptMode, showHints, voice, wordSet, course, mode, unitType },
      params: tuneParamsForMode(diffParams[difficulty]||diffParams.normal, mode),
      
    };

    elLane.innerHTML='';
    setHUD();
    setFocus(null);
    setPrompt('スペースキーで開始');
  }

  function tuneParamsForMode(base, mode){
    const p = { ...base };
    if(mode==='learn'){
      p.speed = Math.max(40, Math.round(p.speed*0.8));
      p.singleGap = Math.round(p.singleGap*1.2);
    }
    return p;
  }

  function setHUD(){
    elScore.textContent = String((state.played||[]).length);
    elMiss.textContent = state.miss;
    elStreak.textContent = state.streak;
    elLives.textContent = Number.isFinite(state.lives) ? String(state.lives) : '\u221E';
    elTime.textContent = String(Math.max(0, Math.ceil(state.timeLeft)));
    // WPM display removed
  }

  function setFocus(plate){
    if(!plate){ elTyped.textContent=''; elRemain.textContent=''; return; }
    const typed = plate.word.slice(0, plate.typedIndex);
    elTyped.textContent = typed;
    const remain = plate.word.slice(plate.typedIndex);
    if ((state.cfg?.promptMode) === 'en2en') {
      const total = plate.word || '';
      const revealLead = (plate.errors>=3) ? 1 : 0;
      const revealTail = (plate.errors>=6) ? 1 : 0;
      elRemain.textContent = maskForEn2EnAdvanced(total, plate.typedIndex, revealLead, revealTail);
    } else {
      elRemain.textContent = remain;
    }
  }

  function setPrompt(text){
    if (state && state.packTarget > 0) {
      const cur = Math.min(state.packCleared || 0, state.packTarget);
      elPromptText.textContent = `${text} (${cur}/${state.packTarget})`;
    } else {
      elPromptText.textContent = text;
    }
  }

  function spawnPlate(){
    const laneRect = elLane.getBoundingClientRect();
    const id = state.nextId++;
    const vocab = nextWord();
    if(!vocab) return;

    const el = document.createElement('div');
    el.className='plate';
    el.dataset.id = String(id);

    const isLearn = state.cfg.mode==='learn';
    const isJpPrompt = state.cfg.promptMode==='jp2en';
    let promptText = isJpPrompt ? (vocab.ja||'') : (vocab.def||vocab.ja||'');
    if(isLearn && isJpPrompt){
      el.innerHTML = `<div class="pair"><div class="en">${escapeHtml(vocab.en||'')}</div><div class="ja">${escapeHtml(vocab.ja||'')}</div></div>`;
      promptText = String(vocab.ja||'');
    } else {
      el.textContent = promptText;
      if(state.cfg.showHints){
        const pos = document.createElement('span');
        pos.className='pos';
        if ((state.cfg?.promptMode) === 'en2en') {
          const letters = countLetters(vocab.en||'');
          const words = countWords(vocab.en||'');
          const posText = vocab.pos ? `${vocab.pos}, ` : '';
          pos.textContent = `(${posText}${words>1? `${words} words, `: ''}${letters} letters)`;
        } else {
          pos.textContent = vocab.pos ? `(${vocab.pos})` : '';
        }
        el.appendChild(pos);
      }
    }
    // For sentence unit, expand plate for long text
    try {
      if ((state.cfg?.unitType) === 'sentence') {
        el.classList.add('long');
      }
    } catch {}
    elLane.appendChild(el);

    const width = el.getBoundingClientRect().width;
    const x0 = laneRect.width + 10; // right -> left
    const plate = {
      id, el, x: x0, y:0, width,
      word: (vocab.en||'').toLowerCase(),
      enRaw: (vocab.en||''),
      ja: (vocab.ja||''),
      prompt: promptText, pos: vocab.pos, def: vocab.def,
      typedIndex:0, errors:0, removed:false
    };
    state.plates.push(plate);
    applyPlateTransform(plate);

    if(state.cfg.voice) speak(((state.cfg?.promptMode)==='en2en' ? (vocab.def||vocab.en||'') : (vocab.en||'')));
  }

  function applyPlateTransform(plate){ plate.el.style.transform = `translateX(${plate.x}px) translateY(-50%)`; }

  function nextWord(){
    if(state.bag.length===0) state.bag = shuffleArray(datasetListCurrent().slice());
    return state.bag.pop();
  }

  function removePlate(plate, asMiss){
    if(plate.removed) return; plate.removed=true;
    plate.el.classList.add(asMiss?'miss':'hit');
    setTimeout(()=>plate.el.remove(), 260);
    state.plates = state.plates.filter(p=>p!==plate);
    if(state.targetId===plate.id){ state.targetId=null; setFocus(null); setPrompt('\u6b21\u3092\u9078\u3093\u3067\u30bf\u30a4\u30d7!'); }
  }

  function gameLoop(ts){
    if(!state.running) return;
    if(!state.lastFrameTs) state.lastFrameTs = ts;
    const dt = (ts - state.lastFrameTs)/1000; state.lastFrameTs = ts;

    // prep
    if(state.phase==='prep'){
      if(state.countdownActive){
        state.prepLeft -= dt;
        if(state.prepLeft > 0){
          setPrompt(`${state.cfg.mode==='test'?'テスト':'学習'}: ${Math.ceil(state.cfg.roundTimeSec)}秒 ${Math.ceil(state.prepLeft)}...`);
          requestAnimationFrame(gameLoop);
          return;
        }
        // countdown finished
        state.phase='play';
        state.elapsed=0; state.startTs=ts; state.lastSpawnTs=ts;
        setPrompt('スタート！');
      } else {
        setPrompt('スペースキーで開始');
        requestAnimationFrame(gameLoop);
        return;
      }
    }

    // time
    state.elapsed += dt; state.timeLeft = Math.max(0, state.cfg.roundTimeSec - state.elapsed);
    if(state.timeLeft<=0) return endRound();

    // spawn single
    if(!state.lastSpawnTs) state.lastSpawnTs = ts;
    if(state.plates.length===0 && (ts - state.lastSpawnTs) > (state.params.singleGap||1100)){
      spawnPlate(); state.lastSpawnTs = ts;
    }

    // move
    const speed = state.params.speed;
    for(const p of state.plates){
      p.x -= speed*dt; applyPlateTransform(p);
      if(p.x < -p.width - 12){
        removePlate(p, true); state.miss++; state.streak=0; if(state.cfg.mode==='test') state.lives--;
        addReview(p.word, p.prompt); if(state.cfg.mode==='test' && state.lives<=0) return endRound();
      }
    }

    

    setHUD(); requestAnimationFrame(gameLoop);
  }

  async function startRound(reviewOnly){
    if(state.running) return;
    const words = reviewOnly ? reviewAsList() : await getDatasetList(elWordSet.value);
    if(elMenu){ elMenu.classList.add('fade-out'); setTimeout(()=> elMenu.style.display='none', 380); }
    // Pick dataset based on unit type
    const unit = elUnitType?.value || 'word';
    const items = reviewOnly ? words : await getDatasetByUnit(unit);
    resetState(items); document.body.classList.add('playing'); state.running = true; state.paused=false; state.startTs = performance.now(); state.lastFrameTs=0;
    elInput.value=''; elInput.focus(); requestAnimationFrame(gameLoop);
  }

  function pauseRound(){ if(!state.running) return; state.running=false; }
  function resumeRound(){ if(state.running) return; state.running=true; state.lastFrameTs=0; requestAnimationFrame(gameLoop); }

  function endRound(){
    state.running=false;
    const acc = state.typedChars ? (state.correctChars/state.typedChars)*100 : 0;
    elSumScore.textContent = String((state.played||[]).length);
    elSumAcc.textContent = `${acc.toFixed(0)}%`;
    // WPM summary removed
    elSumMiss.textContent = String(state.miss);

    elReview.innerHTML='';
    for(const [word, info] of state.review.entries()){
      const pill = document.createElement('span'); pill.className='pill';
      pill.innerHTML = `<strong>${word}</strong> <span class="jp">${escapeHtml(info.j)}</span>`; elReview.appendChild(pill);
    }

    // fill played list
    if (elPlayed) {
      elPlayed.innerHTML = '';
      for (const it of (state.played || [])) {
        const pill = document.createElement('span'); pill.className='pill';
        pill.innerHTML = `<strong>${escapeHtml(it.en)}</strong> <span class=\"jp\">${escapeHtml(it.ja)}</span>`;
        elPlayed.appendChild(pill);
      }
    }

    document.body.classList.remove('playing'); elModal.style.display='flex';
  }

  function addReview(word, jp){ const cur = state.review.get(word)||{ j:jp, c:0 }; cur.c++; state.review.set(word, cur); }

  function reviewAsList(){
    const acc=[]; for(const [word, info] of state.review.entries()){
      const base = findInDatasets(word) || vocabDefault.find(v=>(v.en||'').toLowerCase()===word);
      acc.push(base || { en: word, ja: info.j, pos:'', def:'' });
    }
    return acc.length?acc:vocabDefault.slice();
  }

  function findInDatasets(wordLower){
    const t=(wordLower||'').toLowerCase(); const pools=[datasets.toeic,datasets.highschool,vocabToeic,vocabHighschool,vocabDefault].filter(Boolean);
    for(const pool of pools){ const hit=pool.find(v=>(v.en||'').toLowerCase()===t); if(hit) return hit; }
    return null;
  }

  // cash conversion removed

  function onKeyDown(ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = ev.key;
    if (!k || k.length !== 1) return;
    const ch = k.toLowerCase();
    // Special controls during play
    if (state.running && state.phase!=='prep') {
      if (k === 'Tab') {
        ev.preventDefault();
        const target = state.plates.find(p => p.id === state.targetId) || state.plates.sort((a,b)=>a.x-b.x)[0];
        if (target) { revealOne(target); setFocus(target); }
        return;
      }
      if (k === 'Escape') {
        ev.preventDefault();
        const target = state.plates.find(p => p.id === state.targetId) || state.plates.sort((a,b)=>a.x-b.x)[0];
        if (target) {
          removePlate(target, true); state.miss++; state.streak=0;
          if (state.cfg.mode==='test') state.lives--; addReview(target.word, target.prompt);
          if (state.cfg.mode==='test' && state.lives<=0) return endRound();
        }
        return;
      }
    }
    // Space to start countdown when waiting
    if (state.running && state.phase==='prep') {
      if (k === ' ' || ch === ' ' || ev.code === 'Space') {
        ev.preventDefault();
        state.countdownActive = true;
        state.prepLeft = 3;
      }
      return; // ignore other keys during prep
    }
    // Allow letters, space, and basic punctuation for phrases/sentences
    if (!/^[a-z0-9 \-',.!?:;]$/.test(ch)) return;
    // Skippable inputs (space/punct) do not affect progress
    if (/[ \-',.!?:;]/.test(ch)) return;
    ev.preventDefault();
    if (!state.running) return;

    state.typedChars++;
    state.charTimeline.push(performance.now());
    let target = state.plates.find(p => p.id === state.targetId);
    if (!target) {
      const cands = state.plates
        .filter(p => expectedCharAt((p.word||''), p.typedIndex) === ch)
        .sort((a, b) => a.x - b.x);
      if (cands.length) {
        target = cands[0];
        state.targetId = target.id;
        setPrompt(target.prompt);
        highlightTarget(target, true);
      } else { state.miss++; state.streak = 0; setHUD(); return; }
    }
    // auto-skip skippable characters in target
    skipSkippable(target);
    const expected = target.word[target.typedIndex];
    if (ch === expected) {
      state.correctChars++;
      target.typedIndex++;
      setFocus(target);
      // skip any subsequent skippable
      skipSkippable(target);
      if (target.typedIndex >= target.word.length) {
        state.streak++;
        const bonus = Math.min(10 + state.streak * 2, 60);
        state.score += 20 + bonus;
        // record played word
        try { state.played.push({ en: target.enRaw || target.word, ja: target.ja || '' }); } catch {}
        if (target.errors === 0) { const cur = state.mastery.get(target.word) || 0; state.mastery.set(target.word, cur + 1); }
        removePlate(target, false); state.targetId = null; setFocus(null); setPrompt('ナイス!');
      } else { highlightTarget(target, true); }
    } else {
      // strict: do not jump over letters on mismatch (only skippables are auto-skipped)
      target.errors++; state.miss++; state.streak = 0; flash(target.el);
    }
    setHUD();
  }

  function highlightTarget(plate,on){ $$('.plate').forEach(p=>p.classList.remove('target')); if(on) plate.el.classList.add('target'); }
  function flash(el){ el.style.filter='brightness(0.95)'; setTimeout(()=>el.style.filter='', 120); }

  function calcWPM(){ const now=performance.now(); const windowMs=45000; state.charTimeline=state.charTimeline.filter(t=>now-t<=windowMs); const chars=state.charTimeline.length; const mins=Math.max(windowMs/60000,0.01); return (chars/5)/mins; }

  function speak(text){ try{ if(!('speechSynthesis' in window)) return; const u=new SpeechSynthesisUtterance(text); u.lang='en-US'; u.rate=0.95; window.speechSynthesis.speak(u);}catch{} }

  function shuffleArray(arr){ for(let i=arr.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }
  function escapeHtml(s){ return String(s).replace(/[&<>\"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c])); }

  // Skipping helpers for spaces/punctuation
  function isSkippableChar(ch){ return /[ \-',.!?:;]/.test(ch||''); }
  function skipSkippable(plate){
    while(plate.typedIndex < plate.word.length && isSkippableChar(plate.word[plate.typedIndex])){
      plate.typedIndex++;
    }
  }
  function expectedCharAt(word, idx){
    let i = idx|0;
    while(i < (word||'').length && isSkippableChar(word[i])) i++;
    return (word||'')[i] || '';
  }
  function countLetters(text){
    let n=0; for(const c of (text||'')){ if(!isSkippableChar(c)) n++; } return n;
  }
  function countWords(text){
    if(!text) return 0; return text.split(/\s+/).filter(Boolean).length;
  }
  function maskForEn2En(rem){ let out=''; for(const c of (rem||'')){ out += isSkippableChar(c) ? c : '_'; } return out; }
  function maskForEn2EnAdvanced(total, typedIndex, revealLead, revealTail){
    // Build masked string from current typedIndex to end, revealing optional lead/tail chars
    const rest = (total||'').slice(typedIndex);
    const len = rest.length;
    let out='';
    for(let i=0;i<len;i++){
      const globalIdx = typedIndex + i;
      const ch = total[globalIdx];
      if (isSkippableChar(ch)) { out += ch; continue; }
      if (revealLead>0 && globalIdx === 0) { out += ch; continue; }
      if (revealTail>0 && globalIdx === (total.length-1)) { out += ch; continue; }
      out += '_';
    }
    return out;
  }

  function revealOne(plate){
    // reveal next non-skippable char (advance typedIndex by 1 logical char)
    skipSkippable(plate);
    let advanced = false;
    while (plate.typedIndex < plate.word.length) {
      const c = plate.word[plate.typedIndex];
      plate.typedIndex++;
      if (!isSkippableChar(c)) { advanced = true; break; }
    }
    if (advanced) {
      plate.errors++; state.miss++; state.streak=0;
      state.score = Math.max(0, state.score - 5);
      if (plate.typedIndex >= plate.word.length) {
        try { state.played.push({ en: plate.enRaw || plate.word, ja: plate.ja || '' }); } catch {}
        removePlate(plate, false);
        state.targetId = null; setFocus(null); setPrompt('ヒント使用');
        if (state.packTarget>0) {
          state.packCleared++;
          if (state.packCleared >= state.packTarget) endRound();
        }
      }
    }
  }

  // Fallback small vocab
  const vocabDefault = [
    { en:'ability', ja:'\u80fd\u529b', pos:'n.', def:'skill or power to do something' },
    { en:'accept', ja:'\u53d7\u3051\u5165\u308c\u308b', pos:'v.', def:'agree to receive or do' },
    { en:'achieve', ja:'\u9054\u6210\u3059\u308b', pos:'v.', def:'successfully bring about' },
    { en:'allow', ja:'\u8a31\u3059', pos:'v.', def:'to let something happen' },
    { en:'avoid', ja:'\u907f\u3051\u308b', pos:'v.', def:'keep away from' },
    { en:'believe', ja:'\u4fe1\u3058\u308b', pos:'v.', def:'accept as true' },
    { en:'borrow', ja:'\u501f\u308a\u308b', pos:'v.', def:'receive and return later' },
    { en:'create', ja:'\u5275\u9020\u3059\u308b', pos:'v.', def:'to make' }
  ];

  const vocabToeic = [
    { en:'budget', ja:'\u4e88\u7b97', pos:'n.', def:'plan for how to spend money' },
    { en:'client', ja:'\u9867\u5ba2', pos:'n.', def:'customer of a professional service' },
    { en:'contract', ja:'\u5951\u7d04', pos:'n.', def:'a legal agreement' },
    { en:'deadline', ja:'\u7de0\u5207\u308a', pos:'n.', def:'time by which something must be done' }
  ];

  const vocabHighschool = [
    { en:'biology', ja:'\u751f\u7269\u5b66', pos:'n.', def:'study of living things' },
    { en:'chemistry', ja:'\u5316\u5b66', pos:'n.', def:'study of substances' },
    { en:'physics', ja:'\u7269\u7406\u5b66', pos:'n.', def:'study of matter and energy' }
  ];

  // Phrases fallback (short common expressions)
  const vocabPhrases = [
    { en: 'take a break', ja: '\u4f11\u61a9\u3059\u308b', pos: 'phr.', def: 'have a short rest' },
    { en: 'make a decision', ja: '\u6c7a\u65ad\u3059\u308b', pos: 'phr.', def: 'decide something' },
    { en: 'pay attention', ja: '\u6ce8\u610f\u3092\u5411\u3051\u308b', pos: 'phr.', def: 'watch or listen carefully' },
    { en: 'as soon as possible', ja: '\u3067\u304d\u308b\u3060\u3051\u65e9\u304f', pos: 'phr.', def: 'as quickly as you can' },
    { en: 'in the long run', ja: '\u9577\u671f\u7684\u306b\u898b\u308b\u3068', pos: 'phr.', def: 'over a long period' }
  ];

  // Sentences fallback (short simple sentences)
  const vocabSentences = [
    { en: 'I am looking forward to meeting you.', ja: '\u304a\u4f1a\u3044\u3059\u308b\u306e\u3092\u697d\u3057\u307f\u306b\u3057\u3066\u3044\u307e\u3059\u3002', pos: 'sent.', def: 'I am excited to meet you.' },
    { en: 'Could you speak more slowly, please?', ja: '\u3082\u3063\u3068\u3086\u3063\u304f\u308a\u8a71\u3057\u3066\u304f\u3060\u3055\u3044\u3002', pos: 'sent.', def: 'Please speak slowly.' },
    { en: 'This product comes with a two-year warranty.', ja: '\u3053\u306e\u88fd\u54c1\u306b\u306f2\u5e74\u4fdd\u8a3c\u304c\u4ed8\u3044\u3066\u3044\u307e\u3059\u3002', pos: 'sent.', def: 'There is a two-year guarantee.' },
    { en: 'I will send you the updated schedule tomorrow.', ja: '\u660e\u65e5\u66f4\u65b0\u3057\u305f\u4e88\u5b9a\u3092\u304a\u9001\u308a\u3057\u307e\u3059\u3002', pos: 'sent.', def: 'I will email the new schedule tomorrow.' }
  ];

  function datasetList(sel){ if(sel==='toeic') return datasets.toeic||vocabToeic; if(sel==='highschool') return datasets.highschool||vocabHighschool; if(sel==='custom' && Array.isArray(customVocab)&&customVocab.length) return customVocab; return vocabDefault; }

  function datasetListCurrent(){
    const unit = (state.cfg?.unitType) || (elUnitType?.value) || 'word';
    if(unit==='phrase') return textsets.phrases || vocabPhrases;
    if(unit==='sentence') return textsets.sentences || vocabSentences;
    return datasetList(elWordSet?.value || 'default');
  }

  async function getDatasetList(sel){
    if(sel==='custom' && Array.isArray(customVocab)&&customVocab.length) return customVocab;
    if(sel==='toeic'){
      if(!datasets.toeic){
        const main = await tryLoadJson('data/toeic.json', vocabToeic);
        const extra = await tryLoadJson('data/toeic_extra.json', []);
        datasets.toeic = main.concat(extra);
      }
      return datasets.toeic;
    }
    if(sel==='highschool'){
      if(!datasets.highschool){
        const main = await tryLoadJson('data/highschool.json', vocabHighschool);
        const extra = await tryLoadJson('data/highschool_extra.json', []);
        datasets.highschool = main.concat(extra);
      }
      return datasets.highschool;
    }
    return vocabDefault;
  }

  async function getDatasetByUnit(unit){
    if(unit==='phrase'){
      if(!textsets.phrases) textsets.phrases = await tryLoadJson('data/phrases.json', vocabPhrases);
      return textsets.phrases;
    }
    if(unit==='sentence'){
      if(!textsets.sentences) textsets.sentences = await tryLoadJson('data/sentences.json', vocabSentences);
      return textsets.sentences;
    }
    return getDatasetList(elWordSet?.value || 'default');
  }

  async function tryLoadJson(path, fallback){ try{ const res=await fetch(path,{cache:'no-store'}); if(!res.ok) throw new Error('fetch'); const data=await res.json(); const norm=normalizeVocab(data); return norm.length?norm:fallback; }catch(e){ return fallback; } }

  // Import
  elImportFile?.addEventListener('change', async (e)=>{
    const file=e.target.files && e.target.files[0]; if(!file) return;
    try{ const text=await file.text(); let list=[]; if(file.name.endsWith('.json')){ list=normalizeVocab(JSON.parse(text)); } else { list=parseCSVLike(text); } if(!list.length) throw new Error('no words'); customVocab=list; elWordSet.value='custom'; resetState(list); alert(`\u5358\u8a9e\u30ea\u30b9\u30c8\u3092\u8aad\u307f\u8fbc\u307f\u307e\u3057\u305f: ${list.length} \u8a9e`); }catch(err){ console.error(err); alert('JSON/CSV \u30d5\u30a9\u30fc\u30de\u30c3\u30c8\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044'); } finally { e.target.value=''; }
  });

  function normalizeVocab(data){ const out=[]; for(const it of data){ if(!it) continue; if(typeof it==='string'){ out.push({en:it,ja:it,pos:'',def:''}); } else { const en=(it.en||it.word||'').trim(); const ja=(it.ja||it.meaning||it.jp||it.translation||en).trim(); if(!en) continue; out.push({ en, ja, pos:(it.pos||'').trim(), def:(it.def||it.definition||'').trim() }); } } return out; }
  function parseCSVLike(text){ const lines=text.split(/\r?\n/).filter(Boolean); const out=[]; for(const line of lines){ const parts=line.split(/\t|,/); const [en,ja,pos,def]=[parts[0],parts[1],parts[2],parts[3]]; if(!en) continue; out.push({ en:en.trim(), ja:(ja||en).trim(), pos:(pos||'').trim(), def:(def||'').trim() }); } return out; }

  // Controls
  elBtnStart?.addEventListener('click', ()=> startRound(false));
  if(elBtnStartMenu){ elBtnStartMenu.addEventListener('click', ()=>{
    if(elMenuMode&&elMode) elMode.value=elMenuMode.value;
    if(elMenuCourse&&elCourse) elCourse.value=elMenuCourse.value;
    if(elMenuWordSet&&elWordSet) elWordSet.value=elMenuWordSet.value;
    if(elMenuPrompt&&elPromptMode) elPromptMode.value=elMenuPrompt.value;
    if(elMenuDifficulty&&elDifficulty) elDifficulty.value=elMenuDifficulty.value;
    if(elMenuVoice&&elOptVoice) elOptVoice.checked = !!elMenuVoice.checked;
    if(elMenuUnit&&elUnitType) elUnitType.value = elMenuUnit.value;
    if(elMenuSeconds&&elCustomSeconds) elCustomSeconds.value = elMenuSeconds.value;
    if(elMenuPack&&elPackSize) elPackSize.value = elMenuPack.value;
    startRound(false);
  }); }
  elBtnPause?.addEventListener('click', ()=>{ if(!state.running){ resumeRound(); elBtnPause.textContent='\u4e00\u6642\u505c\u6b62'; } else { pauseRound(); elBtnPause.textContent='\u518d\u958b'; } });
  elBtnReset?.addEventListener('click', ()=>{ pauseRound(); resetState(); });
  elBtnClose?.addEventListener('click', ()=>{ elModal.style.display='none'; });
  elBtnReview?.addEventListener('click', ()=>{ elModal.style.display='none'; startRound(true); });
  elBtnReplay?.addEventListener('click', ()=>{ elModal.style.display='none'; startRound(false); });
  elBtnOpenMenu?.addEventListener('click', ()=>{ openMenuOverlay(); });
  elBtnOpenMenuFromModal?.addEventListener('click', ()=>{ elModal.style.display='none'; openMenuOverlay(); });
  $('#board')?.addEventListener('click', ()=> elInput.focus());
  elInput?.addEventListener('keydown', onKeyDown);

  // Allow Enter to replay when modal is open
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' && elModal && elModal.style.display === 'flex') {
      e.preventDefault();
      elBtnReplay?.click();
    }
  });

function syncTimeWithCourse(){
  const mode=elMode.value; const course=elCourse.value;
  const showCustom = (mode==='learn') || (mode==='test' && course==='custom');
  if(elCustomSeconds){ elCustomSeconds.style.display = showCustom? '' : 'none'; }
  if(mode==='test'){
    const isCustom = course==='custom';
    elRoundTime.disabled = isCustom;
    if(!isCustom){ const sec=courseMap[course].seconds; elRoundTime.value=String(sec); }
    elCourse.disabled=false;
  } else {
    elCourse.disabled=true;
    elRoundTime.disabled=true;
  }
}
  elCourse?.addEventListener('change', ()=>{ syncTimeWithCourse(); if(!state.running) resetState(); });
  elMode?.addEventListener('change', ()=>{ syncTimeWithCourse(); if(!state.running) resetState(); });
  elCustomSeconds?.addEventListener('change', ()=>{ if(!state.running) resetState(); });
  elWordSet?.addEventListener('change', async ()=>{ if(!state.running){ const words=await getDatasetList(elWordSet.value); resetState(words);} });
  elUnitType?.addEventListener('change', async ()=>{ if(!state.running){ const items = await getDatasetByUnit(elUnitType.value); resetState(items); } });
  syncTimeWithCourse();

  // Init
  resetState();


// Time helper
  function getConfiguredSeconds(){
  const mode = elMode?.value || 'learn';
  const course = elCourse?.value || '5000';
  const parseNum = (v)=>{ const n = parseInt(v,10); return (isFinite(n) && n>0) ? n : null; };
  const secInput = elCustomSeconds ? parseNum(elCustomSeconds.value) : null;
  const selSec = elRoundTime ? parseNum(elRoundTime.value) : null;
  if(mode==='test'){
    if(course!=='custom' && courseMap[course]) return courseMap[course].seconds;
    return secInput || selSec || cfgDefaults.roundTimeSec;
  } else {
    return secInput || selSec || cfgDefaults.roundTimeSec;
  }

  function openMenuOverlay(){
    if (!elMenu) return;
    // populate menu fields from current controls
    if (elMenuMode && elMode) elMenuMode.value = elMode.value;
    if (elMenuCourse && elCourse) elMenuCourse.value = elCourse.value;
    if (elMenuWordSet && elWordSet) elMenuWordSet.value = elWordSet.value;
    if (elMenuPrompt && elPromptMode) elMenuPrompt.value = elPromptMode.value;
    if (elMenuDifficulty && elDifficulty) elMenuDifficulty.value = elDifficulty.value;
    if (elMenuVoice && elOptVoice) elMenuVoice.checked = !!elOptVoice.checked;
    if (elMenuUnit && elUnitType) elMenuUnit.value = elUnitType.value;
    if (elMenuSeconds && elCustomSeconds) elMenuSeconds.value = elCustomSeconds.value;
    if (elMenuPack && elPackSize) elMenuPack.value = elPackSize.value;
    elMenu.style.display = 'flex';
    elMenu.classList.remove('fade-out');
  }
}

})();

