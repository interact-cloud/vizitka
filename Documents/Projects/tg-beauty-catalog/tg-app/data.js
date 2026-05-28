// Все данные приложения. Меняй услуги/мастера здесь — без правки HTML и JS.

// Карточка мастера — показывается на главной и в "О мастере"
const MASTER = {
  name: 'Алина Громова',
  specialization: 'Маникюр · педикюр · уход',
  experience: '10 лет в бьюти',
  bio: 'Делаю маникюр, который держится 4 недели. Работаю только с гипоаллергенными материалами. Принимаю в студии на Никольской.',
  address: 'Москва, Никольская, 10',
  hours: 'Пн–Сб · 10:00–20:00',
  telegram: 'https://t.me/interactego',
  telegramHandle: '@interactego',
  botUsername: 'Beauty_90master_bot',
  stats: { bookings: 312, rating: 4.9 },
  emoji: '💅',
};

// Категории каталога — порядок и id используются на главной и в фильтре
const CATEGORIES = [
  { id: 'all',      name: 'Все',     emoji: '✨' },
  { id: 'manicure', name: 'Маникюр', emoji: '💅' },
  { id: 'pedicure', name: 'Педикюр', emoji: '👣' },
  { id: 'care',     name: 'Уход',    emoji: '🌿' },
];

// Список услуг. swatch — два цвета для SVG-градиента-плейсхолдера
const SERVICES = [
  {
    id: 's1', category: 'manicure',
    name: 'Маникюр с покрытием',
    duration: 90, priceFrom: 2500,
    description: 'Аппаратный маникюр + гель-лак. Покрытие держится 4 недели без сколов. Использую материалы Kodi и CND.',
    includes: ['Снятие старого покрытия', 'Аппаратная обработка', 'Покрытие гель-лаком', 'Уход за кутикулой'],
    weekBookings: 12,
    swatch: ['#FF9EB5', '#FFC2D1'],
    emoji: '💅',
  },
  {
    id: 's2', category: 'manicure',
    name: 'Дизайн ногтей',
    duration: 60, priceFrom: 1500,
    description: 'Художественная роспись, втирки, фольга, стразы. Цена зависит от сложности.',
    includes: ['Эскиз по референсу', 'Дизайн на 2–10 ногтях', 'Закрепление топом'],
    weekBookings: 7,
    swatch: ['#8B5CF6', '#C4B5FD'],
    emoji: '✨',
  },
  {
    id: 's3', category: 'pedicure',
    name: 'Педикюр',
    duration: 120, priceFrom: 3500,
    description: 'Аппаратный педикюр с обработкой стоп. Снятие натоптышей, уход за ногтями, покрытие гель-лаком.',
    includes: ['Распаривание', 'Обработка стоп', 'Покрытие гель-лаком', 'Массаж стоп'],
    weekBookings: 5,
    swatch: ['#3B82F6', '#93C5FD'],
    emoji: '👣',
  },
  {
    id: 's4', category: 'pedicure',
    name: 'Экспресс-педикюр',
    duration: 60, priceFrom: 2000,
    description: 'Лёгкая версия — только ногти и кутикула, без полной обработки стоп.',
    includes: ['Обработка кутикулы', 'Опил формы', 'Покрытие гель-лаком'],
    weekBookings: 3,
    swatch: ['#06B6D4', '#67E8F9'],
    emoji: '🦶',
  },
  {
    id: 's5', category: 'care',
    name: 'Парафинотерапия рук',
    duration: 45, priceFrom: 1200,
    description: 'Глубокое увлажнение кожи рук парафиновыми ваннами. Снимает сухость, делает кожу мягкой.',
    includes: ['Скраб', 'Парафиновая ванна', 'Массаж рук', 'Питательный крем'],
    weekBookings: 2,
    swatch: ['#10B981', '#6EE7B7'],
    emoji: '🕯️',
  },
  {
    id: 's6', category: 'care',
    name: 'SPA для рук',
    duration: 60, priceFrom: 1800,
    description: 'Комплексный уход: скраб, маска, парафин, массаж. Восстанавливает кожу после зимы.',
    includes: ['Скраб', 'Маска', 'Парафин', 'Массаж'],
    weekBookings: 1,
    swatch: ['#F59E0B', '#FCD34D'],
    emoji: '🌸',
  },
];

// Отзывы клиентов на главной. Меняй текст/имена здесь.
const REVIEWS = [
  {
    name: 'Анна К.', avatar: '🌸', rating: 5,
    service: 'Маникюр с покрытием',
    text: 'Лучший мастер, который у меня был. Покрытие реально держится 4 недели без сколов.',
  },
  {
    name: 'Мария В.', avatar: '✨', rating: 5,
    service: 'Дизайн ногтей',
    text: 'Сделала ровно как на референсе, даже лучше. В студии чисто, всё стерильно.',
  },
  {
    name: 'Ольга П.', avatar: '💖', rating: 5,
    service: 'Педикюр',
    text: 'Хожу уже год — аккуратно, быстро, без боли. Рекомендую всем подругам.',
  },
];

// Генерация слотов на день. Рабочий день 10:00–20:00, шаг 30 мин.
// Занятость псевдослучайная по seed = дата+услуга, чтобы было детерминированно.
function getSlots(dateISO, serviceId) {
  const slots = [];
  const start = 10, end = 20;
  const seed = hashCode(dateISO + serviceId);
  for (let h = start; h < end; h++) {
    for (let m = 0; m < 60; m += 30) {
      const idx = (h - start) * 2 + m / 30;
      const taken = ((seed + idx * 31) % 7) < 3; // ~43% занято
      slots.push({
        time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        taken,
      });
    }
  }
  return slots;
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Ближайшие 14 дней для горизонтальной полоски в календаре
function getDays() {
  const days = [];
  const today = new Date();
  const wd = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({
      iso: d.toISOString().slice(0, 10),
      weekday: wd[d.getDay()],
      day: d.getDate(),
      month: months[d.getMonth()],
      isToday: i === 0,
    });
  }
  return days;
}

// Форматирование даты для подтверждения и сводки
function formatDateHuman(iso) {
  const d = new Date(iso);
  const wd = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return `${wd[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

function fmtPrice(p) {
  return p.toLocaleString('ru-RU') + ' ₽';
}
