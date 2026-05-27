// ============================================================
//  Логика приложения: реальный Telegram SDK + слайд-навигация.
//  Если открыто вне Telegram — все вызовы безопасно деградируют.
// ============================================================

// Telegram WebApp — реальный объект, если открыты в TG
const tg = window.Telegram && window.Telegram.WebApp;

// ============ Адаптер вокруг Telegram API + fallback ============
const TG = {
  ready() {
    if (!tg) return;
    tg.ready();
    tg.expand();
    // Применяем header под цвет верхней панели Telegram
    if (tg.setHeaderColor) tg.setHeaderColor('secondary_bg_color');
    if (tg.setBackgroundColor) tg.setBackgroundColor('secondary_bg_color');
    // Подписка на смену темы (светлая/тёмная переключаются на лету)
    tg.onEvent('themeChanged', applyTheme);
    applyTheme();
  },
  haptic(type = 'light') {
    if (tg?.HapticFeedback) {
      if (['success', 'error', 'warning'].includes(type)) {
        tg.HapticFeedback.notificationOccurred(type);
      } else if (type === 'select') {
        tg.HapticFeedback.selectionChanged();
      } else {
        tg.HapticFeedback.impactOccurred(type);
      }
    } else if (navigator.vibrate) {
      navigator.vibrate(type === 'success' ? [30, 30, 30] : 12);
    }
  },
  showAlert(msg) { tg?.showAlert ? tg.showAlert(msg) : alert(msg); },
  showConfirm(msg, cb) { tg?.showConfirm ? tg.showConfirm(msg, cb) : cb(confirm(msg)); },
  openLink(url)        { tg?.openLink         ? tg.openLink(url)         : window.open(url, '_blank'); },
  openTelegramLink(url){ tg?.openTelegramLink ? tg.openTelegramLink(url) : window.open(url, '_blank'); },
  close() { tg?.close(); },
  user() { return tg?.initDataUnsafe?.user || { first_name: 'Анна' }; },
};

// Перенос themeParams из Telegram в CSS-переменные :root.
// Telegram присылает свежие значения и при первой загрузке, и на themeChanged.
function applyTheme() {
  if (!tg?.themeParams) return;
  const root = document.documentElement;
  const map = {
    bg_color: 'tg-theme-bg-color',
    secondary_bg_color: 'tg-theme-secondary-bg-color',
    section_bg_color: 'tg-theme-section-bg-color',
    text_color: 'tg-theme-text-color',
    hint_color: 'tg-theme-hint-color',
    link_color: 'tg-theme-link-color',
    button_color: 'tg-theme-button-color',
    button_text_color: 'tg-theme-button-text-color',
    destructive_text_color: 'tg-theme-destructive-text-color',
    accent_text_color: 'tg-theme-accent-text-color',
    subtitle_text_color: 'tg-theme-subtitle-text-color',
    header_bg_color: 'tg-theme-header-bg-color',
  };
  Object.entries(map).forEach(([from, to]) => {
    const val = tg.themeParams[from];
    if (val) root.style.setProperty('--' + to, val);
  });
  // theme-color мета — для статус-бара браузера
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && tg.themeParams.bg_color) meta.setAttribute('content', tg.themeParams.bg_color);
}

TG.ready();

// ============ MainButton + BackButton: реальные TG или эмуляция ============
const mainBtnEl = document.getElementById('mainBtn');
const backBtnEl = document.getElementById('backBtn');
const topbar = document.getElementById('topbar');
const topbarTitle = document.getElementById('topbarTitle');

const MainButton = {
  show(text, onClick, opts = {}) {
    if (tg?.MainButton) {
      tg.MainButton.setText(text.toUpperCase());
      tg.MainButton.show();
      if (opts.disabled) tg.MainButton.disable(); else tg.MainButton.enable();
      tg.MainButton.offClick(this._handler);
      this._handler = () => { TG.haptic('light'); onClick(); };
      tg.MainButton.onClick(this._handler);
      mainBtnEl.hidden = true;
    } else {
      mainBtnEl.textContent = text;
      mainBtnEl.hidden = false;
      mainBtnEl.disabled = !!opts.disabled;
      mainBtnEl.classList.remove('progress');
      mainBtnEl.onclick = (e) => {
        if (mainBtnEl.disabled || mainBtnEl.classList.contains('progress')) return;
        TG.haptic('light');
        onClick(e);
      };
    }
  },
  hide() {
    if (tg?.MainButton) tg.MainButton.hide();
    mainBtnEl.hidden = true;
    mainBtnEl.onclick = null;
  },
  progress(on) {
    if (tg?.MainButton) {
      if (on) tg.MainButton.showProgress(); else tg.MainButton.hideProgress();
    }
    mainBtnEl.classList.toggle('progress', on);
  },
};

const BackButton = {
  show(onClick) {
    this._handler = () => { TG.haptic('light'); onClick(); };
    if (tg?.BackButton) {
      tg.BackButton.show();
      tg.BackButton.offClick(this._lastHandler);
      tg.BackButton.onClick(this._handler);
      this._lastHandler = this._handler;
      backBtnEl.hidden = true;
    } else {
      backBtnEl.hidden = false;
      backBtnEl.onclick = this._handler;
    }
  },
  hide() {
    if (tg?.BackButton) tg.BackButton.hide();
    backBtnEl.hidden = true;
    backBtnEl.onclick = null;
  },
};

// ============ Навигация: стек экранов + слайд-анимация ============
const stack = ['home'];
const state = {
  category: 'all',
  serviceId: null,
  dayISO: null,
  slot: null,
  lastBookingId: null,
};

function go(screen) {
  if (stack[stack.length - 1] === screen) return;
  const prev = stack[stack.length - 1];
  stack.push(screen);
  transition(prev, screen, 'forward');
  render(screen);
}

function back() {
  if (stack.length <= 1) return;
  const prev = stack.pop();
  const next = stack[stack.length - 1];
  transition(prev, next, 'back');
  render(next);
}

function resetTo(screen) {
  const prev = stack[stack.length - 1];
  stack.length = 0;
  stack.push(screen);
  transition(prev, screen, 'reset');
  render(screen);
}

// Слайд-переход: вперёд — новый въезжает справа, текущий уходит влево.
// Назад — наоборот. reset — мгновенно (для возврата на главную с экрана успеха).
function transition(from, to, direction) {
  const $from = document.querySelector(`[data-screen="${from}"]`);
  const $to   = document.querySelector(`[data-screen="${to}"]`);
  if (!$to) return;

  if (direction === 'reset') {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active', 'behind'));
    $to.classList.add('active');
    return;
  }

  if (direction === 'forward') {
    // Стартуем новый экран справа
    $to.style.transition = 'none';
    $to.style.transform = 'translateX(100%)';
    $to.classList.remove('behind');
    // Форсим reflow, потом запускаем анимацию
    void $to.offsetWidth;
    $to.style.transition = '';
    $to.classList.add('active');
    if ($from) {
      $from.classList.remove('active');
      $from.classList.add('behind');
    }
  } else {
    // back: текущий уезжает направо, предыдущий выезжает из behind
    if ($from) {
      $from.classList.remove('active');
      $from.style.transition = '';
      // .behind не ставим — экран должен уйти за пределы (translateX 100%)
      // По CSS неактивные screen имеют translateX(100%) — этого достаточно
    }
    $to.classList.remove('behind');
    $to.classList.add('active');
  }

  // Очистка стилей после анимации, чтобы не накапливались inline-стили
  setTimeout(() => {
    document.querySelectorAll('.screen').forEach(s => {
      if (!s.classList.contains('active') && !s.classList.contains('behind')) {
        s.style.transform = '';
        s.style.transition = '';
      }
    });
  }, 320);
}

// Меняем верхнюю панель, BackButton и контент экрана
function render(screen) {
  const titles = {
    home: '', catalog: 'Услуги', service: '', calendar: 'Выбор времени',
    confirm: 'Подтверждение', success: '', bookings: 'Мои записи', about: 'О мастере',
  };
  topbarTitle.textContent = titles[screen] || '';
  // На экранах с hero-картинкой делаем верхнюю панель прозрачной
  const transparent = ['home', 'service', 'success', 'about'].includes(screen);
  topbar.classList.toggle('transparent', transparent);

  if (screen === 'home' || screen === 'success') BackButton.hide();
  else BackButton.show(back);

  // Сбрасываем скролл нового экрана
  const $el = document.querySelector(`[data-screen="${screen}"]`);
  if ($el) $el.scrollTop = 0;

  // Колбэк-рендер на экран
  ({
    home: renderHome, catalog: renderCatalog, service: renderService,
    calendar: renderCalendar, confirm: renderConfirm, success: renderSuccess,
    bookings: renderBookings, about: renderAbout,
  })[screen]?.();
}

// ============ Главная ============
function renderHome() {
  MainButton.hide();
  const u = TG.user();
  document.getElementById('greeting').textContent = `Привет, ${u.first_name}`;

  const tiles = document.getElementById('homeTiles');
  tiles.innerHTML = '';
  // Берём только реальные категории, без "all"
  CATEGORIES.filter(c => c.id !== 'all').forEach(c => {
    const t = document.createElement('div');
    t.className = 'tile';
    t.innerHTML = `<div class="tile-emoji">${c.emoji}</div><div class="tile-name">${c.name}</div>`;
    t.onclick = () => {
      TG.haptic('light');
      state.category = c.id;
      go('catalog');
    };
    tiles.appendChild(t);
  });
}

// ============ Каталог ============
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

// SVG-плейсхолдер квадратик для услуги
function swatchSvg(s, size = 56) {
  const id = `gs-${s.id}`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 56 56">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${s.swatch[0]}"/>
      <stop offset="100%" stop-color="${s.swatch[1]}"/>
    </linearGradient></defs>
    <rect width="56" height="56" fill="url(#${id})"/>
    <text x="28" y="36" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="22" font-weight="700" fill="rgba(255,255,255,0.7)">${s.name[0]}</text>
  </svg>`;
}

// ============ Карточка услуги ============
function renderService() {
  const s = SERVICES.find(x => x.id === state.serviceId);
  if (!s) return back();

  document.getElementById('serviceHero').innerHTML = `
    <svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">
      <defs><linearGradient id="hero-${s.id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${s.swatch[0]}"/>
        <stop offset="100%" stop-color="${s.swatch[1]}"/>
      </linearGradient></defs>
      <rect width="400" height="220" fill="url(#hero-${s.id})"/>
      <text x="200" y="135" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="120" font-weight="800" fill="rgba(255,255,255,0.25)">${s.name[0]}</text>
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

// ============ Календарь ============
function renderCalendar() {
  const s = SERVICES.find(x => x.id === state.serviceId);
  document.getElementById('calSummary').innerHTML =
    `${s.name} · ${s.duration} мин · <span class="price">от ${fmtPrice(s.priceFrom)}</span>`;

  const days = getDays();
  if (!state.dayISO) state.dayISO = days[0].iso;

  const strip = document.getElementById('daysStrip');
  strip.innerHTML = '';
  days.forEach(d => {
    const el = document.createElement('button');
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
    area.innerHTML = `<div class="slots-empty">На этот день всё занято.<br>Попробуй другой день.</div>`;
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

  if (state.slot) MainButton.show('Продолжить', () => go('confirm'));
  else MainButton.show('Выбери время', () => {}, { disabled: true });
}

// ============ Подтверждение ============
let clientPhone = null; // храним в памяти на время сессии

function renderConfirm() {
  const s = SERVICES.find(x => x.id === state.serviceId);
  document.getElementById('confirmService').textContent = s.name;
  document.getElementById('confirmWhen').textContent =
    `${formatDateHuman(state.dayISO)} · ${state.slot}`;
  document.getElementById('confirmDuration').textContent = `${s.duration} мин`;
  document.getElementById('confirmPrice').textContent = `от ${fmtPrice(s.priceFrom)}`;
  document.getElementById('confirmName').value = TG.user().first_name;

  renderContactBlock();
  updateConfirmMainBtn();
}

function renderContactBlock() {
  const area = document.getElementById('contactArea');
  if (clientPhone) {
    area.innerHTML = `
      <div class="contact-ok">
        <span>📞 ${clientPhone}</span>
        <span class="check">✓</span>
      </div>`;
    return;
  }
  area.innerHTML = `
    <button class="contact-btn" id="contactBtn">
      <span>📞</span><span>Поделиться номером</span>
    </button>`;
  document.getElementById('contactBtn').onclick = () => {
    TG.haptic('light');
    if (tg?.requestContact) {
      tg.requestContact((ok) => {
        if (!ok) return;
        const c = tg.initDataUnsafe?.contact;
        clientPhone = c?.phone_number || '+7 ××× ××× ··42';
        renderContactBlock();
        updateConfirmMainBtn();
      });
    } else {
      // fallback вне Telegram
      clientPhone = '+7 ××× ××× ··42';
      renderContactBlock();
      updateConfirmMainBtn();
    }
  };
}

function updateConfirmMainBtn() {
  if (!clientPhone) MainButton.show('Поделись номером', () => {}, { disabled: true });
  else MainButton.show('Записаться', () => submitBooking());
}

function submitBooking() {
  MainButton.progress(true);
  // эмулируем сетевой запрос
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
      phone: clientPhone,
      comment: document.getElementById('confirmComment').value,
      status: 'confirmed',
      createdAt: Date.now(),
    };
    saveBooking(booking);
    TG.haptic('success');
    state.lastBookingId = booking.id;
    // Очищаем стек до главной перед уходом на успех, чтобы Назад вёл на главную
    stack.length = 0;
    stack.push('home');
    stack.push('success');
    transition('confirm', 'success', 'forward');
    render('success');
  }, 700);
}

// ============ Успех ============
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

// ============ Мои записи ============
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
        <div class="empty-icon">📅</div>
        <div class="empty-text">${currentTab === 'active' ? 'Здесь будут твои записи' : 'Прошедших записей пока нет'}</div>
        <button class="empty-btn" id="emptyBtn">К услугам</button>
      </div>`;
    document.getElementById('emptyBtn').onclick = () => go('catalog');
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

// ============ О мастере ============
function renderAbout() {
  document.getElementById('aboutBio').textContent = MASTER.bio;
  document.getElementById('aboutAddress').textContent = MASTER.address;
  document.getElementById('aboutTg').textContent = MASTER.telegramHandle;
  document.getElementById('aboutHours').textContent = MASTER.hours;
  MainButton.show('Записаться', () => go('catalog'));
}

// ============ Хранилище: localStorage ============
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

// ============ Делегированные клики по data-action ============
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const action = a.dataset.action;
  if (action === 'go-catalog')  { TG.haptic('light'); state.category = 'all'; go('catalog'); }
  if (action === 'go-bookings') { TG.haptic('light'); go('bookings'); }
  if (action === 'go-about')    { TG.haptic('light'); go('about'); }
  if (action === 'go-home')     { TG.haptic('light'); resetTo('home'); }
  if (action === 'open-map')    { TG.haptic('light'); TG.openLink('https://yandex.ru/maps/?text=' + encodeURIComponent(MASTER.address)); }
  if (action === 'open-tg')     { TG.haptic('light'); TG.openTelegramLink(MASTER.telegram); }
});

// Подкрашиваем границу верхней панели при скролле активного экрана
document.addEventListener('scroll', (e) => {
  const s = e.target;
  if (!s.classList || !s.classList.contains('screen') || !s.classList.contains('active')) return;
  topbar.classList.toggle('scrolled', s.scrollTop > 8);
}, { capture: true, passive: true });

// Стартовый рендер главной
render('home');
