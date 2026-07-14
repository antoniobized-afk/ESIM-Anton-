'use client'

import BackHeader from '@/components/BackHeader'

function Step({ num, title, items }: { num: string; title: string; items: string[] }) {
  return (
    <div className="mb-7">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-[#f77430] flex items-center justify-center shrink-0">
          <span className="text-white text-sm font-bold">{num}</span>
        </div>
        <h2 className="font-bold text-gray-900 dark:text-white text-base">{title}</h2>
      </div>
      <ul className="[&>li+li]:mt-2 pl-11">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-gray-700 leading-relaxed flex gap-2">
            <span className="text-[#f77430] shrink-0">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 mb-6">
      <p className="text-sm text-amber-800 leading-relaxed">⚠️ {children}</p>
    </div>
  )
}

export default function IosInstallPage() {


  return (
    <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950 pb-20">
      <BackHeader title="Установка на iPhone" fallbackRoute="/help" className="mb-6" />

        {/* Hero */}
        <div className="card-neutral p-5 mb-6 flex items-center gap-4">
          <svg viewBox="0 0 24 24" className="w-12 h-12 shrink-0" fill="#1a1a1a">
            <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
          </svg>
          <div>
            <p className="font-bold text-gray-900 dark:text-white">iPhone и iPad</p>
            <p className="text-sm text-gray-500">Пошаговая инструкция по установке eSIM MojoMobile</p>
          </div>
        </div>

        <Note>
          QR-код одноразовый — сканируйте его только на том устройстве, с которым поедете в поездку.
        </Note>

        <Step
          num="1"
          title="Подготовка"
          items={[
            'Обновите iOS / iPadOS до актуальной версии.',
            'Убедитесь, что устройство не привязано к конкретному оператору (разблокировано).',
            'Подключитесь к стабильному Wi-Fi или мобильному интернету.',
            'Откройте письмо или личный кабинет MojoMobile — там QR-код и данные SM-DP+ / Activation Code.',
          ]}
        />

        <Step
          num="2"
          title="Установка по QR-коду (рекомендуется)"
          items={[
            'Откройте Настройки → Сотовая связь.',
            'Нажмите «Добавить eSIM» или «Добавить сотовый тариф».',
            'Выберите «Использовать QR-код».',
            'Наведите камеру на QR-код MojoMobile с экрана другого устройства.',
            'Нажмите «Продолжить» в появившемся окне и дождитесь активации.',
          ]}
        />

        <Step
          num="3"
          title="Установка вручную (если QR не сканируется)"
          items={[
            'Откройте Настройки → Сотовая связь → Добавить eSIM.',
            'Нажмите «Ввести вручную» внизу экрана.',
            'Введите SM-DP+ Address и Activation Code из письма или личного кабинета.',
            'Проверьте, что нет лишних пробелов, и нажмите «Далее».',
          ]}
        />

        <Step
          num="4"
          title="Настройка линий"
          items={[
            'Откройте Настройки → Сотовая связь → SIM-карты.',
            'Дайте профилю понятное имя, например «MojoMobile».',
            'В блоке «Мобильные данные» выберите MojoMobile eSIM.',
            'Основную (домашнюю) SIM оставьте для звонков и SMS.',
            'По желанию включите «Разрешить переключение мобильных данных».',
          ]}
        />

        <Step
          num="5"
          title="Активация по прибытии"
          items={[
            'По прилёте выключите режим «в самолёте».',
            'Откройте Настройки → Сотовая связь → Мобильные данные.',
            'Убедитесь, что выбрана MojoMobile eSIM.',
            'В «Параметрах данных» включите «Роуминг данных» для MojoMobile eSIM.',
            'Отключите мобильные данные и роуминг на домашней SIM, чтобы не было лишних расходов.',
            'Подождите несколько минут — устройство подключится к партнёрской сети.',
          ]}
        />

        <Step
          num="6"
          title="Как временно отключить eSIM (не удаляя)"
          items={[
            'Настройки → Сотовая связь → SIM-карты → MojoMobile eSIM.',
            'Переведите переключатель «Включить эту линию» в положение «Выкл.».',
            'Профиль останется в памяти — его можно включить обратно в любой момент.',
          ]}
        />

        <Note>
          Не удаляйте eSIM без необходимости — повторная установка по тому же QR-коду невозможна.
          Если профиль случайно удалён — напишите в поддержку.
        </Note>

        {/* Support CTA */}
        <div className="card-neutral p-5 text-center">
          <p className="text-sm text-gray-600 mb-3">Что-то пошло не так?</p>
          <a
            href="https://telegram.me/mojo_mobile_bot"
            target="_blank"
            rel="noreferrer"
            className="inline-block w-full py-3 rounded-2xl bg-[#f77430] text-white font-semibold text-sm"
          >
            Написать в поддержку
          </a>
        </div>

    </div>
  )
}
