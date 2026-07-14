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

function Brand({ emoji, name, items }: { emoji: string; name: string; items: string[] }) {
  return (
    <div className="card-neutral p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{emoji}</span>
        <p className="font-semibold text-gray-900 dark:text-white">{name}</p>
      </div>
      <ul className="[&>li+li]:mt-2">
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

export default function AndroidInstallPage() {


  return (
    <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950 pb-20">
      <BackHeader title="Установка на Android" fallbackRoute="/help" className="mb-6" />

        {/* Hero */}
        <div className="card-neutral p-5 mb-6 flex items-center gap-4">
          <svg viewBox="0 0 24 24" className="w-12 h-12 shrink-0" fill="#3DDC84">
            <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4483-.9993.9993-.9993c.5511 0 .9993.4483.9993.9993.0001.5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4483.9993.9993 0 .5511-.4483.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 0 0-.1521-.5676.416.416 0 0 0-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1367 1.0989L4.841 5.4467a.4161.4161 0 0 0-.5677-.1521.4157.4157 0 0 0-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3435-4.1021-2.6892-7.5743-6.1185-9.4396"/>
          </svg>
          <div>
            <p className="font-bold text-gray-900 dark:text-white">Android-смартфоны</p>
            <p className="text-sm text-gray-500">Samsung, Xiaomi, Google Pixel и другие</p>
          </div>
        </div>

        <Note>
          QR-код одноразовый — сканируйте его только на том устройстве, с которым поедете в поездку.
        </Note>

        <Step
          num="1"
          title="Подготовка"
          items={[
            'Убедитесь, что смартфон поддерживает eSIM (в настройках есть пункт «Добавить eSIM»).',
            'Установите актуальные обновления системы (О телефоне → Обновление ПО).',
            'Подключитесь к стабильному Wi-Fi.',
            'Откройте письмо или личный кабинет MojoMobile — там QR-код и данные SM-DP+ / Activation Code.',
          ]}
        />

        {/* By brand */}
        <div className="mb-7">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-[#f77430] flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold">2</span>
            </div>
            <h2 className="font-bold text-gray-900 dark:text-white text-base">Установка по марке устройства</h2>
          </div>

          <Brand
            emoji="📱"
            name="Samsung Galaxy"
            items={[
              'Настройки → Подключения → Диспетчер SIM-карт.',
              'Нажмите «Добавление eSIM» → «Сканировать QR-код поставщика услуг».',
              'Наведите камеру на QR-код MojoMobile и подтвердите добавление.',
              'Откройте Мобильные сети и убедитесь, что для мобильных данных выбрана MojoMobile eSIM.',
            ]}
          />

          <Brand
            emoji="📱"
            name="Xiaomi / Redmi / POCO"
            items={[
              'Настройки → SIM-карты и мобильные сети.',
              'Нажмите «Добавить eSIM» или «Управление eSIM».',
              'Выберите «Сканировать QR-код» и наведите камеру на QR-код MojoMobile.',
              'В разделе «SIM для мобильных данных» выберите MojoMobile eSIM.',
              'При необходимости включите роуминг данных для этой SIM.',
            ]}
          />

          <Brand
            emoji="📱"
            name="Google Pixel и другие"
            items={[
              'Settings → Network & Internet → SIMs.',
              'Нажмите «+ Add eSIM» и выберите «Scan QR code».',
              'Наведите камеру на QR-код MojoMobile.',
              'Убедитесь, что в Mobile data выбрана MojoMobile eSIM.',
            ]}
          />
        </div>

        <Step
          num="3"
          title="Установка вручную (если QR не сканируется)"
          items={[
            'Откройте настройки SIM-карт (см. шаг 2 для вашей марки).',
            'Выберите «Добавить eSIM» → «Ввести код активации вручную».',
            'Введите SM-DP+ Address и Activation Code из письма или личного кабинета.',
            'Проверьте отсутствие лишних пробелов и нажмите «Далее».',
          ]}
        />

        <Step
          num="4"
          title="Настройка мобильных данных и роуминга"
          items={[
            'Настройки → SIM-карты → «SIM для мобильных данных» → выберите MojoMobile eSIM.',
            'Включите «Передача данных» для MojoMobile eSIM.',
            'Включите «Роуминг данных» для этой SIM (если тариф предусматривает международное использование).',
            'Для домашней SIM отключите мобильные данные и роуминг, чтобы не было лишних расходов.',
          ]}
        />

        <Step
          num="5"
          title="Активация по прибытии"
          items={[
            'По прилёте отключите режим «в самолёте».',
            'Убедитесь, что SIM для мобильных данных — MojoMobile eSIM.',
            'Включите передачу данных и роуминг данных для MojoMobile eSIM.',
            'Подождите подключения к партнёрской сети (обычно 1–3 минуты).',
            'Если интернет не появился — перезагрузите устройство и повторите.',
          ]}
        />

        <Step
          num="6"
          title="Как временно отключить eSIM (не удаляя)"
          items={[
            'Откройте настройки SIM-карт.',
            'Выключите переключатель рядом с MojoMobile eSIM или выберите другую SIM для мобильных данных.',
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
