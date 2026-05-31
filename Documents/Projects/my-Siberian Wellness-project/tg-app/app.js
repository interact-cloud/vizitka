/*
 * app.js — логика Mini App «Лёгкий старт».
 *
 * Что делает:
 *  1) Инициализирует Telegram Web App SDK (тема, имя пользователя, кнопка «назад»).
 *  2) Хранит навигацию между экранами (история переходов).
 *  3) Рендерит каждый экран из данных DATA (см. data.js).
 *
 * Данные НЕ хранятся здесь — они в data.js. Этот файл только отображает.
 */

/* ===================== 1. Telegram SDK и тема ===================== */

// Объект Telegram (если открыто внутри Telegram). Вне Telegram — undefined.
const tg = window.Telegram ? window.Telegram.WebApp : null;

// Применяем ФИРМЕННЫЙ стиль Siberian Wellness.
// Цвета НЕ копируем из Telegram — у нас своя палитра (см. styles.css).
// От Telegram берём только признак тёмной темы и переключаем класс .theme-dark:
//   светлая тема  → фирменный светлый SW (сиреневый фон),
//   тёмная тема   → тёмный фон + те же фирменные акценты (фиолет/бирюза/золото).
function applyTheme() {
  // Определяем тёмную тему: сначала из Telegram, иначе из системных настроек браузера
  let isDark = false;
  if (tg && tg.colorScheme) {
    isDark = tg.colorScheme === "dark";
  } else if (window.matchMedia) {
    isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  document.documentElement.classList.toggle("theme-dark", isDark);
}

// Инициализация SDK
function initTelegram() {
  if (!tg) return; // работаем и вне Telegram (для отладки в браузере)
  tg.ready();       // сообщаем Telegram, что приложение загрузилось
  tg.expand();      // разворачиваем на весь экран
  applyTheme();
  tg.onEvent("themeChanged", applyTheme); // реагируем на смену темы

  // Имя пользователя из Telegram → в демо-прогресс
  const u = tg.initDataUnsafe && tg.initDataUnsafe.user;
  if (u && u.first_name) DATA.progress.name = u.first_name;
}

/* ===================== 1b. Состояние партнёра (автономно, localStorage) ===================== */
/*
 * Данные НЕ грузятся с сервера. Всё считается на устройстве:
 *  - start_date  — когда партнёр впервые открыл приложение (старт отсчёта);
 *  - personal    — личные баллы, которые он сам отметил за текущий месяц;
 *  - pk_points   — баллы его клиентов (ПК) за текущий месяц;
 *  - last_call   — дата последнего созвона с наставником;
 *  - month_key   — какой это месяц (для авто-сброса баллов при смене месяца).
 * Владелец бота меняет только цены/продукты в data.js — данные пользователя живут здесь.
 */
const STORE_KEY = "legkiy_start_state";

function monthKey(d = new Date()) {
  return d.getFullYear() + "-" + (d.getMonth() + 1); // напр. "2026-5"
}

// Загрузка состояния (с авто-сбросом баллов в начале нового месяца)
function loadState() {
  let s;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch (e) { s = {}; }

  const nowKey = monthKey();
  if (!s.start_date) s.start_date = new Date().toISOString(); // первый запуск — фиксируем старт
  if (s.month_key !== nowKey) {
    // Новый месяц — обнуляем месячные счётчики, но сохраняем дату старта
    s.month_key = nowKey;
    s.personal = 0;
    s.pk_points = 0;
  }
  if (typeof s.personal !== "number") s.personal = 0;
  if (typeof s.pk_points !== "number") s.pk_points = 0;
  return s;
}

function saveState(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
}

// Изменить показатель (+/-) и сохранить. field: 'personal' | 'pk_points'
function bump(field, delta) {
  const s = loadState();
  // округляем до 1 знака, чтобы не было артефактов вроде 10.499999
  s[field] = Math.max(0, Math.round(((s[field] || 0) + delta) * 10) / 10);
  saveState(s);
  haptic();
  go("progress", false); // перерисовать экран прогресса без добавления в историю
}

// Вписать точное значение (в т.ч. дробное, напр. 9,5). Запятую превращаем в точку.
function setVal(field, raw) {
  const s = loadState();
  const num = parseFloat(String(raw).replace(",", ".")); // "9,5" → 9.5
  s[field] = isNaN(num) ? 0 : Math.max(0, num);
  saveState(s);
  go("progress", false); // пересчитать план
}

// Отметить созвон с наставником сегодня
function markCall() {
  const s = loadState();
  s.last_call = new Date().toISOString();
  saveState(s);
  haptic();
  go("progress", false);
}

/* ===================== 1c. Калькулятор плана до конца месяца ===================== */
/*
 * Сердце автономной работы. По дате старта и текущим баллам считает:
 *  - сколько дней осталось до конца месяца;
 *  - статус по каждой из 3 программ (выполнено / сколько добрать);
 *  - сколько баллов в день нужно добирать, чтобы успеть;
 *  - нужно ли звонить наставнику.
 * Возвращает объект, который рисует экран progress().
 */
function calcPlan() {
  const r = DATA.rules;
  const s = loadState();
  const now = new Date();

  // Дни до конца текущего месяца (включая сегодня)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = lastDay - now.getDate() + 1;

  const personal = s.personal;     // личные баллы за месяц
  const pk = s.pk_points;          // баллы клиентов за месяц
  const turnover = personal + pk;  // общий оборот (для Club 1000)

  // --- Club 200: личные баллы >= цель ---
  const c200_left = Math.max(0, r.club200_target - personal);
  const c200_done = c200_left === 0;

  // --- Club 1000: снежинки. Личные должны быть >= минимума, иначе 0 снежинок ---
  let snowflakes = 0;
  if (personal >= r.club1000_personal_min) {
    snowflakes = Math.min(r.snowflake_max, Math.floor(turnover / r.snowflake_step));
  }
  // Сколько оборота до следующей снежинки (если ещё не максимум)
  const nextFlakeAt = (snowflakes + 1) * r.snowflake_step;
  const c1000_left = snowflakes < r.snowflake_max ? Math.max(0, nextFlakeAt - turnover) : 0;
  const c1000_blocked = personal < r.club1000_personal_min; // снежинки заблокированы низким ЛО

  // --- Привилегированные клиенты: сколько клиентов «активны» (по 50 баллов) ---
  const pkCount = Math.floor(pk / r.pk_month);

  // --- Сколько личных баллов в день добирать, чтобы закрыть Club 200 ---
  const perDay = c200_left > 0 ? Math.ceil(c200_left / daysLeft) : 0;

  // --- Созвон с наставником ---
  let callOverdue = true;
  if (s.last_call) {
    const diffDays = Math.floor((now - new Date(s.last_call)) / 86400000);
    callOverdue = diffDays >= r.mentor_call_days;
  }

  // Общая «победа месяца»: Club 200 выполнен и есть хотя бы 1 снежинка Club 1000
  const allDone = c200_done && snowflakes >= 1;

  return {
    daysLeft, personal, pk, turnover, perDay,
    c200_left, c200_done,
    snowflakes, c1000_left, c1000_blocked,
    pkCount, callOverdue, allDone,
    rules: r,
  };
}

/* ===================== 1d. День цикла и задачи дня ===================== */
/*
 * День цикла = сколько дней прошло от старта, по кругу 1..30.
 * Галочки выполненных задач храним по ключу дня, чтобы не путались между днями.
 */
function cycleDay() {
  const s = loadState();
  const start = new Date(s.start_date);
  const today = new Date();
  // Полных дней с момента старта (старт = день 1)
  const diff = Math.floor((stripTime(today) - stripTime(start)) / 86400000);
  const total = DATA.tasks.length;            // 30
  return ((diff % total) + total) % total + 1; // 1..30, зациклено
}
function stripTime(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

// Отметить/снять задачу дня. Хранится как done_tasks["<день>"] = [true/false x3]
function toggleTask(day, idx) {
  const s = loadState();
  if (!s.done_tasks) s.done_tasks = {};
  if (!s.done_tasks[day]) s.done_tasks[day] = [false, false, false];
  s.done_tasks[day][idx] = !s.done_tasks[day][idx];
  saveState(s);
  haptic();
  go("today", false); // перерисовать экран задач
}

// Показать/скрыть рекомендацию к задаче (idx 0..2). Без перерисовки экрана.
function toggleTip(idx) {
  haptic();
  const el = document.getElementById("tip-" + idx);
  if (el) el.classList.toggle("is-open");
}

/* ===================== 2. Навигация между экранами ===================== */

// Стек истории — чтобы кнопка «назад» возвращала на предыдущий экран
const history = [];

// Показать экран по id. Рендер-функции лежат в SCREENS (ниже).
function go(screenId, push = true) {
  const root = document.getElementById("screens");
  // Рендерим контент экрана
  root.innerHTML = SCREENS[screenId] ? SCREENS[screenId]() : "<p>Экран не найден</p>";

  // Анимация появления
  const node = root.firstElementChild;
  if (node) { node.classList.add("screen", "is-active"); }

  // История и кнопка «назад»
  if (push) history.push(screenId);
  updateBackButton();

  // Прокрутка наверх при смене экрана
  window.scrollTo(0, 0);
}

// Назад на предыдущий экран
function back() {
  if (history.length <= 1) return;
  history.pop();                       // убираем текущий
  const prev = history[history.length - 1];
  go(prev, false);                     // показываем предыдущий без добавления в историю
}

// Показываем/прячем кнопку «назад» (и в шапке, и нативную Telegram)
function updateBackButton() {
  const btn = document.getElementById("backBtn");
  const onHome = history.length <= 1;
  btn.classList.toggle("is-visible", !onHome);

  // Нативная кнопка «назад» Telegram
  if (tg && tg.BackButton) {
    if (onHome) tg.BackButton.hide();
    else tg.BackButton.show();
  }
}

// Лёгкая виброотдача при нажатии (если Telegram поддерживает)
function haptic() {
  if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
}

/* ===================== 3. Вспомогательные функции рендера ===================== */

// Шапка экрана с заголовком
function head(title) {
  return `<h1 class="header__title-inner" style="font-size:22px;font-weight:800;margin:4px 0 14px;">${title}</h1>`;
}

// Экранирование (на всякий случай, данные у нас свои, но это хорошая привычка)
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]));
}

// Склонение существительного по числу: plural(5,"балл","балла","баллов") → "баллов"
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/* ===================== 4. Экраны (каждый возвращает HTML-строку) ===================== */

const SCREENS = {

  /* --- ГЛАВНОЕ МЕНЮ (хаб) --- */
  home() {
    const pr = DATA.progress;
    // Плитки меню → каждая ведёт на свой экран
    const tiles = [
      { id: "today",      emoji: "☀️", label: "Задачи на сегодня" },
      { id: "progress",   emoji: "📊", label: "Мой план на месяц" },
      { id: "programs",   emoji: "🎯", label: "Программы" },
      { id: "goals",      emoji: "🛍️", label: "Подобрать продукт" },
      { id: "objections", emoji: "🛡️", label: "Возражения" },
      { id: "faq",        emoji: "❓", label: "Частые вопросы" },
      { id: "mentor",     emoji: "💬", label: "Спросить наставника" },
    ];
    return `
      <section>
        <div class="hero">
          <div class="hero__hi">Привет, ${esc(pr.name)}! 👋</div>
          <div class="hero__name">Лёгкий старт</div>
          <div class="hero__sub">Я рядом круглосуточно — помогу с программами, продуктами и первыми шагами в бизнесе.</div>
        </div>

        <div class="section-label">Чем помочь?</div>
        <div class="menu-grid">
          ${tiles.map(t => `
            <button class="tile" onclick="nav('${t.id}')">
              <span class="tile__emoji">${t.emoji}</span>
              <span class="tile__label">${t.label}</span>
            </button>`).join("")}
        </div>

        <a class="btn" href="${DATA.shopUrl}" target="_blank" rel="noopener" onclick="haptic()">
          🛒 Открыть магазин
        </a>
      </section>`;
  },

  /* --- ЗАДАЧИ НА СЕГОДНЯ — афоризм + 3 задачи дня цикла (1–30, по кругу) --- */
  today() {
    const day = cycleDay();
    const aph = DATA.aphorisms[(day - 1) % DATA.aphorisms.length];
    const tasks = DATA.tasks[day - 1] || [];
    const prod = DATA.productOfDay[(day - 1) % DATA.productOfDay.length];
    const s = loadState();
    const done = (s.done_tasks && s.done_tasks[day]) || [false, false, false];
    const doneCount = done.filter(Boolean).length;

    return `
      <section>
        ${head("Задачи на сегодня")}

        <!-- Афоризм дня -->
        <div class="card" style="background:linear-gradient(135deg,var(--sw-violet),var(--sw-banner));color:#fff;">
          <div style="font-size:13px;opacity:.9;margin-bottom:6px;">День ${day} из 30 · мысль дня</div>
          <div style="font-size:16px;font-weight:600;line-height:1.4;">«${esc(aph)}»</div>
        </div>

        <!-- Продукт дня -->
        <div class="card">
          <div class="card__title">📦 Продукт дня</div>
          <div class="product" style="border:none;padding-bottom:0;">
            <span>
              <span class="product__name">${esc(prod.name)}</span><br>
              <span class="product__note">${esc(prod.note)}</span>
            </span>
            <span class="product__price">${esc(prod.price)}</span>
          </div>
          <a class="btn" href="${DATA.shopUrl}" target="_blank" rel="noopener" onclick="haptic()">🛒 Заказать в магазине</a>
        </div>

        <!-- Прогресс дня -->
        <div class="card">
          <div class="card__title">✅ 3 задачи на день ${doneCount === 3 ? "🎉" : `(${doneCount}/3)`}</div>
          <div class="progress-bar"><div class="progress-bar__fill" style="width:${Math.round(doneCount/3*100)}%;"></div></div>
        </div>

        <!-- Сами задачи: клик по тексту — отметка; кнопка 💡 — рекомендация -->
        ${tasks.map((t, i) => `
          <div class="task-wrap">
            <div class="task ${done[i] ? "is-done" : ""}">
              <button class="task__main" onclick="toggleTask(${day}, ${i})">
                <span class="task__check">${done[i] ? "✓" : ""}</span>
                <span class="task__text">${esc(t)}</span>
              </button>
              <button class="task__tip-btn" onclick="toggleTip(${i})" aria-label="Рекомендация">Жми</button>
            </div>
            <div class="task__tip" id="tip-${i}">${esc((DATA.taskTips[day-1] || [])[i] || "Рекомендация скоро появится.")}</div>
          </div>`).join("")}

        ${doneCount === 3
          ? `<div class="note">🔥 Все задачи дня выполнены! Завтра — новый день и новые шаги.</div>`
          : `<div class="note">Нажми на задачу, когда выполнишь. Завтра задачи обновятся автоматически.</div>`}

        <button class="btn btn--secondary" onclick="nav('mentor')">💬 Спросить наставника</button>
      </section>`;
  },

  /* --- МОЙ ПРОГРЕСС — автономный калькулятор плана до конца месяца --- */
  progress() {
    const pl = calcPlan();
    const c200pct = Math.min(100, Math.round(pl.personal / pl.rules.club200_target * 100));

    // Блок «победа месяца» или «план»
    const headerCard = pl.allDone
      ? `<div class="card" style="background:linear-gradient(135deg,var(--sw-gold),#d9a441);color:#3a2e10;">
           <div class="card__title" style="color:#3a2e10;">🎉 Месяц закрыт на победу!</div>
           <div style="font-size:14px;">Все три программы выполнены. Так держать — ты в ритме чемпиона ❄️</div>
         </div>`
      : `<div class="card">
           <div class="card__title">📅 До конца месяца: ${pl.daysLeft} ${plural(pl.daysLeft, "день","дня","дней")}</div>
           <div class="card__text">${pl.c200_left > 0
              ? `Чтобы закрыть Club 200, добирай примерно <b>${pl.perDay} ${plural(pl.perDay,"балл","балла","баллов")} в день</b>.`
              : `Club 200 уже выполнен — отличная работа! Дальше копим снежинки и клиентов.`}</div>
         </div>`;

    return `
      <section>
        ${head("Мой план на месяц")}
        ${headerCard}

        <!-- CLUB 200 -->
        <div class="card">
          <div class="card__title" style="color:#1fb8ae;">🟢 Club 200 ${pl.c200_done ? "✅" : ""}</div>
          <div class="progress-bar"><div class="progress-bar__fill" style="width:${c200pct}%;background:#1fb8ae;"></div></div>
          <div class="stat-row">
            <span class="stat-row__label">Личные баллы</span>
            <span class="stat-row__value">${pl.personal} / ${pl.rules.club200_target}</span>
          </div>
          <div class="card__text">${pl.c200_done
            ? "Цель месяца достигнута 🎉"
            : `Осталось добрать <b>${pl.c200_left}</b> ${plural(pl.c200_left,"балл","балла","баллов")} (≈ ${pl.c200_left * pl.rules.point_to_rub} ₽).`}</div>
        </div>

        <!-- CLUB 1000 -->
        <div class="card">
          <div class="card__title" style="color:#6c5ce7;">❄️ Club 1000 ${pl.snowflakes >= 1 ? "✅" : ""}</div>
          <div class="snowflakes">${"❄️".repeat(pl.snowflakes) || "—"}</div>
          <div class="card__text">
            ${pl.c1000_blocked
              ? `⚠️ Снежинки не идут: нужно минимум ${pl.rules.club1000_personal_min} личных баллов. Сначала закрой Club 200.`
              : pl.snowflakes >= pl.rules.snowflake_max
                ? `Максимум за месяц — ${pl.rules.snowflake_max} ❄️. Отлично!`
                : `Оборот ${pl.turnover} б. До следующей снежинки — ещё <b>${pl.c1000_left}</b> ${plural(pl.c1000_left,"балл","балла","баллов")} (личные + клиенты).`}
          </div>
        </div>

        <!-- СЧЁТЧИКИ: партнёр сам отмечает свои действия -->
        <div class="section-label">Отметь свои действия</div>
        <div class="card">
          <div class="counter">
            <span class="counter__label">Мои личные баллы<br><small>за этот месяц</small></span>
            <input class="counter__input" type="text" inputmode="decimal" value="${pl.personal}"
                   onchange="setVal('personal', this.value)" onfocus="this.select()">
          </div>
          <div class="counter">
            <span class="counter__label">Баллы клиентов (ПК)<br><small>за этот месяц</small></span>
            <input class="counter__input" type="text" inputmode="decimal" value="${pl.pk}"
                   onchange="setVal('pk_points', this.value)" onfocus="this.select()">
          </div>
          <div class="card__text" style="margin-top:6px;">Можно вписать точное число вручную — даже дробное, например 9,5.</div>
        </div>

        <!-- СОЗВОН С НАСТАВНИКОМ -->
        <div class="card">
          <div class="card__title">📞 Созвон с наставником</div>
          <div class="card__text">${pl.callOverdue
            ? `Пора связаться — 10 минут разговора экономят неделю топтания.`
            : `Недавно созванивались — отлично, держи ритм 👍`}</div>
          <button class="btn ${pl.callOverdue ? "" : "btn--secondary"}" onclick="markCall()">✅ Отметить созвон сегодня</button>
        </div>

        <div class="note">ℹ️ Приложение считает план само, прямо на твоём телефоне. Отмечай баллы — и я пересчитаю, что успеть до конца месяца. В начале нового месяца счётчики обнулятся.</div>
      </section>`;
  },

  /* --- СПИСОК ПРОГРАММ --- */
  programs() {
    return `
      <section>
        ${head("Программы")}
        ${DATA.programs.map(pg => `
          <button class="row row--accent" style="--row-color:${pg.color};" onclick="nav('program:${pg.id}')">
            <span class="row__emoji">${pg.emoji}</span>
            <span class="row__body">
              <span class="row__title">${esc(pg.title)}</span>
              <span class="row__sub">${esc(pg.tagline)}</span>
            </span>
            <span class="row__chevron">›</span>
          </button>`).join("")}
        <div class="note">Club 200 и Club 1000 — для тебя как партнёра. Клуб Постоянства — инструмент для твоих клиентов.</div>
      </section>`;
  },

  /* --- ДЕТАЛИ ОДНОЙ ПРОГРАММЫ (id передаётся через program:<id>) --- */
  program(id) {
    const pg = DATA.programs.find(x => x.id === id);
    if (!pg) return head("Программа не найдена");
    // Таблица (наборы / шкала) — формат зависит от программы
    let tableHtml = "";
    if (pg.table) {
      tableHtml = `<table class="mini-table">${pg.table.map(r =>
        `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table>`;
    }
    return `
      <section>
        ${head(pg.emoji + " " + pg.title)}
        <div class="card">
          <div class="card__title" style="color:${pg.color};">${esc(pg.tagline)}</div>
          <div class="card__text">${esc(pg.who)}</div>
        </div>

        <div class="card">
          <div class="card__title">Как это работает</div>
          <ol class="steps" style="--prog-color:${pg.color};">
            ${pg.steps.map(s => `<li>${esc(s)}</li>`).join("")}
          </ol>
        </div>

        ${tableHtml ? `<div class="card"><div class="card__title">${pg.id === "club200" ? "Наборы по месяцам" : "Шкала сертификатов"}</div>${tableHtml}</div>` : ""}

        <div class="note">${esc(pg.footer)}</div>

        <button class="btn" onclick="nav('mentor')">💬 Спросить наставника</button>
      </section>`;
  },

  /* --- ПОДБОР ПРОДУКТА: выбор цели --- */
  goals() {
    return `
      <section>
        ${head("Подобрать продукт")}
        <div class="note">Выбери, что важнее всего сейчас — подберу продукты под твою цель.</div>
        ${DATA.goals.map(g => `
          <button class="row" onclick="nav('goal:${g.id}')">
            <span class="row__emoji">${g.emoji}</span>
            <span class="row__body"><span class="row__title">${esc(g.title)}</span></span>
            <span class="row__chevron">›</span>
          </button>`).join("")}
      </section>`;
  },

  /* --- ПОДБОР: продукты под выбранную цель (goal:<id>) --- */
  goal(id) {
    const g = DATA.goals.find(x => x.id === id);
    if (!g) return head("Цель не найдена");
    return `
      <section>
        ${head(g.emoji + " " + g.title)}
        <div class="card">
          ${g.products.map(pr => `
            <div class="product">
              <span>
                <span class="product__name">${esc(pr.name)}</span><br>
                <span class="product__note">${esc(pr.note)}</span>
              </span>
              <span>
                <span class="product__price">${esc(pr.price)}</span>
                ${pr.points ? `<span class="product__points">${esc(pr.points)}</span>` : ""}
              </span>
            </div>`).join("")}
        </div>
        <a class="btn" href="${DATA.shopUrl}" target="_blank" rel="noopener" onclick="haptic()">🛒 Заказать в магазине</a>
        <button class="btn btn--secondary" onclick="nav('mentor')">💬 Спросить наставника</button>
      </section>`;
  },

  /* --- ВОЗРАЖЕНИЯ (аккордеон) --- */
  objections() {
    return `
      <section>
        ${head("Ответы на возражения")}
        <div class="note">Нажми на возражение — покажу готовый ответ. Формула: принять → ответить → предложить шаг.</div>
        ${DATA.objections.map((o, i) => `
          <div class="card accordion" onclick="toggleAcc(this)">
            <div class="accordion__q"><span>«${esc(o.q)}»</span><span class="accordion__icon">+</span></div>
            <div class="accordion__a">${esc(o.a)}</div>
          </div>`).join("")}
      </section>`;
  },

  /* --- FAQ (аккордеон) --- */
  faq() {
    return `
      <section>
        ${head("Частые вопросы")}
        ${DATA.faq.map(f => `
          <div class="card accordion" onclick="toggleAcc(this)">
            <div class="accordion__q"><span>${esc(f.q)}</span><span class="accordion__icon">+</span></div>
            <div class="accordion__a">${esc(f.a)}</div>
          </div>`).join("")}
      </section>`;
  },

  /* --- СВЯЗЬ С НАСТАВНИКОМ (handoff) --- */
  mentor() {
    const m = DATA.mentor;
    return `
      <section>
        ${head("Живой наставник")}
        <div class="card">
          <div class="card__title">${esc(m.name)}</div>
          <div class="card__text">${esc(m.text)}</div>
        </div>
        <a class="btn" href="${m.url}" target="_blank" rel="noopener" onclick="haptic()">💬 Написать ${esc(m.username)}</a>
        <button class="btn btn--secondary" onclick="nav('home')">🏠 Главное меню</button>
      </section>`;
  },
};

/* ===================== 5. Обработчики переходов ===================== */

// Переход с виброоткликом. Поддерживает составные id вида "program:club200".
function nav(route) {
  haptic();
  const [screen, arg] = route.split(":");
  if (arg) {
    // Экраны с аргументом: program / goal
    const root = document.getElementById("screens");
    root.innerHTML = SCREENS[screen](arg);
    const node = root.firstElementChild;
    if (node) node.classList.add("screen", "is-active");
    history.push(route);
    updateBackButton();
    window.scrollTo(0, 0);
  } else {
    go(screen);
  }
}

// Раскрытие/сворачивание элемента аккордеона
function toggleAcc(el) {
  haptic();
  el.classList.toggle("is-open");
}

/* ===================== 6. Старт приложения ===================== */

document.addEventListener("DOMContentLoaded", () => {
  initTelegram();

  // Кнопка «назад» в нашей шапке
  document.getElementById("backBtn").addEventListener("click", back);
  // Нативная кнопка «назад» Telegram
  if (tg && tg.BackButton) tg.BackButton.onClick(back);

  // Стартовый экран
  go("home");
});
