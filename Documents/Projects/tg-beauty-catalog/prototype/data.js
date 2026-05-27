// Моковые данные для прототипа

const MASTER = {
  name: 'Алина Громова',
  specialization: 'Маникюр · педикюр · уход',
  experience: '10 лет в бьюти',
  bio: 'Делаю маникюр, который держится 4 недели. Работаю только с гипоаллергенными материалами. Принимаю в студии на Никольской.',
  address: 'Москва, ул. Никольская, 10',
  hours: 'Пн–Сб · 10:00–20:00',
  telegram: 'https://t.me/interactego',
  stats: { bookings: 312, rating: 4.9 },
};

const CLIENT = {
  firstName: 'Анна',
  phone: null, // ставится после requestContact
};

const CATEGORIES = [
  { id: 'all', name: 'Все' },
  { id: 'manicure', name: 'Маникюр' },
  { id: 'pedicure', name: 'Педикюр' },
  { id: 'care', name: 'Уход' },
];

const SERVICES = [
  {
    id: 's1', category: 'manicure',
    name: 'Маникюр с покрытием',
    duration: 90, priceFrom: 2500,
    short: '90 мин · от 2 500 ₽',
    description: 'Аппаратный маникюр + гель-лак. Покрытие держится 4 недели без сколов. Использую материалы Kodi и CND.',
    includes: ['Снятие старого покрытия', 'Аппаратная обработка', 'Покрытие гель-лаком', 'Уход за кутикулой'],
    weekBookings: 12,
    swatch: ['#c9a84c', '#f0d080'],
  },
  {
    id: 's2', category: 'manicure',
    name: 'Дизайн ногтей',
    duration: 60, priceFrom: 1500,
    short: '60 мин · от 1 500 ₽',
    description: 'Художественная роспись, втирки, фольга, стразы. Цена зависит от сложности.',
    includes: ['Эскиз по референсу', 'Дизайн на 2–10 ногтях', 'Закрепление топом'],
    weekBookings: 7,
    swatch: ['#38c8c0', '#5fd9d2'],
  },
  {
    id: 's3', category: 'pedicure',
    name: 'Педикюр',
    duration: 120, priceFrom: 3500,
    short: '120 мин · от 3 500 ₽',
    description: 'Аппаратный педикюр с обработкой стоп. Снятие натоптышей, уход за ногтями, покрытие гель-лаком.',
    includes: ['Распаривание', 'Обработка стоп', 'Покрытие гель-лаком', 'Массаж стоп'],
    weekBookings: 5,
    swatch: ['#8b6f3a', '#c9a84c'],
  },
  {
    id: 's4', category: 'pedicure',
    name: 'Экспресс-педикюр',
    duration: 60, priceFrom: 2000,
    short: '60 мин · от 2 000 ₽',
    description: 'Лёгкая версия — только ногти и кутикула, без полной обработки стоп.',
    includes: ['Обработка кутикулы', 'Опил формы', 'Покрытие гель-лаком'],
    weekBookings: 3,
    swatch: ['#7a8090', '#a8aebd'],
  },
  {
    id: 's5', category: 'care',
    name: 'Парафинотерапия рук',
    duration: 45, priceFrom: 1200,
    short: '45 мин · от 1 200 ₽',
    description: 'Глубокое увлажнение кожи рук парафиновыми ваннами. Снимает сухость, делает кожу мягкой.',
    includes: ['Скраб', 'Парафиновая ванна', 'Массаж рук', 'Питательный крем'],
    weekBookings: 2,
    swatch: ['#f0d080', '#fce4a8'],
  },
  {
    id: 's6', category: 'care',
    name: 'SPA для рук',
    duration: 60, priceFrom: 1800,
    short: '60 мин · от 1 800 ₽',
    description: 'Комплексный уход: скраб, маска, парафин, массаж. Восстанавливает кожу после зимы.',
    includes: ['Скраб', 'Маска', 'Парафин', 'Массаж'],
    weekBookings: 1,
    swatch: ['#c9a84c', '#38c8c0'],
  },
];

// Слоты: эмулируем рабочий день 10:00–20:00, слоты по 30 мин.
// Часть слотов "занята" псевдослучайно по seed = дата+услуга.
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

// Список ближайших 14 дней
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
      monthShort: months[d.getMonth()],
      isToday: i === 0,
    });
  }
  return days;
}

function formatDateHuman(iso) {
  const d = new Date(iso);
  const wd = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return `${wd[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}
