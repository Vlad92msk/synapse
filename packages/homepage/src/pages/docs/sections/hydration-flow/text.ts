import { useTranslation } from 'react-i18next'

import { Lang, Loc } from './steps'

export const loc = (l: Loc, lang: Lang) => l[lang] ?? l.en

export const useGuideLang = (): Lang => {
  const { i18n } = useTranslation()
  return i18n.language === 'ru' ? 'ru' : 'en'
}

// Общие UI-строки гайда (не i18n-ресурсы — локальная двуязычность, как в steps.ts).
export const TXT = {
  title: { ru: 'Как работает SSR-гидрация', en: 'How SSR hydration works' },
  subtitle: {
    ru: 'Движение и трансформация данных сервер → клиент — на примере ленты покемонов.',
    en: 'How data moves and transforms server → client — on the Pokémon feed example.',
  },
  // Переключатель вариантов
  variantFlow: { ru: 'Полотно', en: 'Canvas' },
  variantScroll: { ru: 'Лента', en: 'Scroll' },
  // Полотно (node-холст)
  in: { ru: 'вход', en: 'in' },
  out: { ru: 'выход', en: 'out' },
  flowHint: { ru: 'Тяните — двигать · колесо — зум · узлы можно перетаскивать', en: 'Drag to pan · wheel to zoom · nodes are draggable' },
  // Зоны (легенда)
  legendServer: { ru: 'Сервер', en: 'Server' },
  legendTransfer: { ru: 'Граница', en: 'Boundary' },
  legendClient: { ru: 'Клиент', en: 'Client' },
  // Стэппер
  step: { ru: 'Шаг', en: 'Step' },
  of: { ru: 'из', en: 'of' },
  prev: { ru: 'Назад', en: 'Prev' },
  next: { ru: 'Далее', en: 'Next' },
  play: { ru: 'Авто', en: 'Play' },
  pause: { ru: 'Пауза', en: 'Pause' },
  close: { ru: 'Закрыть', en: 'Close' },
  hint: { ru: '← → переключают шаги · Esc закрывает', en: '← → switch steps · Esc to close' },
  // Блоки
  what: { ru: 'Что происходит', en: 'What happens' },
  why: { ru: 'Зачем', en: 'Why' },
  transform: { ru: 'Трансформация данных', en: 'Data transformation' },
  noData: {
    ru: 'На этом шаге данные не меняются — это управляющий/инфраструктурный шаг.',
    en: 'No data changes here — this is a control/infrastructure step.',
  },
  scrollHint: { ru: 'Листайте вниз — поток идёт сверху вниз', en: 'Scroll down — the flow goes top to bottom' },
} satisfies Record<string, Loc>
