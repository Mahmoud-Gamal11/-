// ══════════════════════════════════════════════════════════
//  STORAGE
// ══════════════════════════════════════════════════════════
const LS = {
  get: k => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : null; } catch(e){ return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} },
  del: k => { try { localStorage.removeItem(k); } catch(e){} }
};

// ══════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════
let currentUser = null;
let userData    = null;
let prayerTimes = null;
let prayers     = { fajr:false, dhuhr:false, asr:false, maghrib:false, isha:false };
let donePrayers = 0;
let userLat = null, userLng = null;
let locationAsked = false;
let curQuranTab = 'ayat';
let countdownTimer = null;
let notifTimers = [];
let settings = { notifications: false };

// Azkar state
let azkarState  = { morning:{}, evening:{} };
let curAzkarTab = 'morning';

// Tasbih state
let tasbihItems = [
  { id:'subhan',    text:'سبحان الله',                                 target:33, sessions:0 },
  { id:'hamd',      text:'الحمد لله',                                   target:33, sessions:0 },
  { id:'akbar',     text:'الله أكبر',                                   target:34, sessions:0 },
  { id:'subhanwab', text:'سبحان الله وبحمده سبحان الله العظيم',          target:100, sessions:0 },
  { id:'istighfar', text:'أستغفر الله وأتوب إليه',                       target:100, sessions:0 },
  { id:'salawat',   text:'اللهم صل وسلم على نبينا محمد',                 target:100, sessions:0 },
  { id:'hawqala',   text:'لا حول ولا قوة إلا بالله',                    target:33, sessions:0 },
  { id:'tahlil',    text:'لا إله إلا الله وحده لا شريك له',              target:100, sessions:0 },
];
let curTasbihIdx = 0;
let tasbihCount  = 0;

const PRAYER_NAMES_AR = { fajr:'الفجر', dhuhr:'الظهر', asr:'العصر', maghrib:'المغرب', isha:'العشاء' };
const PRAYER_KEYS = ['fajr','dhuhr','asr','maghrib','isha'];
const PRAYER_TIMINGS_MAP = { fajr:'Fajr', dhuhr:'Dhuhr', asr:'Asr', maghrib:'Maghrib', isha:'Isha' };
const POINTS = { fajr:20, dhuhr:10, asr:10, maghrib:10, isha:10 };

const todayKey = getTodayKey();

// ══════════════════════════════════════════════════════════
//  BACKGROUND CANVAS
// ══════════════════════════════════════════════════════════
(function initBG() {
  const canvas = document.getElementById('bgCanvas');
  const ctx = canvas.getContext('2d');
  let stars = [];
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  function makeStars() {
    stars = [];
    for (let i = 0; i < 80; i++) {
      stars.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, r: Math.random()*1.2+0.3, alpha: Math.random()*0.5+0.1, speed: Math.random()*0.008+0.003, phase: Math.random()*Math.PI*2 });
    }
  }
  let frame = 0;
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    frame++;
    stars.forEach(s => {
      const alpha = s.alpha*(0.5+0.5*Math.sin(frame*s.speed+s.phase));
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  resize(); makeStars(); draw();
  window.addEventListener('resize', () => { resize(); makeStars(); });
})();

// ══════════════════════════════════════════════════════════
//  CONFETTI
// ══════════════════════════════════════════════════════════
function launchConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  canvas.style.display = 'block';
  const particles = [];
  const colors = ['#4ade80','#fbbf24','#60a5fa','#f472b6','#34d399','#a78bfa'];
  for (let i = 0; i < 120; i++) {
    particles.push({ x:Math.random()*canvas.width, y:Math.random()*canvas.height-canvas.height, w:Math.random()*10+4, h:Math.random()*5+3, color:colors[Math.floor(Math.random()*colors.length)], r:Math.random()*Math.PI*2, rSpeed:(Math.random()-0.5)*0.18, vy:Math.random()*3+2, vx:(Math.random()-0.5)*2 });
  }
  let frames = 0;
  function tick() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p => { p.y+=p.vy; p.x+=p.vx; p.r+=p.rSpeed; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.r); ctx.fillStyle=p.color; ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h); ctx.restore(); });
    frames++;
    if (frames < 110) requestAnimationFrame(tick); else canvas.style.display = 'none';
  }
  tick();
}

// ══════════════════════════════════════════════════════════
//  HIJRI DATE
// ══════════════════════════════════════════════════════════
function showHijriDate() {
  try {
    const hijri = new Date().toLocaleDateString('ar-SA-u-ca-islamic', { day:'numeric', month:'long', year:'numeric' });
    const greg  = new Date().toLocaleDateString('ar-EG', { weekday:'long', day:'numeric', month:'long' });
    const el = document.getElementById('hijriRow');
    if (el) el.innerHTML = `${greg} — <span>${hijri}</span>`;
  } catch(e) {}
}

// ══════════════════════════════════════════════════════════
//  DAILY AYAH
// ══════════════════════════════════════════════════════════
const AYAT_ROTATION = [
  { text:'﴿ إِنَّ الصَّلَاةَ كَانَتْ عَلَى الْمُؤْمِنِينَ كِتَابًا مَّوْقُوتًا ﴾', src:'سورة النساء — آية 103' },
  { text:'﴿ وَأَقِمِ الصَّلَاةَ إِنَّ الصَّلَاةَ تَنْهَىٰ عَنِ الْفَحْشَاءِ وَالْمُنكَرِ ﴾', src:'سورة العنكبوت — آية 45' },
  { text:'﴿ حَٰفِظُوا عَلَى الصَّلَوَٰتِ وَالصَّلَوٰةِ الْوُسْطَىٰ ﴾', src:'سورة البقرة — آية 238' },
  { text:'﴿ وَاسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ ﴾', src:'سورة البقرة — آية 45' },
  { text:'﴿ قَدْ أَفْلَحَ الْمُؤْمِنُونَ ۞ الَّذِينَ هُمْ فِي صَلَاتِهِمْ خَاشِعُونَ ﴾', src:'سورة المؤمنون — آية 1-2' },
];
const AHADITH_ROTATION = [
  { text:'أفضل الأعمال إلى الله الصلاة لأول وقتها، ثم بر الوالدين، ثم الجهاد في سبيل الله', src:'متفق عليه' },
  { text:'مثل الصلوات الخمس كمثل نهر جارٍ غمر على باب أحدكم، يغتسل منه كل يوم خمس مرات', src:'رواه مسلم' },
  { text:'أول ما يُحاسب به العبد يوم القيامة الصلاة، فإن صلحت صلح سائر عمله', src:'رواه الترمذي' },
  { text:'الصلوات الخمس كفارة لما بينهن، ما اجتنبت الكبائر', src:'رواه مسلم' },
];

function showDailyAyah() {
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(),0,0)) / 86400000);
  const ayah   = AYAT_ROTATION[dayOfYear % AYAT_ROTATION.length];
  const hadith = AHADITH_ROTATION[dayOfYear % AHADITH_ROTATION.length];
  const at = document.getElementById('ayahText'); if(at) at.textContent = ayah.text;
  const as = document.getElementById('ayahSrc');  if(as) as.textContent = ayah.src;
  const ht = document.getElementById('hadithText'); if(ht) ht.textContent = `«${hadith.text}»`;
  const hs = document.getElementById('hadithSrc');  if(hs) hs.textContent = hadith.src;
}

// ══════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════
function init() {
  showLoader('جاري التحميل...');
  const session = LS.get('madawama_session');
  if (session) {
    currentUser = session;
    userData = LS.get('madawama_data_' + currentUser.uid) || defaultUserData();
    settings  = LS.get('madawama_settings_' + currentUser.uid) || { notifications: false };
    loadAzkarState();
    loadTasbihState();
    loadTodayPrayers();
    checkAndResetStreak();
    askLocation(() => fetchPrayerTimes(() => { hideLoader(); showApp(); }));
  } else {
    hideLoader();
    showAuth();
  }
}

function defaultUserData() {
  return { name: currentUser?.name || 'مستخدم', city: currentUser?.city || 'القاهرة', points: 0, streak: 0, totalPrayed: 0, prayers: {}, lastActiveDate: '', longestStreak: 0 };
}
function saveUserData() { if (!currentUser) return; LS.set('madawama_data_' + currentUser.uid, userData); }
function saveSettings()  { if (!currentUser) return; LS.set('madawama_settings_' + currentUser.uid, settings); }

// ══════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════
function hashPass(p) {
  let h = 0;
  for (let i = 0; i < p.length; i++) { h = ((h << 5) - h) + p.charCodeAt(i); h |= 0; }
  return 'h' + Math.abs(h).toString(36);
}

window.registerUser = function() {
  const btn = document.getElementById('regBtn');
  const name  = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('regPass').value;
  const city  = document.getElementById('regCity').value.trim() || 'القاهرة';
  clearAuthMsg();
  if (!name)  return showAuthMsg('من فضلك ادخل اسمك', 'error');
  if (!email.includes('@')) return showAuthMsg('إيميل غير صحيح', 'error');
  if (pass.length < 6) return showAuthMsg('كلمة المرور 6 أحرف على الأقل', 'error');
  const accounts = LS.get('madawama_accounts') || {};
  if (accounts[email]) return showAuthMsg('الإيميل ده مسجل بالفعل — سجّل الدخول', 'error');
  btn.disabled = true; btn.textContent = 'جاري الإنشاء...';
  const uid = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
  accounts[email] = { uid, name, email, city, passHash: hashPass(pass) };
  LS.set('madawama_accounts', accounts);
  currentUser = { uid, name, email, city };
  userData = defaultUserData(); settings = { notifications: false };
  LS.set('madawama_session', currentUser);
  LS.set('madawama_data_' + uid, userData);
  LS.set('madawama_settings_' + uid, settings);
  showAuthMsg('تم إنشاء حسابك بنجاح! 🌙', 'success');
  setTimeout(() => {
    showLoader('مرحباً ' + name + ' 🌙');
    loadTodayPrayers();
    askLocation(() => fetchPrayerTimes(() => { hideLoader(); showApp(); }));
  }, 900);
};

window.loginUser = function() {
  const btn = document.getElementById('loginBtn');
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('loginPass').value;
  clearAuthMsg();
  if (!email || !pass) return showAuthMsg('من فضلك ادخل الإيميل وكلمة المرور', 'error');
  const accounts = LS.get('madawama_accounts') || {};
  const acc = accounts[email];
  if (!acc) return showAuthMsg('مفيش حساب بالإيميل ده — سجّل حساب جديد', 'error');
  if (acc.passHash !== hashPass(pass)) return showAuthMsg('كلمة المرور غلط', 'error');
  btn.disabled = true; btn.textContent = 'جاري الدخول...';
  currentUser = { uid: acc.uid, name: acc.name, email: acc.email, city: acc.city };
  userData = LS.get('madawama_data_' + acc.uid) || defaultUserData();
  settings = LS.get('madawama_settings_' + acc.uid) || { notifications: false };
  LS.set('madawama_session', currentUser);
  loadAzkarState();
  loadTasbihState();
  loadTodayPrayers();
  checkAndResetStreak();
  showLoader('مرحباً ' + currentUser.name + ' 🌙');
  askLocation(() => fetchPrayerTimes(() => { hideLoader(); showApp(); }));
};

window.logoutUser = function() {
  if (!confirm('هل تريد تسجيل الخروج؟')) return;
  clearTimers();
  LS.del('madawama_session');
  currentUser = null; userData = null;
  prayers = { fajr:false, dhuhr:false, asr:false, maghrib:false, isha:false };
  donePrayers = 0; locationAsked = false; prayerTimes = null;
  document.getElementById('appContainer').style.display = 'none';
  showAuth();
};

window.switchAuthTab = function(tab) {
  document.querySelectorAll('.auth-tab').forEach((x,i) => x.classList.toggle('active', (tab==='login')?(i===0):(i===1)));
  document.querySelectorAll('.auth-form').forEach(x => x.classList.remove('active'));
  document.getElementById('form-' + tab).classList.add('active');
  clearAuthMsg();
  const lb = document.getElementById('loginBtn'); if(lb){lb.disabled=false;lb.textContent='دخول';}
  const rb = document.getElementById('regBtn');   if(rb){rb.disabled=false;rb.textContent='إنشاء الحساب';}
};

// ══════════════════════════════════════════════════════════
//  LOCATION
// ══════════════════════════════════════════════════════════
function askLocation(cb) {
  if (locationAsked) { cb(); return; }
  locationAsked = true;
  if (!navigator.geolocation) { cb(); return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      userLat = pos.coords.latitude; userLng = pos.coords.longitude;
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${userLat}&lon=${userLng}&format=json`)
        .then(r => r.json())
        .then(d => {
          const city = d.address?.city || d.address?.town || d.address?.village || d.address?.state || (currentUser?.city || 'القاهرة');
          if (currentUser) { currentUser.city = city; LS.set('madawama_session', currentUser); if(userData) userData.city = city; saveUserData(); }
          const el = document.getElementById('cityName'); if(el) el.textContent = city;
          const lb = document.getElementById('locBanner');
          if (lb) { document.getElementById('locBannerText').textContent = `📍 موقعك: ${city} — المواقيت دقيقة لموقعك`; lb.classList.add('show'); }
        }).catch(()=>{}).finally(()=>cb());
    },
    () => cb(),
    { timeout: 7000, enableHighAccuracy: false }
  );
}

// ══════════════════════════════════════════════════════════
//  PRAYER TIMES
// ══════════════════════════════════════════════════════════
function fetchPrayerTimes(cb) {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2,'0');
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const yyyy = today.getFullYear();
  const url = (userLat && userLng)
    ? `https://api.aladhan.com/v1/timings/${dd}-${mm}-${yyyy}?latitude=${userLat}&longitude=${userLng}&method=5`
    : `https://api.aladhan.com/v1/timingsByCity/${dd}-${mm}-${yyyy}?city=${encodeURIComponent(currentUser?.city||'Cairo')}&country=&method=5`;
  fetch(url)
    .then(r => r.json())
    .then(d => {
      if (d.code === 200 && d.data?.timings) prayerTimes = d.data.timings;
      else prayerTimes = { Fajr:'04:52', Dhuhr:'12:10', Asr:'15:38', Maghrib:'18:24', Isha:'19:48' };
      cb();
    })
    .catch(() => { prayerTimes = { Fajr:'04:52', Dhuhr:'12:10', Asr:'15:38', Maghrib:'18:24', Isha:'19:48' }; cb(); });
}

function to12h(t) {
  if (!t) return '--:--';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'م' : 'ص';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${suffix}`;
}

function getTimeMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function getTimeSeconds(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 3600 + m * 60;
}

function getCurrentAndNextPrayer() {
  if (!prayerTimes) return { current: null, next: null };
  const now = new Date();
  const curSec = now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds();
  const times = PRAYER_KEYS.map(k => ({
    id: k, name: PRAYER_NAMES_AR[k],
    t: prayerTimes[PRAYER_TIMINGS_MAP[k]],
    min: getTimeMinutes(prayerTimes[PRAYER_TIMINGS_MAP[k]]),
    sec: getTimeSeconds(prayerTimes[PRAYER_TIMINGS_MAP[k]])
  }));
  // Current prayer = last one whose time has passed
  let currentPrayer = times[times.length - 1].id;
  for (const p of times) { if (curSec >= p.sec) currentPrayer = p.id; }
  // Next prayer = first upcoming
  let nextPrayer = null;
  for (const p of times) { if (p.sec > curSec) { nextPrayer = p; break; } }
  if (!nextPrayer) nextPrayer = times[0]; // wrap to fajr tomorrow
  return { current: currentPrayer, next: nextPrayer };
}

// ══════════════════════════════════════════════════════════
//  FIX 1 & 2: COUNTDOWN — shows remaining time to next prayer
//             Prayer marking — only if time has come
// ══════════════════════════════════════════════════════════
function startCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = setInterval(updateCountdown, 1000);
  updateCountdown();
}

function updateCountdown() {
  if (!prayerTimes) return;
  const { next } = getCurrentAndNextPrayer();
  if (!next) return;

  const now = new Date();
  const curSec = now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds();
  let targetSec = next.sec;
  if (targetSec <= curSec) targetSec += 24*3600; // tomorrow

  const diff = targetSec - curSec;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;

  const cd = document.getElementById('countdown');
  if (cd) cd.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  const nn = document.getElementById('nextPrayerName'); if(nn) nn.textContent = next.name;
  const nt = document.getElementById('nextPrayerTime'); if(nt) nt.textContent = to12h(next.t);

  // Refresh prayer grid every minute to update current/future highlighting
  if (s === 0) renderPrayerGrid();
}

function isPrayerTimeReached(prayerKey) {
  if (!prayerTimes) return false;
  const tStr = prayerTimes[PRAYER_TIMINGS_MAP[prayerKey]];
  if (!tStr) return false;
  const now = new Date();
  const curSec = now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds();
  const pSec = getTimeSeconds(tStr);
  return curSec >= pSec;
}

// ══════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ══════════════════════════════════════════════════════════
function clearTimers() {
  notifTimers.forEach(t => clearTimeout(t));
  notifTimers = [];
  clearInterval(countdownTimer);
}

function scheduleNotifications() {
  clearTimers();
  if (!settings.notifications || !prayerTimes || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  PRAYER_KEYS.forEach(k => {
    const tStr = prayerTimes[PRAYER_TIMINGS_MAP[k]];
    if (!tStr) return;
    const [h, m] = tStr.split(':').map(Number);
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
    const diff = target.getTime() - now.getTime();
    if (diff > 0) {
      const t = setTimeout(() => {
        new Notification('🌙 مداومة — وقت الصلاة', { body: `حان وقت صلاة ${PRAYER_NAMES_AR[k]} — تقبّل الله منك` });
      }, diff);
      notifTimers.push(t);
    }
  });
}

window.toggleNotif = async function() {
  if (!('Notification' in window)) { showToast('متصفحك لا يدعم الإشعارات'); return; }
  if (!settings.notifications) {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { showToast('لم يُسمح بالإشعارات'); return; }
    settings.notifications = true;
    scheduleNotifications();
    showToast('✅ تم تفعيل تنبيهات الصلاة');
  } else {
    settings.notifications = false;
    clearTimers(); startCountdown();
    showToast('🔕 تم إيقاف التنبيهات');
  }
  document.getElementById('notifToggle').classList.toggle('on', settings.notifications);
  saveSettings();
};

window.saveCity = function() {
  const v = document.getElementById('cityInput').value.trim();
  if (!v) return showToast('من فضلك ادخل اسم المدينة');
  if (currentUser) { currentUser.city = v; LS.set('madawama_session', currentUser); }
  if (userData) { userData.city = v; saveUserData(); }
  const cn = document.getElementById('cityName'); if(cn) cn.textContent = v;
  showToast('✅ تم حفظ المدينة — جاري تحديث المواقيت...');
  fetchPrayerTimes(() => { renderPrayerGrid(); updateCountdown(); scheduleNotifications(); });
};

window.resetToday = function() {
  if (!confirm('هل تريد مسح سجل صلوات اليوم؟')) return;
  prayers = { fajr:false, dhuhr:false, asr:false, maghrib:false, isha:false };
  donePrayers = 0;
  if (userData?.prayers) delete userData.prayers[todayKey];
  saveUserData();
  renderPrayerGrid(); updateProgress(); updateRing();
  showToast('🗑️ تم مسح سجل اليوم');
};

// ══════════════════════════════════════════════════════════
//  PRAYERS
// ══════════════════════════════════════════════════════════
function loadTodayPrayers() {
  const tp = userData?.prayers?.[todayKey] || {};
  PRAYER_KEYS.forEach(k => prayers[k] = tp[k] || false);
  donePrayers = PRAYER_KEYS.filter(k => prayers[k]).length;
}

function checkAndResetStreak() {
  if (!userData) return;
  const yesterday = getYesterdayKey();
  const last = userData.lastActiveDate;
  if (last && last !== todayKey && last !== yesterday) { userData.streak = 0; saveUserData(); }
}

// FIX 2: check if prayer time has been reached before marking
window.markPrayer = function(id) {
  if (prayers[id]) return;

  // Check if prayer time has been reached
  if (!isPrayerTimeReached(id)) {
    const pName = PRAYER_NAMES_AR[id];
    const tStr = prayerTimes ? to12h(prayerTimes[PRAYER_TIMINGS_MAP[id]]) : '--:--';
    showToast(`⏳ وقت ${pName} لم يحن بعد — الوقت: ${tStr}`);
    // shake animation
    const el = document.querySelector(`.prayer-item[data-id="${id}"]`);
    if (el) { el.style.animation = 'none'; el.offsetHeight; el.style.animation = 'shake 0.4s ease'; }
    return;
  }

  prayers[id] = true;
  donePrayers++;
  const earned = POINTS[id];
  let newPoints = (userData.points || 0) + earned;
  let newTotal  = (userData.totalPrayed || 0) + 1;
  let newStreak = userData.streak || 0;

  if (donePrayers === 1 && userData.lastActiveDate !== todayKey) {
    const yesterday = getYesterdayKey();
    newStreak = (userData.lastActiveDate === yesterday) ? (userData.streak || 0) + 1 : 1;
  }

  const fullDay = donePrayers === 5;
  if (fullDay) {
    newPoints += 50;
    setTimeout(() => {
      document.getElementById('completionOverlay').classList.add('show');
      launchConfetti();
    }, 350);
  } else {
    const msgs = [`ما شاء الله! +${earned} نقطة 🤍`, `أحسنت! تقبّل الله صلاتك ✨`, `بارك الله فيك! استمر 🌿`, `جزاك الله خيراً 💚`, `كل صلاة نور في قبرك 🌙`];
    showToast(msgs[Math.floor(Math.random()*msgs.length)]);
  }

  if (navigator.vibrate) navigator.vibrate([30,10,30]);

  if (!userData.prayers) userData.prayers = {};
  if (!userData.prayers[todayKey]) userData.prayers[todayKey] = {};
  userData.prayers[todayKey][id] = true;
  userData.points = newPoints;
  userData.totalPrayed = newTotal;
  userData.streak = newStreak;
  userData.lastActiveDate = todayKey;
  if (newStreak > (userData.longestStreak || 0)) userData.longestStreak = newStreak;
  saveUserData();

  renderPrayerGrid();
  updateStatsUI(newPoints, newStreak, newTotal);
  updateProgress();
  updateRing();
};

function renderPrayerGrid() {
  const grid = document.getElementById('prayersGrid');
  if (!grid || !prayerTimes) return;
  const { current } = getCurrentAndNextPrayer();

  grid.innerHTML = PRAYER_KEYS.map(id => {
    const isDone    = prayers[id];
    const isCurrent = (id === current) && !isDone;
    const isFuture  = !isDone && !isPrayerTimeReached(id);
    const t = to12h(prayerTimes[PRAYER_TIMINGS_MAP[id]]);
    return `<div class="prayer-item ${isDone?'done':''} ${isCurrent?'current':''} ${isFuture?'future':''}"
                 onclick="markPrayer('${id}')"
                 data-id="${id}"
                 role="button" tabindex="${isDone||isFuture?'-1':'0'}"
                 aria-label="صلاة ${PRAYER_NAMES_AR[id]} — ${t} ${isDone?'(محافظ)':isFuture?'(لم يحن وقتها)':''}">
      <div class="prayer-check">✓</div>
      <div class="prayer-lock">🔒</div>
      <div class="prayer-name">${PRAYER_NAMES_AR[id]}</div>
      <div class="prayer-time">${t}</div>
      <div class="prayer-dot"></div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.prayer-item:not(.done):not(.future)').forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') el.click(); });
  });

  const cn = document.getElementById('cityName');
  if (cn) cn.textContent = currentUser?.city || 'القاهرة';
}

function updateProgress() {
  const pct = Math.round(donePrayers / 5 * 100);
  const fill = document.getElementById('progressBarFill'); if(fill) fill.style.width = pct + '%';
  const txt  = document.getElementById('progressText');    if(txt)  txt.textContent  = `صليت ${donePrayers} من 5`;
  const pctEl= document.getElementById('progressPct');     if(pctEl) pctEl.textContent = pct + '%';
}

function updateRing() {
  const ring = document.getElementById('ringFill');
  const num  = document.getElementById('ringNum');
  if (ring) {
    const circumference = 2 * Math.PI * 50;
    const offset = circumference - (donePrayers / 5) * circumference;
    ring.style.strokeDashoffset = offset;
    ring.style.strokeDasharray  = circumference;
  }
  if (num) num.textContent = donePrayers;
}

// ══════════════════════════════════════════════════════════
//  LEVELS
// ══════════════════════════════════════════════════════════
const LEVELS = [
  { level:1,  title:'المبتدئ',  badge:'مبتدئ', emoji:'🌱', base:0,     next:200   },
  { level:2,  title:'الساعي',   badge:'ساعي',   emoji:'🌿', base:200,   next:500   },
  { level:3,  title:'المداوم',  badge:'مداوم',  emoji:'☘️', base:500,   next:1000  },
  { level:4,  title:'المحافظ',  badge:'محافظ',  emoji:'🍀', base:1000,  next:2000  },
  { level:5,  title:'المثابر',  badge:'مثابر',  emoji:'🌸', base:2000,  next:3500  },
  { level:6,  title:'المتهجد',  badge:'متهجد',  emoji:'🌺', base:3500,  next:5500  },
  { level:7,  title:'الخاشع',   badge:'خاشع',   emoji:'🕌', base:5500,  next:8000  },
  { level:8,  title:'المنيب',   badge:'منيب',   emoji:'📿', base:8000,  next:11000 },
  { level:9,  title:'الأواب',   badge:'أواب',   emoji:'⭐', base:11000, next:15000 },
  { level:10, title:'الولي',    badge:'ولي',    emoji:'🌙', base:15000, next:99999 },
];
function getLevel(pts) {
  for (let i = LEVELS.length-1; i >= 0; i--) { if (pts >= LEVELS[i].base) return LEVELS[i]; }
  return LEVELS[0];
}

// ══════════════════════════════════════════════════════════
//  STATS UI
// ══════════════════════════════════════════════════════════
function animateNum(el, target) {
  if (!el) return;
  const start = parseInt(el.textContent.replace(/[^0-9]/g,'')) || 0;
  if (start === target) return;
  const duration = 600;
  const startTime = performance.now();
  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1-t, 3);
    el.textContent = Math.round(start + (target-start)*ease).toLocaleString('ar-EG');
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function updateStatsUI(pts, streak, total) {
  animateNum(document.getElementById('totalPoints'), pts);
  animateNum(document.getElementById('streakNum'), streak);
  animateNum(document.getElementById('totalPrayers'), total);
  animateNum(document.getElementById('dashStreak'), streak);
  animateNum(document.getElementById('dashPoints'), pts);
  const lvl = getLevel(pts);
  const le = document.getElementById('levelEmoji'); if(le) le.textContent = lvl.emoji;
  const lt = document.getElementById('levelTitle'); if(lt) lt.textContent = `المستوى ${lvl.level} — ${lvl.title}`;
  const lb = document.getElementById('levelBadge'); if(lb) lb.textContent = lvl.badge;
  const xpFill = document.getElementById('xpFill');
  if (xpFill) {
    const pct = lvl.next === 99999 ? 100 : Math.min(100, Math.round((pts-lvl.base)/(lvl.next-lvl.base)*100));
    xpFill.style.width = pct + '%';
  }
  const xpText = document.getElementById('xpText');
  if (xpText) xpText.textContent = lvl.next===99999 ? 'وصلت أعلى مستوى! 🏆' : `${pts.toLocaleString('ar-EG')} / ${lvl.next.toLocaleString('ar-EG')} نقطة`;
}

// ══════════════════════════════════════════════════════════
//  FIX 3: AZKAR — Morning & Evening
// ══════════════════════════════════════════════════════════
const AZKAR_DATA = {
  morning: [
    { id:'m1', arabic:'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ', trans:'أصبحنا على فطرة الإسلام وكلمة الإخلاص ودين نبينا محمد ﷺ وملة أبينا إبراهيم', ref:'رواه مسلم', count:1 },
    { id:'m2', arabic:'اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ وَإِلَيْكَ النُّشُورُ', trans:'اللهم بقدرتك وتوفيقك أصبحنا وبه نحيا ونموت وإليك مرجعنا', ref:'رواه الترمذي', count:1 },
    { id:'m3', arabic:'أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ — اللَّهُ لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ...', trans:'آية الكرسي — من قرأها في الصباح حُفظ حتى المساء', ref:'رواه النسائي', count:1 },
    { id:'m4', arabic:'اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ', trans:'سيد الاستغفار — من قاله موقناً به ومات من يومه دخل الجنة', ref:'رواه البخاري', count:1 },
    { id:'m5', arabic:'اللَّهُمَّ عَافِنِي فِي بَدَنِي، اللَّهُمَّ عَافِنِي فِي سَمْعِي، اللَّهُمَّ عَافِنِي فِي بَصَرِي', trans:'اللهم اعفني في جسدي وسمعي وبصري', ref:'رواه أبو داود', count:3 },
    { id:'m6', arabic:'اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ', trans:'اللهم إني أسألك العفو والعافية في الدنيا والآخرة', ref:'رواه ابن ماجه', count:1 },
    { id:'m7', arabic:'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ', trans:'من قالها ثلاثاً لم يضره شيء حتى يمسي', ref:'رواه أبو داود', count:3 },
    { id:'m8', arabic:'رَضِيتُ بِاللَّهِ رَبًّا وَبِالْإِسْلَامِ دِينًا وَبِمُحَمَّدٍ ﷺ نَبِيًّا', trans:'من قالها ثلاثاً كان حقاً على الله أن يُرضيه يوم القيامة', ref:'رواه الترمذي', count:3 },
  ],
  evening: [
    { id:'e1', arabic:'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ', trans:'أمسينا على فطرة الإسلام وكلمة الإخلاص ودين نبينا محمد ﷺ', ref:'رواه مسلم', count:1 },
    { id:'e2', arabic:'اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ وَإِلَيْكَ الْمَصِيرُ', trans:'اللهم بقدرتك وتوفيقك أمسينا وبه نحيا ونموت وإليك مرجعنا', ref:'رواه الترمذي', count:1 },
    { id:'e3', arabic:'اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ — سيد الاستغفار مساءً', trans:'من قاله مساءً موقناً به ومات من ليلته دخل الجنة', ref:'رواه البخاري', count:1 },
    { id:'e4', arabic:'اللَّهُمَّ إِنِّي أَمْسَيْتُ أُشْهِدُكَ وَأُشْهِدُ حَمَلَةَ عَرْشِكَ وَمَلَائِكَتَكَ', trans:'اللهم ما أمسى بي من نعمة أو بأحد من خلقك فمنك وحدك لا شريك لك', ref:'رواه أبو داود', count:4 },
    { id:'e5', arabic:'اللَّهُمَّ عَافِنِي فِي بَدَنِي، اللَّهُمَّ عَافِنِي فِي سَمْعِي، اللَّهُمَّ عَافِنِي فِي بَصَرِي', trans:'اللهم اعفني في جسدي وسمعي وبصري — لا إله إلا أنت', ref:'رواه أبو داود', count:3 },
    { id:'e6', arabic:'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ', trans:'من قالها ثلاثاً حين يمسي لم يضره حُمَةٌ تلك الليلة', ref:'رواه الترمذي', count:3 },
    { id:'e7', arabic:'اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ', trans:'اللهم إني أسألك العفو والعافية في الدنيا والآخرة', ref:'رواه ابن ماجه', count:1 },
    { id:'e8', arabic:'اللَّهُمَّ قِنِي عَذَابَكَ يَوْمَ تَبْعَثُ عِبَادَكَ', trans:'اللهم قني عذابك يوم تبعث عبادك — سبع مرات', ref:'رواه أبو داود', count:7 },
  ]
};

function loadAzkarState() {
  if (!currentUser) return;
  const saved = LS.get('madawama_azkar_' + currentUser.uid + '_' + todayKey);
  if (saved) { azkarState = saved; }
  else { azkarState = { morning:{}, evening:{} }; }
}

function saveAzkarState() {
  if (!currentUser) return;
  LS.set('madawama_azkar_' + currentUser.uid + '_' + todayKey, azkarState);
}

window.switchAzkarTab = function(tab, el) {
  curAzkarTab = tab;
  document.querySelectorAll('.azkar-tab').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  renderAzkarList();
};

function renderAzkarList() {
  const list = document.getElementById('azkarList');
  if (!list) return;
  const data = AZKAR_DATA[curAzkarTab];
  const stateSection = azkarState[curAzkarTab] || {};
  list.innerHTML = '';
  data.forEach((z, idx) => {
    const progress = stateSection[z.id] || 0;
    const done = progress >= z.count;
    const pct  = Math.min(100, Math.round(progress / z.count * 100));
    const bonusEarned = done && stateSection[z.id + '_bonus'];
    list.innerHTML += `
      <div class="zikr-card ${done?'completed':''}" id="zikr-${z.id}">
        <div class="zikr-arabic">${z.arabic}</div>
        <div class="zikr-trans">${z.trans}</div>
        <div class="zikr-footer">
          <div>
            <div class="zikr-ref">${z.ref}</div>
            <div class="zikr-bonus-badge">✨ +10 نقطة بونص</div>
          </div>
          <div class="zikr-counter-wrap">
            ${done
              ? `<div class="zikr-count-display" style="color:var(--green)">✓</div>`
              : `<div class="zikr-count-display" id="zdisplay-${z.id}">${progress}</div>
                 <button class="zikr-btn" onclick="incrementZikr('${z.id}', ${z.count})">+</button>`
            }
          </div>
        </div>
        <div class="zikr-total-label">${done ? `أتممت ${z.count} مرة ✅` : `${progress} / ${z.count}`}</div>
        <div class="zikr-progress"><div class="zikr-progress-fill" style="width:${pct}%"></div></div>
      </div>`;
  });
}

window.incrementZikr = function(id, total) {
  if (!azkarState[curAzkarTab]) azkarState[curAzkarTab] = {};
  const cur = azkarState[curAzkarTab][id] || 0;
  if (cur >= total) return;
  azkarState[curAzkarTab][id] = cur + 1;
  saveAzkarState();

  if (navigator.vibrate) navigator.vibrate(20);

  if (azkarState[curAzkarTab][id] >= total) {
    // Bonus if not already given
    if (!azkarState[curAzkarTab][id + '_bonus']) {
      azkarState[curAzkarTab][id + '_bonus'] = true;
      saveAzkarState();
      if (userData) {
        userData.points = (userData.points || 0) + 10;
        saveUserData();
        updateStatsUI(userData.points, userData.streak, userData.totalPrayed);
      }
      showToast('✨ ما شاء الله! +10 نقطة بونص على الذكر');
    }
    renderAzkarList();
  } else {
    // Just update the count display without full re-render
    const el = document.getElementById('zdisplay-' + id);
    if (el) el.textContent = azkarState[curAzkarTab][id];
    const card = document.getElementById('zikr-' + id);
    if (card) {
      const prog = card.querySelector('.zikr-progress-fill');
      if (prog) prog.style.width = Math.round(azkarState[curAzkarTab][id] / total * 100) + '%';
      const lbl = card.querySelector('.zikr-total-label');
      if (lbl) lbl.textContent = `${azkarState[curAzkarTab][id]} / ${total}`;
    }
  }
};

window.resetAzkar = function() {
  if (!confirm('إعادة تعيين كل الأذكار؟')) return;
  azkarState = { morning:{}, evening:{} };
  saveAzkarState();
  renderAzkarList();
  showToast('🔄 تم إعادة تعيين الأذكار');
};

// ══════════════════════════════════════════════════════════
//  FIX 4: TASBIH
// ══════════════════════════════════════════════════════════
function loadTasbihState() {
  if (!currentUser) return;
  const saved = LS.get('madawama_tasbih_' + currentUser.uid);
  if (saved) {
    if (saved.items) tasbihItems = saved.items;
    curTasbihIdx = saved.curIdx || 0;
    tasbihCount  = saved.count || 0;
  }
}

function saveTasbihState() {
  if (!currentUser) return;
  LS.set('madawama_tasbih_' + currentUser.uid, { items: tasbihItems, curIdx: curTasbihIdx, count: tasbihCount });
}

function renderTasbihOptions() {
  const wrap = document.getElementById('tasbihOptions');
  if (!wrap) return;
  wrap.innerHTML = tasbihItems.map((t, i) => `
    <div class="tasbih-option ${i===curTasbihIdx?'active':''}" onclick="selectTasbih(${i})">
      <div class="tasbih-option-text">${t.text.length > 40 ? t.text.substring(0,40)+'...' : t.text}</div>
      <div class="tasbih-option-sub">الهدف: ${t.target} مرة — أُتمم: ${t.sessions} جلسة</div>
    </div>`).join('');
}

window.selectTasbih = function(idx) {
  tasbihCount = 0;
  curTasbihIdx = idx;
  saveTasbihState();
  renderTasbihOptions();
  updateTasbihDisplay();
  document.getElementById('tasbihCompletedBanner').classList.remove('show');
};

window.tasbihTap = function() {
  const item = tasbihItems[curTasbihIdx];
  if (!item) return;
  if (tasbihCount >= item.target) return;

  tasbihCount++;
  if (navigator.vibrate) navigator.vibrate(15);

  // Pulse animation
  const countEl = document.getElementById('tasbihCount');
  if (countEl) {
    countEl.classList.remove('pulse');
    void countEl.offsetWidth;
    countEl.classList.add('pulse');
    setTimeout(() => countEl.classList.remove('pulse'), 150);
    countEl.textContent = tasbihCount;
  }

  const pct = Math.min(100, Math.round(tasbihCount / item.target * 100));
  const fill = document.getElementById('tasbihProgressFill');
  if (fill) fill.style.width = pct + '%';
  const info = document.getElementById('tasbihTargetInfo');
  if (info) info.textContent = `${tasbihCount} من ${item.target}`;

  if (tasbihCount >= item.target) {
    item.sessions++;
    saveTasbihState();
    // bonus points
    if (userData) {
      userData.points = (userData.points || 0) + 15;
      saveUserData();
      updateStatsUI(userData.points, userData.streak, userData.totalPrayed);
    }
    const banner = document.getElementById('tasbihCompletedBanner');
    if (banner) {
      banner.classList.add('show');
      document.getElementById('tasbihCompletedSub').textContent = `${item.text} — ${item.sessions} جلسات مكتملة | +15 نقطة 🌿`;
    }
    launchConfetti();
    renderTasbihOptions();
    const sessEl = document.getElementById('tasbihTotalSessions');
    if (sessEl) sessEl.textContent = `إجمالي الجلسات المكتملة: ${item.sessions}`;
  } else {
    saveTasbihState();
  }
};

window.resetTasbih = function() {
  tasbihCount = 0;
  document.getElementById('tasbihCompletedBanner').classList.remove('show');
  updateTasbihDisplay();
  saveTasbihState();
};

window.tasbihUndo = function() {
  if (tasbihCount > 0) { tasbihCount--; updateTasbihDisplay(); saveTasbihState(); }
};

function updateTasbihDisplay() {
  const item = tasbihItems[curTasbihIdx];
  if (!item) return;
  const countEl = document.getElementById('tasbihCount');
  if (countEl) countEl.textContent = tasbihCount;
  const pct = Math.min(100, Math.round(tasbihCount / item.target * 100));
  const fill = document.getElementById('tasbihProgressFill');
  if (fill) fill.style.width = pct + '%';
  const info = document.getElementById('tasbihTargetInfo');
  if (info) info.textContent = `${tasbihCount} من ${item.target}`;
  const phrase = document.getElementById('tasbihPhraseDisplay');
  if (phrase) phrase.textContent = item.text;
  const sessEl = document.getElementById('tasbihTotalSessions');
  if (sessEl) sessEl.textContent = item.sessions > 0 ? `إجمالي الجلسات المكتملة: ${item.sessions}` : '';
}

// ══════════════════════════════════════════════════════════
//  FIX 5: ASMA UL HUSNA
// ══════════════════════════════════════════════════════════
const ASMA_DATA = [
  { num:1,  ar:'الله',        tr:'Allah',        mean:'اسم الجلالة — الإله المعبود بحق' },
  { num:2,  ar:'الرَّحْمَن', tr:'Ar-Rahmaan',   mean:'ذو الرحمة الواسعة لكل الخلق' },
  { num:3,  ar:'الرَّحِيم',  tr:'Ar-Raheem',    mean:'ذو الرحمة الخاصة بالمؤمنين' },
  { num:4,  ar:'الْمَلِك',   tr:'Al-Malik',     mean:'الملك المالك لكل شيء' },
  { num:5,  ar:'الْقُدُّوس', tr:'Al-Quddoos',   mean:'المنزّه عن كل عيب ونقص' },
  { num:6,  ar:'السَّلَام',  tr:'As-Salaam',    mean:'ذو السلامة من كل نقص' },
  { num:7,  ar:'الْمُؤْمِن', tr:'Al-Mu\'min',   mean:'المصدّق لرسله وعباده المؤمنين' },
  { num:8,  ar:'الْمُهَيْمِن',tr:'Al-Muhaymin', mean:'الرقيب الحافظ على كل شيء' },
  { num:9,  ar:'الْعَزِيز',  tr:'Al-Azeez',     mean:'الغالب الذي لا يُغلب' },
  { num:10, ar:'الْجَبَّار', tr:'Al-Jabbaar',   mean:'الذي يجبر كسر العباد' },
  { num:11, ar:'الْمُتَكَبِّر',tr:'Al-Mutakabbir',mean:'المتكبر على الظالمين' },
  { num:12, ar:'الْخَالِق',  tr:'Al-Khaaliq',   mean:'الموجد للأشياء من العدم' },
  { num:13, ar:'الْبَارِئ',  tr:'Al-Baari\'',   mean:'المنشئ للخلق بلا مثال' },
  { num:14, ar:'الْمُصَوِّر',tr:'Al-Musawwir',  mean:'الذي يصوّر الخلق كيف يشاء' },
  { num:15, ar:'الْغَفَّار', tr:'Al-Ghaffaar',  mean:'كثير المغفرة لعباده' },
  { num:16, ar:'الْقَهَّار', tr:'Al-Qahhaar',   mean:'الغالب لكل شيء بقدرته' },
  { num:17, ar:'الْوَهَّاب', tr:'Al-Wahhaab',   mean:'كثير العطاء بلا حساب' },
  { num:18, ar:'الرَّزَّاق', tr:'Ar-Razzaaq',   mean:'الموسّع الرزق لكل مخلوق' },
  { num:19, ar:'الْفَتَّاح', tr:'Al-Fattaah',   mean:'يفتح أبواب الرحمة والرزق' },
  { num:20, ar:'الْعَلِيم',  tr:'Al-Aleem',     mean:'المحيط علمه بكل شيء' },
  { num:21, ar:'الْقَابِض',  tr:'Al-Qaabid',    mean:'القابض الأرزاق بحكمته' },
  { num:22, ar:'الْبَاسِط',  tr:'Al-Baasit',    mean:'الموسّع الأرزاق لمن يشاء' },
  { num:23, ar:'الْخَافِض',  tr:'Al-Khaafid',   mean:'يخفض من يشاء بعدله' },
  { num:24, ar:'الرَّافِع',  tr:'Ar-Raafi\'',   mean:'يرفع من يشاء بفضله' },
  { num:25, ar:'الْمُعِزّ',  tr:'Al-Mu\'izz',   mean:'يُعزّ من يشاء من عباده' },
  { num:26, ar:'الْمُذِلّ',  tr:'Al-Mudhill',   mean:'يُذلّ من يشاء من الظالمين' },
  { num:27, ar:'السَّمِيع',  tr:'As-Samee\'',   mean:'يسمع كل الأصوات والأسرار' },
  { num:28, ar:'الْبَصِير',  tr:'Al-Baseer',    mean:'يرى كل شيء ظاهراً وباطناً' },
  { num:29, ar:'الْحَكَم',   tr:'Al-Hakam',     mean:'الحاكم العادل بين العباد' },
  { num:30, ar:'الْعَدْل',   tr:'Al-Adl',       mean:'الذي يعدل في كل أحكامه' },
  { num:31, ar:'اللَّطِيف',  tr:'Al-Lateef',    mean:'اللطيف بعباده خفي الألطاف' },
  { num:32, ar:'الْخَبِير',  tr:'Al-Khabeer',   mean:'المطّلع على خفايا الأمور' },
  { num:33, ar:'الْحَلِيم',  tr:'Al-Haleem',    mean:'لا يعجل بالعقوبة رحمةً' },
  { num:34, ar:'الْعَظِيم',  tr:'Al-Adheem',    mean:'عظيم القدر والشأن' },
  { num:35, ar:'الْغَفُور',  tr:'Al-Ghafoor',   mean:'واسع المغفرة لعباده' },
  { num:36, ar:'الشَّكُور',  tr:'Ash-Shakoor',  mean:'يُثيب على القليل بالكثير' },
  { num:37, ar:'الْعَلِيّ',  tr:'Al-Ali',       mean:'المتعالي على كل مخلوقاته' },
  { num:38, ar:'الْكَبِير',  tr:'Al-Kabeer',    mean:'الكبير شأناً فوق كل شيء' },
  { num:39, ar:'الْحَفِيظ',  tr:'Al-Hafeedh',   mean:'يحفظ كل شيء بعلمه' },
  { num:40, ar:'الْمُقِيت',  tr:'Al-Muqeet',    mean:'المقتدر القائم على تغذية الخلق' },
  { num:41, ar:'الْحَسِيب',  tr:'Al-Haseeb',    mean:'الكافي الحاسب لعباده' },
  { num:42, ar:'الْجَلِيل',  tr:'Al-Jaleel',    mean:'ذو الجلال والعظمة والكمال' },
  { num:43, ar:'الْكَرِيم',  tr:'Al-Kareem',    mean:'الجواد الكثير الخير والعطاء' },
  { num:44, ar:'الرَّقِيب',  tr:'Ar-Raqeeb',    mean:'المراقب لأعمال عباده' },
  { num:45, ar:'الْمُجِيب',  tr:'Al-Mujeeb',    mean:'يجيب دعوة الداعين' },
  { num:46, ar:'الْوَاسِع',  tr:'Al-Waasi\'',   mean:'واسع الرحمة والعلم والقدرة' },
  { num:47, ar:'الْحَكِيم',  tr:'Al-Hakeem',    mean:'وضع كل شيء في موضعه' },
  { num:48, ar:'الْوَدُود',  tr:'Al-Wadood',    mean:'يحب عباده المؤمنين' },
  { num:49, ar:'الْمَجِيد',  tr:'Al-Majeed',    mean:'العظيم المجد والكرم' },
  { num:50, ar:'الْبَاعِث',  tr:'Al-Baa\'ith',  mean:'يبعث الموتى للحساب' },
  { num:51, ar:'الشَّهِيد',  tr:'Ash-Shaheed',  mean:'شاهد على كل شيء' },
  { num:52, ar:'الْحَق',     tr:'Al-Haqq',      mean:'الثابت الوجود الدائم' },
  { num:53, ar:'الْوَكِيل',  tr:'Al-Wakeel',    mean:'الكافي لمن توكّل عليه' },
  { num:54, ar:'الْقَوِيّ',  tr:'Al-Qawi',      mean:'ذو القوة الكاملة التامة' },
  { num:55, ar:'الْمَتِين',  tr:'Al-Mateen',    mean:'الشديد القوة لا يعتريه وهن' },
  { num:56, ar:'الْوَلِيّ',  tr:'Al-Wali',      mean:'يتولى أمور عباده المؤمنين' },
  { num:57, ar:'الْحَمِيد',  tr:'Al-Hameed',    mean:'المحمود في كل أفعاله' },
  { num:58, ar:'الْمُحْصِي', tr:'Al-Muhsi',     mean:'أحصى كل شيء بعلمه' },
  { num:59, ar:'الْمُبْدِئ', tr:'Al-Mubdi\'',   mean:'أوجد الخلق من العدم' },
  { num:60, ar:'الْمُعِيد',  tr:'Al-Mu\'eed',   mean:'يُعيد الخلق بعد الفناء' },
  { num:61, ar:'الْمُحْيِي', tr:'Al-Muhyi',     mean:'يُحيي الأموات بأمره' },
  { num:62, ar:'الْمُمِيت',  tr:'Al-Mumeet',    mean:'يميت كل حي بأجله' },
  { num:63, ar:'الْحَيّ',    tr:'Al-Hayy',      mean:'الدائم الحياة لا ينتهي' },
  { num:64, ar:'الْقَيُّوم', tr:'Al-Qayyoom',   mean:'القائم بنفسه المقيم لغيره' },
  { num:65, ar:'الْوَاجِد',  tr:'Al-Waajid',    mean:'الغني الذي لا يفقده شيء' },
  { num:66, ar:'الْمَاجِد',  tr:'Al-Maajid',    mean:'الواسع الكرم العظيم الشرف' },
  { num:67, ar:'الْوَاحِد',  tr:'Al-Waahid',    mean:'لا شريك له في ذاته' },
  { num:68, ar:'الأَحَد',    tr:'Al-Ahad',      mean:'المنفرد بالوحدانية التامة' },
  { num:69, ar:'الصَّمَد',   tr:'As-Samad',     mean:'المقصود في الحوائج كلها' },
  { num:70, ar:'الْقَادِر',  tr:'Al-Qaadir',    mean:'القادر على كل شيء' },
  { num:71, ar:'الْمُقْتَدِر',tr:'Al-Muqtadir', mean:'نافذ القدرة في كل الأمور' },
  { num:72, ar:'الْمُقَدِّم',tr:'Al-Muqaddim',  mean:'يُقدّم من يشاء بفضله' },
  { num:73, ar:'الْمُؤَخِّر',tr:'Al-Mu\'akhkhir',mean:'يُؤخر من يشاء بحكمته' },
  { num:74, ar:'الأَوَّل',   tr:'Al-Awwal',     mean:'السابق على كل ما سواه' },
  { num:75, ar:'الآخِر',     tr:'Al-Aakhir',    mean:'الباقي بعد فناء كل شيء' },
  { num:76, ar:'الظَّاهِر',  tr:'Az-Zaahir',    mean:'العالي فوق كل شيء' },
  { num:77, ar:'الْبَاطِن',  tr:'Al-Baatin',    mean:'المحيط بعلمه بكل شيء' },
  { num:78, ar:'الْوَالِي',  tr:'Al-Waali',     mean:'المتصرف في أمور خلقه' },
  { num:79, ar:'الْمُتَعَالِ',tr:'Al-Muta\'aali',mean:'المستعلي بعظمته على خلقه' },
  { num:80, ar:'الْبَرّ',    tr:'Al-Barr',      mean:'المحسن لعباده بكل بر' },
  { num:81, ar:'التَّوَّاب', tr:'At-Tawwaab',   mean:'يقبل توبة عباده ويرجع بالمغفرة' },
  { num:82, ar:'الْمُنْتَقِم',tr:'Al-Muntaqim', mean:'ينتقم من المجرمين بعدله' },
  { num:83, ar:'الْعَفُوّ',  tr:'Al-Afuww',     mean:'يعفو ويمحو الذنوب' },
  { num:84, ar:'الرَّؤُوف',  tr:'Ar-Ra\'oof',   mean:'بالغ الرحمة والشفقة' },
  { num:85, ar:'مَالِكُ الْمُلْك',tr:'Maalik-ul-Mulk',mean:'يملك ملكه يؤتيه من يشاء' },
  { num:86, ar:'ذُو الْجَلَالِ وَالإِكْرَامِ',tr:'Dhul-Jalaal',mean:'صاحب العظمة والتكريم' },
  { num:87, ar:'الْمُقْسِط', tr:'Al-Muqsit',    mean:'العادل في قضائه وحكمه' },
  { num:88, ar:'الْجَامِع',  tr:'Al-Jaami\'',   mean:'يجمع الخلق ليوم الحساب' },
  { num:89, ar:'الْغَنِيّ',  tr:'Al-Ghani',     mean:'الغني عن كل شيء سواه' },
  { num:90, ar:'الْمُغْنِي', tr:'Al-Mughni',    mean:'يُغني من يشاء من عباده' },
  { num:91, ar:'الْمَانِع',  tr:'Al-Maani\'',   mean:'يمنع ما يشاء من عباده' },
  { num:92, ar:'الضَّار',    tr:'Ad-Daarr',     mean:'يضر بعدله من يستحق' },
  { num:93, ar:'النَّافِع',  tr:'An-Naafi\'',   mean:'ينفع من يشاء من عباده' },
  { num:94, ar:'النُّور',    tr:'An-Noor',      mean:'نور السماوات والأرض' },
  { num:95, ar:'الْهَادِي',  tr:'Al-Haadi',     mean:'يهدي من يشاء لما يشاء' },
  { num:96, ar:'الْبَدِيع',  tr:'Al-Badee\'',   mean:'مبدع الخلق على غير مثال' },
  { num:97, ar:'الْبَاقِي',  tr:'Al-Baaqi',     mean:'الباقي الدائم لا ينتهي' },
  { num:98, ar:'الْوَارِث',  tr:'Al-Waarith',   mean:'يرث الأرض ومن عليها' },
  { num:99, ar:'الرَّشِيد',  tr:'Ar-Rasheed',   mean:'المرشد لعباده إلى الصواب' },
];

let asmaAll = [...ASMA_DATA];

function renderAsmaGrid(data) {
  const grid = document.getElementById('asmaGrid');
  if (!grid) return;
  if (!data || data.length === 0) {
    grid.innerHTML = '<div style="color:var(--text-faint);font-size:14px;text-align:center;padding:40px;grid-column:1/-1">لا نتائج</div>';
    return;
  }
  grid.innerHTML = data.map(a => `
    <div class="asma-card">
      <div class="asma-num">${a.num}</div>
      <div class="asma-arabic">${a.ar}</div>
      <div class="asma-transliteration">${a.tr}</div>
      <div class="asma-meaning">${a.mean}</div>
    </div>`).join('');
}

window.filterAsma = function(q) {
  const t = q.trim().toLowerCase();
  if (!t) { renderAsmaGrid(asmaAll); return; }
  const filtered = asmaAll.filter(a =>
    a.ar.includes(q) || a.tr.toLowerCase().includes(t) || a.mean.includes(q)
  );
  renderAsmaGrid(filtered);
};

// ══════════════════════════════════════════════════════════
//  SHOW APP
// ══════════════════════════════════════════════════════════
function showApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'block';
  document.getElementById('loaderScreen').style.display = 'none';

  const name = currentUser?.name || 'مستخدم';
  ['welcomeName','levelUserName'].forEach(id => { const e=document.getElementById(id); if(e) e.textContent=name; });
  const av = document.getElementById('navAvatar'); if(av) av.textContent = name.charAt(0);
  const ci = document.getElementById('cityInput'); if(ci) ci.value = currentUser?.city || '';
  const nt = document.getElementById('notifToggle'); if(nt) nt.classList.toggle('on', settings.notifications);
  const si = document.getElementById('settingUserInfo'); if(si) si.textContent = `${name} — ${currentUser?.email || ''}`;

  showHijriDate();
  showDailyAyah();
  updateStatsUI(userData.points||0, userData.streak||0, userData.totalPrayed||0);
  renderPrayerGrid();
  updateProgress();
  updateRing();
  startCountdown();
  scheduleNotifications();
  renderTasbihOptions();
  updateTasbihDisplay();

  showPage('home', true);
}

window.hideCompletion = function() { document.getElementById('completionOverlay').classList.remove('show'); };

// ══════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════
function buildDashboard() {
  buildWeek(); buildCal(); buildPrayerStats(); buildTip();
}

function buildWeek() {
  const grid = document.getElementById('weekGrid');
  if (!grid) return;
  const dayNames = ['أحد','اثن','ثلاث','أرب','خمس','جمع','سبت'];
  const today = new Date().getDay();
  grid.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - (today - i));
    const key = dateKey(d);
    const count = i <= today ? Object.values(userData?.prayers?.[key]||{}).filter(Boolean).length : null;
    const type  = count===null ? 'missed' : count===5 ? 'full' : count>0 ? 'partial' : 'missed';
    grid.innerHTML += `<div class="week-day ${type} ${i===today?'today':''}">
      <span style="font-size:9px;color:var(--text-faint)">${dayNames[i]}</span>
      <span style="font-size:10px">${count!==null?count+'/5':'–'}</span>
    </div>`;
  }
}

function buildCal() {
  const grid = document.getElementById('calGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 27; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const key = dateKey(d);
    const count = Object.values(userData?.prayers?.[key]||{}).filter(Boolean).length;
    const type = i===0 ? (count===5?'full':count>0?'partial':'today-mark') : (count===5?'full':count>2?'partial':'empty');
    grid.innerHTML += `<div class="cal-day ${type}" title="${d.getDate()}/${d.getMonth()+1} — ${count}/5">${d.getDate()}</div>`;
  }
}

function buildPrayerStats() {
  const el = document.getElementById('prayerStatBars');
  if (!el || !userData?.prayers) return;
  const counts = { fajr:0, dhuhr:0, asr:0, maghrib:0, isha:0 };
  let days = 0;
  Object.values(userData.prayers).forEach(dp => { days++; PRAYER_KEYS.forEach(k => { if(dp[k]) counts[k]++; }); });
  if (days === 0) { el.innerHTML = '<div style="color:var(--text-faint);font-size:13px;padding:8px 0">لا توجد بيانات بعد</div>'; return; }
  el.innerHTML = PRAYER_KEYS.map(k => {
    const pct = Math.round(counts[k]/days*100);
    const cls = pct>=70?'high':pct>=40?'mid':'low';
    const color = pct>=70?'var(--green)':pct>=40?'var(--gold)':'var(--red)';
    return `<div class="psb-row"><span class="psb-label">${PRAYER_NAMES_AR[k]}</span><div class="psb-track"><div class="psb-fill ${cls}" style="width:${pct}%"></div></div><span class="psb-pct" style="color:${color}">${pct}%</span></div>`;
  }).join('');
}

function buildTip() {
  const el = document.getElementById('dashTip'); const text = document.getElementById('dashTipText');
  if (!el || !text || !userData?.prayers) return;
  const counts = { fajr:0, dhuhr:0, asr:0, maghrib:0, isha:0 };
  let days = 0;
  Object.values(userData.prayers).forEach(dp => { days++; PRAYER_KEYS.forEach(k => { if(dp[k]) counts[k]++; }); });
  if (days < 3) { el.style.display='none'; return; }
  const weakest = PRAYER_KEYS.reduce((a,b) => counts[a]<=counts[b]?a:b);
  const tips = { fajr:'الفجر هي أصعب الصلوات — جرّب تضبط منبهاً قبل الأذان بـ 15 دقيقة 🌅', dhuhr:'الظهر وقت الانشغال — ضبّط تنبيهاً وخصّص 10 دقائق من الغداء 🕛', asr:'العصر يفوت كثيراً — اربطها بعادة يومية كشرب الشاي ☀️', maghrib:'المغرب وقت قصير — ابدأ التحضّر قبل الأذان بدقائق 🌅', isha:'اجعل العشاء آخر ما تفعله قبل النوم 🌙' };
  text.textContent = tips[weakest];
  el.style.display = 'block';
}

// ══════════════════════════════════════════════════════════
//  QURAN
// ══════════════════════════════════════════════════════════
const AYAT_CONTENT = [
  { arabic:'﴿ إِنَّ الصَّلَاةَ كَانَتْ عَلَى الْمُؤْمِنِينَ كِتَابًا مَّوْقُوتًا ﴾', trans:'إن الصلاة فريضة واجبة على المؤمنين في أوقات محددة', ref:'سورة النساء — آية 103' },
  { arabic:'﴿ وَأَقِمِ الصَّلَاةَ إِنَّ الصَّلَاةَ تَنْهَىٰ عَنِ الْفَحْشَاءِ وَالْمُنكَرِ ﴾', trans:'أدِّ الصلاة، فإنها تصرف صاحبها عن المعاصي', ref:'سورة العنكبوت — آية 45' },
  { arabic:'﴿ حَٰفِظُوا عَلَى الصَّلَوَٰتِ وَالصَّلَوٰةِ الْوُسْطَىٰ وَقُومُوا لِلَّهِ قَٰنِتِينَ ﴾', trans:'حافظوا على أداء جميع الصلوات وبخاصة صلاة العصر', ref:'سورة البقرة — آية 238' },
  { arabic:'﴿ قَدْ أَفْلَحَ الْمُؤْمِنُونَ ۞ الَّذِينَ هُمْ فِي صَلَاتِهِمْ خَاشِعُونَ ﴾', trans:'قد فاز المؤمنون الذين يصلّون بقلوب خاشعة لله', ref:'سورة المؤمنون — آية 1-2' },
  { arabic:'﴿ وَاسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ ۚ وَإِنَّهَا لَكَبِيرَةٌ إِلَّا عَلَى الْخَاشِعِينَ ﴾', trans:'استعينوا بالصبر والصلاة على أمور الدنيا', ref:'سورة البقرة — آية 45' },
  { arabic:'﴿ فَوَيْلٌ لِّلْمُصَلِّينَ ۞ الَّذِينَ هُمْ عَن صَلَاتِهِمْ سَاهُونَ ﴾', trans:'العذاب لمن يصلّون ثم يتهاونون بها أو يُخرجونها عن وقتها', ref:'سورة الماعون — آية 4-5' },
];
const HADITH_CONTENT = [
  { narr:'عن عبدالله بن مسعود رضي الله عنه:', text:'سألت النبي ﷺ أي العمل أحب إلى الله؟ قال: «الصلاة على وقتها» ثم: «بر الوالدين» ثم: «الجهاد في سبيل الله»', ref:'متفق عليه' },
  { narr:'عن جابر بن عبدالله رضي الله عنه:', text:'قال رسول الله ﷺ: «مثل الصلوات الخمس كمثل نهر جارٍ غمر على باب أحدكم، يغتسل منه كل يوم خمس مرات»', ref:'رواه مسلم' },
  { narr:'عن أبي هريرة رضي الله عنه:', text:'قال رسول الله ﷺ: «أول ما يُحاسب به العبد يوم القيامة صلاته، فإن صلحت فقد أفلح وأنجح»', ref:'رواه الترمذي' },
  { narr:'عن عثمان بن عفان رضي الله عنه:', text:'قال رسول الله ﷺ: «من صلّى العشاء في جماعة فكأنما قام نصف الليل، ومن صلّى الصبح في جماعة فكأنما قام الليل كله»', ref:'رواه مسلم' },
  { narr:'عن أبي هريرة رضي الله عنه:', text:'قال رسول الله ﷺ: «الصلوات الخمس، والجمعة إلى الجمعة، ورمضان إلى رمضان، مكفّرات ما بينهن إذا اجتُنبت الكبائر»', ref:'رواه مسلم' },
];

window.switchQuranTab = function(tab, el) {
  document.querySelectorAll('.qtab').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  curQuranTab = tab;
  renderQuranList(tab);
};

function renderQuranList(tab) {
  const list = document.getElementById('quranList');
  if (!list) return;
  const data = (tab==='ayat') ? AYAT_CONTENT : HADITH_CONTENT;
  list.innerHTML = '';
  if (tab === 'ayat') {
    data.forEach(v => { list.innerHTML += `<div class="verse-card"><div class="verse-arabic">${v.arabic}</div><div class="verse-trans">${v.trans}</div><div class="verse-ref">${v.ref}</div></div>`; });
  } else {
    data.forEach(h => { list.innerHTML += `<div class="hadith-big"><div class="hadith-narr">${h.narr}</div><div class="hadith-main">${h.text}</div><div class="hadith-ref">${h.ref}</div></div>`; });
  }
}

// ══════════════════════════════════════════════════════════
//  CHALLENGES
// ══════════════════════════════════════════════════════════
function buildChallenges() {
  const el = document.getElementById('challengeList');
  if (!el) return;
  const pd = userData?.prayers || {};
  let fajrStreak = 0;
  const tmp = new Date();
  for (let i = 0; i < 30; i++) { const key=dateKey(tmp); if(pd[key]?.fajr) fajrStreak++; else break; tmp.setDate(tmp.getDate()-1); }
  const fullDays = Object.values(pd).filter(d=>PRAYER_KEYS.filter(k=>d[k]).length===5).length;
  const totalP   = userData?.totalPrayed || 0;
  const streak   = userData?.streak || 0;
  const longest  = userData?.longestStreak || streak;
  const challenges = [
    { icon:'🏆', cls:'c-gold',   title:'أسبوع الفجر الذهبي', desc:'صلّ الفجر 7 أيام متتالية', prog:Math.min(fajrStreak,7),   total:7,   reward:'⭐ 200 نقطة + شارة ذهبية' },
    { icon:'🌿', cls:'c-green',  title:'شهر من المحافظة',    desc:'أتمم الفروض الخمسة 30 يوم', prog:Math.min(fullDays,30),  total:30,  reward:'⭐ 500 نقطة + لقب الخاشع' },
    { icon:'📿', cls:'c-blue',   title:'مئة صلاة',           desc:'سجّل 100 صلاة محافظ',       prog:Math.min(totalP,100),   total:100, reward:'⭐ 300 نقطة' },
    { icon:'🔥', cls:'c-gold',   title:'عشرة أيام متتالية',  desc:'حافظ على الستريك 10 أيام',  prog:Math.min(streak,10),    total:10,  reward:'⭐ 150 نقطة' },
    { icon:'🌙', cls:'c-purple', title:'أطول استمرار',       desc:'أعلى ستريك وصلت إليه',      prog:Math.min(longest,30),   total:30,  reward:'⭐ 400 نقطة + شارة الأواب' },
    { icon:'⭐', cls:'c-blue',   title:'ألف نقطة',           desc:'اكسب 1000 نقطة',            prog:Math.min(userData?.points||0,1000), total:1000, reward:'⭐ ترقية للمستوى المتقدم' },
  ];
  el.innerHTML = challenges.map(c => {
    const pct = Math.round(c.prog/c.total*100);
    const done = c.prog >= c.total;
    return `<div class="ch-card ${done?'done':''}"><div class="ch-icon ${c.cls}">${c.icon}</div><div class="ch-info"><div class="ch-title">${c.title} ${done?'✅':''}</div><div class="ch-desc">${c.desc}</div><div class="ch-prog-bg"><div class="ch-prog-fill" style="width:${pct}%"></div></div><div class="ch-reward">${c.reward}</div></div><div class="ch-count ${done?'done':''}">${c.prog}/${c.total}</div></div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════
const ALL_PAGES = ['home','dashboard','quran','azkar','tasbih','asma','challenges','settings'];

window.showPage = function(p, initial = false) {
  const idx = ALL_PAGES.indexOf(p);
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
  const pageEl = document.getElementById('page-' + p);
  if (pageEl) pageEl.classList.add('active');
  const navLinks = document.querySelectorAll('.nav-link');
  if (navLinks[idx]) navLinks[idx].classList.add('active');
  if (!initial) {
    if (p === 'dashboard')  buildDashboard();
    if (p === 'challenges') buildChallenges();
    if (p === 'quran')      renderQuranList(curQuranTab);
    if (p === 'azkar')      renderAzkarList();
    if (p === 'asma')       renderAsmaGrid(asmaAll);
    if (p === 'tasbih')     { renderTasbihOptions(); updateTasbihDisplay(); }
  }
  if (!initial) window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ══════════════════════════════════════════════════════════
//  SCREEN HELPERS
// ══════════════════════════════════════════════════════════
function showLoader(msg) {
  document.getElementById('loaderScreen').style.display = 'flex';
  document.getElementById('loaderMsg').textContent = msg || 'جاري التحميل...';
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'none';
}
function hideLoader() { document.getElementById('loaderScreen').style.display = 'none'; }
function showAuth() {
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('loaderScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'none';
  const lb = document.getElementById('loginBtn'); if(lb){lb.disabled=false;lb.textContent='دخول';}
  const rb = document.getElementById('regBtn');   if(rb){rb.disabled=false;rb.textContent='إنشاء الحساب';}
}

let toastTimer = null;
window.showToast = function(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
};

function showAuthMsg(msg, type) {
  const el = document.getElementById('authMsg'); if (!el) return;
  el.textContent = msg; el.className = 'auth-msg '+type; el.style.display = 'block';
}
function clearAuthMsg() {
  const el = document.getElementById('authMsg'); if (el) { el.style.display='none'; el.textContent=''; }
}

// ══════════════════════════════════════════════════════════
//  DATE HELPERS
// ══════════════════════════════════════════════════════════
function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function getTodayKey()     { return dateKey(new Date()); }
function getYesterdayKey() { const d = new Date(); d.setDate(d.getDate()-1); return dateKey(d); }

// CSS for shake animation
const style = document.createElement('style');
style.textContent = `@keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }`;
document.head.appendChild(style);

// ══════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', init);