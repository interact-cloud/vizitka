// ===== Telegram WebApp adapter (with fallback emulator) =====
const tg = (window.Telegram && window.Telegram.WebApp) || null;

const TG = {
  ready() { tg?.ready(); tg?.expand(); },
  haptic(type = 'light') {
    if (tg?.HapticFeedback) {
      if (type === 'success' || type === 'error' || type === 'warning') {
        tg.HapticFeedback.notificationOccurred(type);
      } else if (type === 'select') {
        tg.HapticFeedback.selectionChanged();
      } else {
        tg.HapticFeedback.impactOccurred(type);
      }
    } else {
      // эмуляция: лёгкий flash + микро-вибро на устройствах с API
      if (navigator.vibrate) navigator.vibrate(type === 'success' ? [30, 30, 30] : 15);
    }
  },
  showAlert(msg) {
    if (tg?.showAlert) tg.showAlert(msg);
    else alert(msg);
  },
  showConfirm(msg, cb) {
    if (tg?.showConfirm) tg.showConfirm(msg, cb);
    else cb(confirm(msg));
  },
  openLink(url) {
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, '_blank');
  },
  openTelegramLink(url) {
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, '_blank');
  },
  close() { tg?.close(); },
  user() {
    return tg?.initDataUnsafe?.user || { first_name: CLIENT.firstName };
  },
};
TG.ready();

// ===== MainButton / BackButton emulator =====
const mainBtn = document.getElementById('mainBtn');
const backBtn = document.getElementById('backBtn');
const topbarTitle = document.getElementById('topbarTitle');
const topbar = document.getElementById('topbar');

const MainButton = {
  show(text, onClick, opts = {}) {
    mainBtn.textContent = text;
    mainBtn.hidden = false;
    mainBtn.disabled = !!opts.disabled;
    mainBtn.classList.remove('progress');
    mainBtn.onclick = (e) => {
      if (mainBtn.disabled || mainBtn.classList.contains('progress')) return;
      TG.haptic('light');
      onClick(e);
    };
  },
  hide() { mainBtn.hidden = true; mainBtn.onclick = null; },
  setDisabled(d) { mainBtn.disabled = d; },
  progress(on) {
    if (on) mainBtn.classList.add('progress');
    else mainBtn.classList.remove('progress');
  },
  setText(t) { mainBtn.textContent = t; },
};

const BackButton = {
  show(onClick) {
    backBtn.hidden = false;
    backBtn.onclick = () => { TG.haptic('light'); onClick(); };
  },
  hide() { backBtn.hidden = true; backBtn.onclick = null; },
};

// ===== Navigation =====
const stack = ['home'];
let state = {
  category: 'all',
  serviceId: null,
  dayISO: null,
  slot: null,
};

function go(screen, opts = {}) {
  if (!opts.replace) stack.push(screen);
  render(screen);
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function back() {
  if (stack.length <= 1) return;
  stack.pop();
  render(stack[stack.length - 1]);
}
function resetTo(screen) {
  stack.length = 0;
  stack.push(screen);
  render(screen);
}

function render(screen) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.toggle('active', s.dataset.screen === screen);
  });
  // BackButton
  if (screen === 'home') BackButton.hide();
  else BackButton.show(back);
  // Title
  const titles = {
    home: '', catalog: 'Услуги', service: '', calendar: 'Выбор времени',
    confirm: 'Подтверждение', success: '', bookings: 'Мои записи', about: 'О мастере',
  };
  topbarTitle.textContent = titles[screen] || '';

  // Per-screen render
  if (screen === 'home') renderHome();
  if (screen === 'catalog') renderCatalog();
  if (screen === 'service') renderService();
  if (screen === 'calendar') renderCalendar();
  if (screen === 'confirm') renderConfirm();
  if (screen === 'success') renderSuccess();
  if (screen === 'bookings') renderBookings();
  if (screen === 'about') renderAbout();
}

// ===== Home =====
function renderHome() {
  MainButton.hide();
  const u = TG.user();
  document.getElementById('greeting').textContent = `Привет, ${u.first_name}`;
}

// ===== Catalog =====
function renderCatalog() {
  MainButton.hide();
  const chips = document.getElementById('catChips');
  chips.innerHTML = '';
  CATEGORIES.forEach(c => {
    const b = document.createElement('button');
    b.className = 'chip' + (c.id === state.category ? ' active' : '');
    b.textContent = c.name;
    b.onclick = () => {
      TG.haptic('select');
      state.category = c.id;
      renderCatalog();
    };
    chips.appendChild(b);
  });

  const list = document.getElementById('serviceList');
  list.innerHTML = '';
  const filtered = SERVICES.filter(s => state.category === 'all' || s.category === state.category);
  filtered.forEach(s => {
    const card = document.createElement('div');
    card.className = 'service-card';
    card.innerHTML = `
      <div class="service-thumb">${swatchSvg(s)}</div>
      <div class="service-info">
        <div class="service-name">${s.name}</div>
        <div class="service-meta">${s.duration} мин · <span class="price">от ${fmtPrice(s.priceFrom)}</span></div>
      </div>
      <div class="service-chevron">›</div>
    `;
    card.onclick = () => {
      TG.haptic('light');
      state.serviceId = s.id;
      go('service');
    };
    list.appendChild(card);
  });
}

function swatchSvg(s, w = 72, h = 72) {
  const id = `g-${s.id}`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 72 72" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${s.swatch[0]}"/>
      <stop offset="100%" stop-color="${s.swatch[1]}"/>
    </linearGradient></defs>
    <rect width="72" height="72" fill="url(#${id})"/>
    <text x="36" y="46" text-anchor="middle" font-family="Cormorant Garamond" font-size="28" fill="#0b0f1a" opacity="0.5">${s.name[0]}</text>
  </svg>`;
}

function fmtPrice(p) {
  return p.toLocaleString('ru-RU') + ' ₽';
}

// ===== Service detail =====
function renderService() {
  const s = SERVICES.find(x => x.id === state.serviceId);
  if (!s) return go('catalog', { replace: true });

  document.getElementById('serviceHero').innerHTML = `
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%">
      <defs><linearGradient id="hero-${s.id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${s.swatch[0]}"/>
        <stop offset="100%" stop-color="${s.swatch[1]}"/>
      </linearGradient></defs>
      <rect width="400" height="240" fill="url(#hero-${s.id})"/>
      <text x="200" y="135" text-anchor="middle" font-family="Cormorant Garamond" font-size="120" fill="#0b0f1a" opacity="0.25">${s.name[0]}</text>
    </svg>
  `;
  document.getElementById('serviceTitle').textContent = s.name;
  document.getElementById('serviceMeta').innerHTML =
    `${s.duration} мин · <span class="price">от ${fmtPrice(s.priceFrom)}</span>`;
  document.getElementById('serviceDesc').textContent = s.description;

  const ul = document.getElementById('serviceIncludes');
  ul.innerHTML = '';
  s.includes.forEach(i => {
    const li = document.createElement('li');
    li.textContent = i;
    ul.appendChild(li);
  });

  document.getElementById('serviceProof').innerHTML =
    `Записалось на этой неделе: <b>${s.weekBookings}</b>`;

  MainButton.show('Выбрать время', () => {
    state.dayISO = null;
    state.slot = null;
    go('calendar');
  });
}

// ===== Calendar =====
function renderCalendar() {
  const s = SERVICES.find(x => x.id === state.serviceId);
  document.getElementById('calSummary').innerHTML =
    `${s.name} · ${s.duration} мин · <span class="price">от ${fmtPrice(s.priceFrom)}</span>`;

  const days = getDays();
  if (!state.dayISO) state.dayISO = days[0].iso;

  const strip = document.getElementById('daysStrip');
  strip.innerHTML = '';
  days.forEach(d => {
    const el = document.createElement('div');
    el.className = 'day' + (d.iso === state.dayISO ? ' active' : '');
    el.innerHTML = `<div class="wd">${d.weekday}</div><div class="num">${d.day}</div><div class="mo">${d.month}</div>`;
    el.onclick = () => {
      TG.haptic('select');
      state.dayISO = d.iso;
      state.slot = null;
      renderCalendar();
    };
    strip.appendChild(el);
  });

  const slots = getSlots(state.dayISO, state.serviceId);
  const free = slots.filter(s => !s.taken).length;
  const area = document.getElementById('slotsArea');

  if (free === 0) {
    area.innerHTML = `<div class="slots-empty">На этот день всё занято.<br>Посмотри другой день.</div>`;
  } else {
    const grid = document.createElement('div');
    grid.className = 'slots-grid';
    slots.forEach(sl => {
      const btn = document.createElement('button');
      btn.className = 'slot' + (sl.taken ? ' taken' : '') + (sl.time === state.slot ? ' selected' : '');
      btn.textContent = sl.time;
      btn.onclick = () => {
        if (sl.taken) return;
        TG.haptic('select');
        state.slot = sl.time;
        renderCalendar();
      };
      grid.appendChild(btn);
    });
    area.innerHTML = '';
    area.appendChild(grid);
  }

  if (state.slot) {
    MainButton.show('Продолжить', () => go('confirm'));
  } else {
    MainButton.show('Выбери время', () => {}, { disabled: true });
  }
}

// ===== Confirm =====
function renderConfirm() {
  const s = SERVICES.find(x => x.id === state.serviceId);
  document.getElementById('confirmService').textContent = s.name;
  document.getElementById('confirmWhen').textContent =
    `${formatDateHuman(state.dayISO)} · ${state.slot}`;
  document.getElementById('confirmDuration').textContent = `${s.duration} мин`;
  document.getElementById('confirmPrice').textContent = `от ${fmtPrice(s.priceFrom)}`;

  document.getElementById('confirmName').value = CLIENT.firstName || TG.user().first_name;

  renderContactBlock();
  updateConfirmMainBtn();
}

function renderContactBlock() {
  const area = document.getElementById('contactArea');
  if (CLIENT.phone) {
    area.innerHTML = `
      <div class="contact-ok">
        <span>📞 ${CLIENT.phone}</span>
        <span class="check">✓</span>
      </div>`;
  } else {
    area.innerHTML = `
      <button class="contact-btn" id="contactBtn">
        <span>📞</span><span>Поделиться номером</span>
      </button>`;
    document.getElementById('contactBtn').onclick = () => {
      TG.haptic('light');
      if (tg?.requestContact) {
        tg.requestContact((ok) => {
          if (ok) {
            const c = tg.initDataUnsafe?.contact;
            CLIENT.phone = c?.phone_number || '+7 ××× ××× ··42';
            renderContactBlock();
            updateConfirmMainBtn();
          }
        });
      } else {
        // эмуляция
        CLIENT.phone = '+7 ××× ××× ··42';
        renderContactBlock();
        updateConfirmMainBtn();
      }
    };
  }
}

function updateConfirmMainBtn() {
  if (!CLIENT.phone) {
    MainButton.show('Поделись номером', () => {}, { disabled: true });
  } else {
    MainButton.show('Записаться', () => submitBooking());
  }
}

function submitBooking() {
  MainButton.progress(true);
  // эмулируем запрос на бэк
  setTimeout(() => {
    MainButton.progress(false);
    const s = SERVICES.find(x => x.id === state.serviceId);
    const booking = {
      id: 'b' + Date.now(),
      serviceId: s.id,
      serviceName: s.name,
      duration: s.duration,
      priceFrom: s.priceFrom,
      dayISO: state.dayISO,
      slot: state.slot,
      name: document.getElementById('confirmName').value,
      phone: CLIENT.phone,
      comment: document.getElementById('confirmComment').value,
      status: 'confirmed',
      createdAt: Date.now(),
    };
    saveBooking(booking);
    TG.haptic('success');
    state.lastBookingId = booking.id;
    go('success');
  }, 800);
}

// ===== Success =====
function renderSuccess() {
  const b = getBookings().find(x => x.id === state.lastBookingId);
  if (!b) return resetTo('home');
  document.getElementById('successSub').textContent =
    `Жду тебя ${formatDateHuman(b.dayISO).toLowerCase()} в ${b.slot}`;
  document.getElementById('successCard').innerHTML = `
    <div class="row"><span class="label">Услуга</span><span class="value">${b.serviceName}</span></div>
    <div class="row"><span class="label">Когда</span><span class="value">${formatDateHuman(b.dayISO)} · ${b.slot}</span></div>
    <div class="row"><span class="label">Цена</span><span class="value">от ${fmtPrice(b.priceFrom)}</span></div>
  `;
  MainButton.hide();
}

// ===== Bookings =====
let currentTab = 'active';

function renderBookings() {
  MainButton.hide();
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === currentTab);
    t.onclick = () => { TG.haptic('select'); currentTab = t.dataset.tab; renderBookings(); };
  });

  const now = new Date();
  const all = getBookings();
  const active = all.filter(b => new Date(`${b.dayISO}T${b.slot}`) >= now);
  const past = all.filter(b => new Date(`${b.dayISO}T${b.slot}`) < now);
  const list = currentTab === 'active' ? active : past;

  const wrap = document.getElementById('bookingList');
  if (list.length === 0) {
    wrap.innerHTML = `
      <div class="empty">
        <div class="empty-icon">✦</div>
        <div class="empty-text">${currentTab === 'active' ? 'Здесь будут твои записи' : 'Прошедших записей пока нет'}</div>
        <button class="empty-btn" onclick="go('catalog')">К услугам</button>
      </div>`;
    return;
  }
  wrap.innerHTML = '';
  list.forEach(b => {
    const card = document.createElement('div');
    card.className = 'booking-card';
    const statusClass = currentTab === 'past' ? 'past' : b.status;
    const statusText = currentTab === 'past' ? 'Завершено' :
                       b.status === 'confirmed' ? 'Подтверждено' : 'Ждёт подтверждения';
    card.innerHTML = `
      <div class="booking-when">${formatDateHuman(b.dayISO)} · ${b.slot}</div>
      <div class="booking-service">${b.serviceName}</div>
      <div class="booking-meta">
        <div class="status ${statusClass}"><span class="dot"></span> ${statusText}</div>
        ${currentTab === 'active' ? `<button class="cancel-link" data-id="${b.id}">Отменить</button>` : ''}
      </div>
    `;
    wrap.appendChild(card);
  });
  wrap.querySelectorAll('.cancel-link').forEach(btn => {
    btn.onclick = () => {
      TG.showConfirm('Точно отменить запись?', (ok) => {
        if (!ok) return;
        deleteBooking(btn.dataset.id);
        TG.haptic('success');
        renderBookings();
      });
    };
  });
}

// ===== About =====
function renderAbout() {
  MainButton.show('Записаться', () => go('catalog'));
  document.querySelectorAll('[data-action="open-map"]').forEach(el => {
    el.onclick = () => { TG.haptic('light'); TG.openLink('https://yandex.ru/maps/?text=' + encodeURIComponent(MASTER.address)); };
  });
  document.querySelectorAll('[data-action="open-tg"]').forEach(el => {
    el.onclick = () => { TG.haptic('light'); TG.openTelegramLink(MASTER.telegram); };
  });
}

// ===== Storage =====
const STORAGE_KEY = 'beauty_bookings_v1';
function getBookings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveBooking(b) {
  const list = getBookings();
  list.unshift(b);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
function deleteBooking(id) {
  const list = getBookings().filter(b => b.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// ===== Global click handlers =====
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const action = a.dataset.action;
  if (action === 'go-catalog') { TG.haptic('light'); state.category = 'all'; go('catalog'); }
  if (action === 'go-bookings') { TG.haptic('light'); go('bookings'); }
  if (action === 'go-about') { TG.haptic('light'); go('about'); }
  if (action === 'go-home') { TG.haptic('light'); resetTo('home'); }
});

document.querySelectorAll('.tile').forEach(t => {
  t.onclick = () => {
    TG.haptic('light');
    state.category = t.dataset.category;
    go('catalog');
  };
});

// expose go() for inline onclick
window.go = go;

// scroll → topbar border
window.addEventListener('scroll', () => {
  topbar.classList.toggle('scrolled', window.scrollY > 8);
}, { passive: true });

// init
render('home');
