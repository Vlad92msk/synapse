import { useNavigate } from 'react-router-dom'
import { useDocumentation } from '@shared/hooks/useDocumentation'
import { Head } from 'vite-react-ssg'

import i18n from '../../i18n/config'

import style from './VideoPage.module.css'

const SITE = 'https://synapse-homepage.web.app'

// Видео лежит в Google Drive (доступ «все, у кого есть ссылка»): трафик идёт через Drive,
// хостинг сайта отдаёт только эту страницу. Сменить видео — поменять id файла.
const DRIVE_FILE_ID = '1j7dsQoxzGSpxoafGGFljFklbMJiziK3G'
const DRIVE_EMBED = `https://drive.google.com/file/d/${DRIVE_FILE_ID}/preview`
const DRIVE_VIEW = `https://drive.google.com/file/d/${DRIVE_FILE_ID}/view`

// Главы — начала блоков ролика (video/media/overview/chapters.txt)
const CHAPTERS: [string, string, string][] = [
  ['0:00', 'Обложка', 'Intro'],
  ['0:15', 'Зачем: стек из четырёх библиотек и клей', 'Why: four libraries and the glue'],
  ['0:45', 'Два слоя', 'Two layers'],
  ['1:26', 'Хранилище', 'Storage'],
  ['2:20', 'Смена хранилища: LocalStorage и IndexedDB', 'Switching storage: LocalStorage and IndexedDB'],
  ['3:32', 'Middleware', 'Middleware'],
  ['4:35', 'В React', 'In React'],
  ['4:54', 'Селекторы', 'Selectors'],
  ['6:16', 'API-клиент', 'API client'],
  ['8:26', 'Диспетчер и сборка синапса', 'Dispatcher and assembling a synapse'],
  ['9:54', 'Эффекты', 'Effects'],
  ['14:41', 'SSR', 'SSR'],
  ['17:07', 'Синапсы в реальном проекте', 'Synapses in a real project'],
  ['20:11', 'Что ещё есть и чего нет', 'What else there is, and what is missing'],
  ['21:16', 'Сколько это стоит', 'What it costs'],
]

export const VideoPage = () => {
  const { t, currentLocale } = useDocumentation()
  const navigate = useNavigate()
  const en = currentLocale === 'en'
  const title = t('video.title')
  const description = t('video.subtitle')
  // превью ссылки — всегда по-русски: ролик на русском, пререндер сайта — на английском
  const tRu = i18n.getFixedT('ru')
  const ogTitle = tRu('video.title')
  const ogDescription = tRu('video.subtitle')

  return (
    <>
      <Head>
        <title>{`${title} · Synapse Storage`}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${SITE}/video`} />
        {/* превью ссылки в мессенджерах — свои, а не от главной */}
        <meta property="og:type" content="video.other" />
        <meta property="og:locale" content="ru_RU" />
        <meta property="og:title" content={ogTitle} />
        <meta property="og:description" content={ogDescription} />
        <meta property="og:url" content={`${SITE}/video`} />
        <meta property="og:image" content={`${SITE}/video-poster.jpg`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="675" />
        <meta property="og:image:type" content="image/jpeg" />
        <meta property="og:image:alt" content={ogTitle} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={ogTitle} />
        <meta name="twitter:description" content={ogDescription} />
        <meta name="twitter:image" content={`${SITE}/video-poster.jpg`} />
      </Head>
      <div className={style.page}>
        <div className={style.container}>
          <div className={style.eyebrow}>{t('video.eyebrow')}</div>
          <h1 className={style.title}>{title}</h1>
          <p className={style.subtitle}>
            {description} {en && <span className={style.lang}>{t('video.language')}</span>}
          </p>

          <div className={style.player}>
            <iframe src={DRIVE_EMBED} title={title} allow="autoplay; fullscreen" allowFullScreen loading="lazy" />
          </div>

          <div className={style.actions}>
            <a className={style.btnGhost} href={DRIVE_VIEW} target="_blank" rel="noopener noreferrer">
              {t('video.openDrive')}
            </a>
            <button type="button" className={style.btnPrimary} onClick={() => navigate('/docs/architecture')}>
              {t('video.readDocs')}
            </button>
          </div>

          <h2 className={style.chaptersTitle}>{t('video.chapters')}</h2>
          <ol className={style.chapters}>
            {CHAPTERS.map(([time, ru, enTitle]) => (
              <li key={time}>
                <span className={style.time}>{time}</span>
                <span>{en ? enTitle : ru}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  )
}
