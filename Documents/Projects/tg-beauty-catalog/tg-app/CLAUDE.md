# tg-app — Telegram Mini App каталога услуг бьюти-мастера

Нативный стиль Telegram (светлый + тёмная тема через `themeChanged`), без фреймворков, vanilla HTML/CSS/JS. Подключён реальный Telegram Web App SDK.

---

## Файлы и за что отвечают

| Файл | Назначение |
|------|-----------|
| [index.html](index.html) | Каркас приложения: все 8 экранов одной разметкой, верхняя панель, MainButton-эмулятор, подключение SDK |
| [styles.css](styles.css) | Стили в нативном стиле Telegram. Тема через CSS-переменные `--tg-theme-*` с fallback под светлый/тёмный. Слайд-переходы между экранами |
| [app.js](app.js) | Навигация со стеком, слайд-анимация, адаптер вокруг Telegram SDK (`TG`, `MainButton`, `BackButton`), рендер каждого экрана, `localStorage` для записей |
| [data.js](data.js) | Все данные: мастер, категории, услуги, генератор слотов, формат даты. **Меняй данные только здесь** |
| CLAUDE.md | Этот файл — описание структуры проекта |

---

## Навигация между экранами

```
[home]                  главная (hero + категории + быстрый доступ)
  ├─→ [catalog]         каталог услуг с фильтром-чипами
  │     └─→ [service]   карточка одной услуги
  │           └─→ [calendar]      выбор дня и времени
  │                 └─→ [confirm] подтверждение записи + телефон
  │                       └─→ [success] успех (стек сбрасывается на home)
  ├─→ [bookings]        мои записи (активные/прошедшие)
  └─→ [about]           о мастере
```

Стек экранов хранится в `stack` массиве в [app.js](app.js). Кнопка «Назад» вызывает `back()` — pop из стека + slide вправо. Переход на «успех» сбрасывает стек, чтобы пользователь не возвращался к подтверждению.

---

## Где менять данные

### Карточка мастера
[data.js → `MASTER`](data.js) — имя, специализация, био, адрес, часы, Telegram-канал, статистика. Отображается на главной (`hero`) и на экране «О мастере».

### Список услуг
[data.js → `SERVICES`](data.js). Каждая услуга:
- `id` — уникальный (`s1`, `s2`...)
- `category` — должна совпадать с `id` категории из `CATEGORIES`
- `name`, `description` — что показывается клиенту
- `duration`, `priceFrom` — длительность в мин и цена «от»
- `includes` — массив пунктов «что входит»
- `swatch` — два HEX-цвета для SVG-плейсхолдера (можно подсмотреть в Tailwind palette)
- `weekBookings` — социальный proof «записалось на этой неделе»

### Категории
[data.js → `CATEGORIES`](data.js). Категория `all` обязательная, остальные — по нишам мастера. `emoji` показывается на тайлах главной.

### Расписание / слоты
[data.js → `getSlots()`](data.js). Сейчас захардкожен рабочий день 10:00–20:00 с шагом 30 мин, занятость псевдослучайная по seed. Когда будет бэк — заменить тело функции на `fetch` к API. Формат возврата сохранять.

### Тексты UI (приветствие, заголовки, плейсхолдеры)
В [index.html](index.html) и [app.js](app.js) — поиском по строке. Сводки кнопок MainButton — внутри `render*` функций в [app.js](app.js).

---

## Как работает тема

1. `:root` в [styles.css](styles.css) определяет fallback-значения для светлой темы.
2. `@media (prefers-color-scheme: dark)` переопределяет их для тёмной системной темы (когда открыто в браузере вне Telegram).
3. При запуске в Telegram функция `applyTheme()` в [app.js](app.js) переносит реальные значения из `tg.themeParams` в `:root` через `style.setProperty`. Подписка на `themeChanged` обновляет переменные на лету.
4. Все цвета в [styles.css](styles.css) указаны через `var(--tg-theme-*)` — палитра автоматически следует за Telegram.

**Где менять fallback-палитру:** [styles.css → `:root`](styles.css) и блок `@media (prefers-color-scheme: dark)`.

---

## Telegram SDK: что используется

| API | Где | Что делает |
|-----|-----|-----------|
| `WebApp.ready()` / `expand()` | `TG.ready()` в [app.js](app.js) | Готовность + растягивание на полный viewport |
| `WebApp.themeParams` + `onEvent('themeChanged')` | `applyTheme()` | Динамические CSS-переменные темы |
| `WebApp.MainButton` | `MainButton.show/hide/progress` | Нативная кнопка снизу, fallback — наша эмуляция |
| `WebApp.BackButton` | `BackButton.show/hide` | Нативная стрелка в шапке, fallback — наша слева |
| `WebApp.HapticFeedback` | `TG.haptic()` | Вибро на тапах/выборе/успехе, fallback — `navigator.vibrate` |
| `WebApp.requestContact` | в `renderContactBlock()` | Запрос телефона нативным диалогом |
| `WebApp.showAlert/showConfirm` | `TG.showAlert/showConfirm` | Нативные попапы вместо `alert/confirm` |
| `WebApp.openLink / openTelegramLink` | `TG.openLink/openTelegramLink` | Внешние ссылки (карта, канал) |
| `WebApp.initDataUnsafe.user` | `TG.user()` | Имя клиента для приветствия и подтверждения |

Если открыто **вне Telegram** — все вызовы безопасно деградируют: имя «Анна», телефон-заглушка, popup → native alert.

---

## Хранилище

Записи живут в `localStorage` под ключом `beauty_bookings_v1` ([app.js → `getBookings/saveBooking/deleteBooking`](app.js)). Когда появится бэк — заменить эти три функции на `fetch`-обёртки.

---

## Что отсутствует в этой версии (по плану из [../brief.md](../brief.md))

Telegram Stars / предоплата, корзина из нескольких услуг, портфолио «до/после», отзывы с фото, программа лояльности, повтор записи в один тап, выбор мастера (он один), поиск, deep-link, push-напоминания через бота, валидация `initData` на бэке (бэка ещё нет).

---

## Локальный запуск

Открыть [index.html](index.html) двойным кликом — работает в браузере с fallback-тем. Для проверки на телефоне — поднять локальный HTTPS-сервер (ngrok / Cloudflare Tunnel) и подключить URL в `@BotFather` → `/setmenubutton`.

После пуша в репозиторий приложение доступно по адресу:
`https://interact-cloud.github.io/vizitka/Documents/Projects/tg-beauty-catalog/tg-app/`
