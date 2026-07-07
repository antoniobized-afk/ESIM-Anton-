const PROVIDER_REGION_CODE_RE = /^[A-Z][A-Z-]*-\d+$/i;

const NAME_TO_ISO: Record<string, string> = {
  afghanistan: 'AF', albania: 'AL', algeria: 'DZ', andorra: 'AD', angola: 'AO',
  antigua: 'AG', argentina: 'AR', armenia: 'AM', australia: 'AU', austria: 'AT',
  azerbaijan: 'AZ', bahamas: 'BS', bahrain: 'BH', bangladesh: 'BD', barbados: 'BB',
  belarus: 'BY', belgium: 'BE', belize: 'BZ', benin: 'BJ', bermuda: 'BM',
  bhutan: 'BT', bolivia: 'BO', bosnia: 'BA', botswana: 'BW', brazil: 'BR',
  brunei: 'BN', bulgaria: 'BG', burkina: 'BF', 'burkina faso': 'BF', burundi: 'BI',
  cambodia: 'KH', cameroon: 'CM', canada: 'CA', 'cape verde': 'CV', chad: 'TD',
  chile: 'CL', china: 'CN', colombia: 'CO', comoros: 'KM', congo: 'CG',
  'democratic republic of the congo': 'CD', 'dr congo': 'CD', 'central african republic': 'CF', car: 'CF',
  'costa rica': 'CR', croatia: 'HR', cuba: 'CU', curacao: 'CW', cyprus: 'CY',
  czech: 'CZ', czechia: 'CZ', denmark: 'DK', djibouti: 'DJ', dominica: 'DM',
  dominican: 'DO', 'dominican republic': 'DO', ecuador: 'EC', egypt: 'EG',
  'el salvador': 'SV', 'equatorial guinea': 'GQ', eritrea: 'ER', estonia: 'EE',
  eswatini: 'SZ', ethiopia: 'ET', fiji: 'FJ', finland: 'FI', france: 'FR',
  gabon: 'GA', gambia: 'GM', georgia: 'GE', germany: 'DE', ghana: 'GH',
  gibraltar: 'GI', greece: 'GR', greenland: 'GL', grenada: 'GD', guadeloupe: 'GP',
  guam: 'GU', guatemala: 'GT', guernsey: 'GG', guinea: 'GN', 'guinea-bissau': 'GW',
  guyana: 'GY', haiti: 'HT', honduras: 'HN', 'hong kong': 'HK', hungary: 'HU',
  iceland: 'IS', india: 'IN', indonesia: 'ID', iran: 'IR', iraq: 'IQ',
  ireland: 'IE', 'isle of man': 'IM', israel: 'IL', italy: 'IT', 'ivory coast': 'CI', "cote d'ivoire": 'CI',
  jamaica: 'JM', japan: 'JP', jersey: 'JE', jordan: 'JO', kazakhstan: 'KZ',
  kenya: 'KE', kiribati: 'KI', korea: 'KR', 'south korea': 'KR', 'north korea': 'KP',
  kosovo: 'XK', kuwait: 'KW', kyrgyzstan: 'KG', laos: 'LA', latvia: 'LV',
  lebanon: 'LB', lesotho: 'LS', liberia: 'LR', libya: 'LY', liechtenstein: 'LI',
  lithuania: 'LT', luxembourg: 'LU', macao: 'MO', macau: 'MO', madagascar: 'MG',
  malawi: 'MW', malaysia: 'MY', maldives: 'MV', mali: 'ML', malta: 'MT',
  marshall: 'MH', martinique: 'MQ', mauritania: 'MR', mauritius: 'MU',
  mexico: 'MX', micronesia: 'FM', moldova: 'MD', monaco: 'MC', mongolia: 'MN',
  montenegro: 'ME', montserrat: 'MS', morocco: 'MA', mozambique: 'MZ',
  myanmar: 'MM', namibia: 'NA', nauru: 'NR', nepal: 'NP', netherlands: 'NL',
  'new caledonia': 'NC', 'new zealand': 'NZ', nicaragua: 'NI', niger: 'NE',
  nigeria: 'NG', 'north macedonia': 'MK', macedonia: 'MK', norway: 'NO',
  oman: 'OM', pakistan: 'PK', palau: 'PW', palestine: 'PS', panama: 'PA',
  papua: 'PG', 'papua new guinea': 'PG', paraguay: 'PY', peru: 'PE',
  philippines: 'PH', poland: 'PL', portugal: 'PT', 'puerto rico': 'PR',
  qatar: 'QA', reunion: 'RE', romania: 'RO', russia: 'RU', rwanda: 'RW',
  'saint kitts': 'KN', 'saint lucia': 'LC', 'saint vincent': 'VC', samoa: 'WS',
  'san marino': 'SM', 'saudi arabia': 'SA', senegal: 'SN', serbia: 'RS',
  seychelles: 'SC', 'sierra leone': 'SL', singapore: 'SG', 'sint maarten': 'SX',
  slovakia: 'SK', slovenia: 'SI', solomon: 'SB', somalia: 'SO', 'south africa': 'ZA',
  'south sudan': 'SS', spain: 'ES', 'sri lanka': 'LK', sudan: 'SD', suriname: 'SR',
  sweden: 'SE', switzerland: 'CH', syria: 'SY', taiwan: 'TW', tajikistan: 'TJ',
  tanzania: 'TZ', thailand: 'TH', timor: 'TL', togo: 'TG', tonga: 'TO',
  trinidad: 'TT', 'trinidad and tobago': 'TT', tunisia: 'TN', turkey: 'TR',
  turkiye: 'TR', turkmenistan: 'TM', turks: 'TC', tuvalu: 'TV', uganda: 'UG',
  ukraine: 'UA', 'united arab emirates': 'AE', uae: 'AE', 'united kingdom': 'GB',
  uk: 'GB', 'united states': 'US', usa: 'US', uruguay: 'UY', uzbekistan: 'UZ',
  vanuatu: 'VU', vatican: 'VA', venezuela: 'VE', vietnam: 'VN', 'viet nam': 'VN',
  yemen: 'YE', zambia: 'ZM', zimbabwe: 'ZW',
  europe: 'EU', asia: 'AS', africa: 'AF', global: 'XX', world: 'XX', worldwide: 'XX',
};

const RUSSIAN_TO_ISO: Record<string, string> = {
  россия: 'RU', турция: 'TR', египет: 'EG', оаэ: 'AE',
  китай: 'CN', грузия: 'GE', таиланд: 'TH', япония: 'JP',
  германия: 'DE', франция: 'FR', италия: 'IT', испания: 'ES',
  сша: 'US', великобритания: 'GB', индия: 'IN', бразилия: 'BR',
  австралия: 'AU', канада: 'CA', мексика: 'MX', португалия: 'PT',
  нидерланды: 'NL', польша: 'PL', бельгия: 'BE', австрия: 'AT',
  швейцария: 'CH', швеция: 'SE', норвегия: 'NO', дания: 'DK',
  финляндия: 'FI', греция: 'GR', румыния: 'RO', венгрия: 'HU',
  чехия: 'CZ', израиль: 'IL', корея: 'KR', сингапур: 'SG',
  малайзия: 'MY', индонезия: 'ID', вьетнам: 'VN', пакистан: 'PK',
  казахстан: 'KZ', узбекистан: 'UZ', азербайджан: 'AZ',
  армения: 'AM', беларусь: 'BY', украина: 'UA', гонконг: 'HK',
  тайвань: 'TW', 'саудовская аравия': 'SA', катар: 'QA',
  марокко: 'MA', нигерия: 'NG', кения: 'KE',
};

const PROVIDER_CODE_NAMES_RU: Record<string, string> = {
  'AF-29': 'Африка',
  'AS-5': 'Центральная и Южная Азия', 'AS-7': 'Юго-Восточная Азия', 'AS-12': 'Азия',
  'AS-20': 'Азиатско-Тихоокеанский регион', 'AS-21': 'Азия расширенная',
  'BI-2': 'Великобритания и Ирландия', 'CA-4': 'Центральная Азия',
  'CB-25': 'Карибы и Латинская Америка',
  'CN-3': 'Китай и регион', 'CNHK-2': 'Китай и Гонконг', 'CNJPKR-3': 'Китай, Япония и Корея',
  'EU-7': 'Балканы', 'EU-30': 'Европа', 'EU-42': 'Европа', 'EU-43': 'Европа и Марокко',
  'GL-120': 'Глобальный 120+ стран', 'GL-139': 'Глобальный 139 стран',
  'ME-6': 'Персидский залив', 'ME-12': 'Ближний Восток и Северная Африка', 'ME-13': 'Ближний Восток',
  'NA-3': 'Северная Америка', 'SA-18': 'Южная Америка',
  'AUKUS-3': 'Австралия, Великобритания и США', 'AUNZ-2': 'Австралия и Новая Зеландия',
  'IESI-2': 'Ирландия и Великобритания', 'JPKR-2': 'Япония и Корея', 'O-OC-3': 'Океания',
  'SAAEQAKWOMBH-6': 'Аравийский полуостров', 'SGMY-2': 'Сингапур и Малайзия',
  'SGMYTH-3': 'Сингапур, Малайзия и Таиланд',
  'SGMYVNTHID-5': 'Сингапур, Малайзия, Вьетнам, Таиланд и Индонезия',
  'USCA-2': 'США и Канада',
};

const PROVIDER_PREFIX_NAMES_RU: Record<string, string> = {
  AF: 'Африка', AS: 'Азия', EU: 'Европа', NA: 'Северная Америка', LA: 'Латинская Америка',
  OC: 'Океания', ME: 'Ближний Восток', GL: 'Глобальный', WW: 'Глобальный',
  SA: 'Южная Америка', CA: 'Центральная Азия', CB: 'Карибские острова',
  CN: 'Китай и регион', BI: 'Великобритания и Ирландия',
};

const COUNTRY_NAMES_RU: Record<string, string> = {
  AD: 'Андорра', AE: 'ОАЭ', AF: 'Афганистан', AG: 'Антигуа',
  AI: 'Ангилья', AL: 'Албания', AM: 'Армения', AO: 'Ангола',
  AR: 'Аргентина', AS: 'Азия', AT: 'Австрия', AU: 'Австралия',
  AX: 'Аланды', AZ: 'Азербайджан', BA: 'Босния', BB: 'Барбадос',
  BD: 'Бангладеш', BE: 'Бельгия', BF: 'Буркина-Фасо', BG: 'Болгария',
  BH: 'Бахрейн', BJ: 'Бенин', BM: 'Бермуды', BN: 'Бруней',
  BO: 'Боливия', BR: 'Бразилия', BS: 'Багамы', BT: 'Бутан',
  BW: 'Ботсвана', BY: 'Беларусь', BZ: 'Белиз', CA: 'Канада',
  CD: 'Конго', CF: 'ЦАР', CG: 'Конго', CH: 'Швейцария',
  CI: "Кот-д'Ивуар", CL: 'Чили', CM: 'Камерун', CN: 'Китай',
  CO: 'Колумбия', CR: 'Коста-Рика', CU: 'Куба', CV: 'Кабо-Верде',
  CW: 'Кюрасао', CY: 'Кипр', CZ: 'Чехия', DE: 'Германия',
  DJ: 'Джибути', DK: 'Дания', DM: 'Доминика', DO: 'Доминикана',
  DZ: 'Алжир', EC: 'Эквадор', EE: 'Эстония', EG: 'Египет',
  ER: 'Эритрея', ES: 'Испания', ET: 'Эфиопия', EU: 'Европа',
  FI: 'Финляндия', FJ: 'Фиджи', FK: 'Фолкленды', FM: 'Микронезия',
  FO: 'Фареры', FR: 'Франция', GA: 'Габон', GB: 'Британия',
  GD: 'Гренада', GE: 'Грузия', GF: 'Гвиана', GG: 'Гернси',
  GH: 'Гана', GI: 'Гибралтар', GL: 'Гренландия', GM: 'Гамбия',
  GN: 'Гвинея', GP: 'Гваделупа', GQ: 'Экв. Гвинея', GR: 'Греция',
  GT: 'Гватемала', GU: 'Гуам', GW: 'Гвинея-Бисау', GY: 'Гайана',
  HK: 'Гонконг', HN: 'Гондурас', HR: 'Хорватия', HT: 'Гаити',
  HU: 'Венгрия', ID: 'Индонезия', IE: 'Ирландия', IL: 'Израиль',
  IM: 'Мэн', IN: 'Индия', IQ: 'Ирак', IR: 'Иран',
  IS: 'Исландия', IT: 'Италия', JE: 'Джерси', JM: 'Ямайка',
  JO: 'Иордания', JP: 'Япония', KE: 'Кения', KG: 'Киргизия',
  KH: 'Камбоджа', KI: 'Кирибати', KM: 'Коморы', KN: 'Сент-Китс',
  KP: 'КНДР', KR: 'Корея', KW: 'Кувейт', KY: 'Кайманы',
  KZ: 'Казахстан', LA: 'Лаос', LB: 'Ливан', LC: 'Сент-Люсия',
  LI: 'Лихтенштейн', LK: 'Шри-Ланка', LR: 'Либерия', LS: 'Лесото',
  LT: 'Литва', LU: 'Люксембург', LV: 'Латвия', LY: 'Ливия',
  MA: 'Марокко', MC: 'Монако', MD: 'Молдова', ME: 'Черногория',
  MG: 'Мадагаскар', MH: 'Маршаллы', MK: 'Македония', ML: 'Мали',
  MM: 'Мьянма', MN: 'Монголия', MO: 'Макао', MP: 'Марианы',
  MQ: 'Мартиника', MR: 'Мавритания', MS: 'Монтсеррат', MT: 'Мальта',
  MU: 'Маврикий', MV: 'Мальдивы', MW: 'Малави', MX: 'Мексика',
  MY: 'Малайзия', MZ: 'Мозамбик', NA: 'Намибия', NC: 'Каледония',
  NE: 'Нигер', NF: 'Норфолк', NG: 'Нигерия', NI: 'Никарагуа',
  NL: 'Нидерланды', NO: 'Норвегия', NP: 'Непал', NR: 'Науру',
  NU: 'Ниуэ', NZ: 'Н. Зеландия', OM: 'Оман', PA: 'Панама',
  PE: 'Перу', PF: 'Полинезия', PG: 'Папуа', PH: 'Филиппины',
  PK: 'Пакистан', PL: 'Польша', PM: 'Сен-Пьер', PN: 'Питкэрн',
  PR: 'Пуэрто-Рико', PS: 'Палестина', PT: 'Португалия', PW: 'Палау',
  PY: 'Парагвай', QA: 'Катар', RE: 'Реюньон', RO: 'Румыния',
  RS: 'Сербия', RU: 'Россия', RW: 'Руанда', SA: 'Сауд. Аравия',
  SB: 'Соломоны', SC: 'Сейшелы', SD: 'Судан', SE: 'Швеция',
  SG: 'Сингапур', SH: 'Св. Елена', SI: 'Словения', SK: 'Словакия',
  SL: 'Сьерра-Леоне', SM: 'Сан-Марино', SN: 'Сенегал', SO: 'Сомали',
  SR: 'Суринам', SS: 'Юж. Судан', ST: 'Сан-Томе', SV: 'Сальвадор',
  SX: 'Синт-Мартен', SY: 'Сирия', SZ: 'Эсватини', TC: 'Тёркс',
  TD: 'Чад', TG: 'Того', TH: 'Таиланд', TJ: 'Таджикистан',
  TK: 'Токелау', TL: 'Тимор', TM: 'Туркмения', TN: 'Тунис',
  TO: 'Тонга', TR: 'Турция', TT: 'Тринидад', TV: 'Тувалу',
  TW: 'Тайвань', TZ: 'Танзания', UA: 'Украина', UG: 'Уганда',
  US: 'США', UY: 'Уругвай', UZ: 'Узбекистан', VA: 'Ватикан',
  VC: 'Сент-Винсент', VE: 'Венесуэла', VG: 'Брит. Виргины',
  VI: 'Виргины США', VN: 'Вьетнам', VU: 'Вануату', WF: 'Уоллис',
  WS: 'Самоа', XK: 'Косово', YE: 'Йемен', YT: 'Майотта',
  ZA: 'ЮАР', ZM: 'Замбия', ZW: 'Зимбабве', XX: 'Мир',
};

const EXPLICIT_MULTI_COUNTRY_CODES = new Set([
  'AUKUS-3', 'AUNZ-2', 'CNHK-2', 'CNJPKR-3', 'IESI-2', 'JPKR-2',
  'SAAEQAKWOMBH-6', 'SGMY-2', 'SGMYTH-3', 'SGMYVNTHID-5', 'USCA-2',
]);

export function isProviderRegionCode(value?: string | null): boolean {
  return Boolean(value && PROVIDER_REGION_CODE_RE.test(value.trim()));
}

function hasListSeparator(value: string): boolean {
  return /[,;&]/.test(value);
}

function getProviderPrefix(value: string): string | null {
  const match = value.trim().toUpperCase().match(/^([A-Z]{1,2})(?:-[A-Z]{2})?-\d+$/);
  return match?.[1] ?? null;
}

function getProviderAreaCount(value: string): number | null {
  const match = value.trim().toUpperCase().match(/-(\d+)$/);
  if (!match) return null;

  const count = Number(match[1]);
  return Number.isFinite(count) ? count : null;
}

function pluralizeCountry(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) return 'стран';
  if (last === 1) return 'страна';
  if (last >= 2 && last <= 4) return 'страны';
  return 'стран';
}

function getIntlRegionName(code: string): string | null {
  if (!/^[A-Z]{2}$/.test(code)) return null;

  try {
    const name = new Intl.DisplayNames(['ru'], { type: 'region' }).of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

export function getCountryCode(country: string): string {
  if (!country) return 'XX';

  const trimmed = country.trim();
  if (isProviderRegionCode(trimmed)) return 'XX';

  if (/[а-яА-ЯёЁ]/.test(trimmed)) {
    return RUSSIAN_TO_ISO[trimmed.toLowerCase()] || 'XX';
  }

  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const match = trimmed.match(/^([A-Za-z]{2})(?:[-_\s].*)$/);
  if (match) return match[1].toUpperCase();

  const key = trimmed.toLowerCase();
  if (NAME_TO_ISO[key]) return NAME_TO_ISO[key];
  if (hasListSeparator(key)) return 'XX';

  for (const [name, code] of Object.entries(NAME_TO_ISO)) {
    if (key.includes(name) || name.includes(key)) return code;
  }

  return 'XX';
}

export function getCountryName(country: string): string {
  if (!country) return 'Мир';

  const trimmed = country.trim();
  const upperKey = trimmed.toUpperCase();
  if (PROVIDER_CODE_NAMES_RU[upperKey]) return PROVIDER_CODE_NAMES_RU[upperKey];
  if (/[а-яА-ЯёЁ]/.test(trimmed)) return trimmed;

  if (isProviderRegionCode(trimmed)) {
    const prefix = getProviderPrefix(trimmed);
    return prefix ? PROVIDER_PREFIX_NAMES_RU[prefix] || 'Региональный пакет' : 'Региональный пакет';
  }

  if (hasListSeparator(trimmed)) return trimmed;

  const key = trimmed.toLowerCase();
  if (key === 'global' || key === 'world' || key === 'worldwide') return 'Мир';

  const code = getCountryCode(trimmed);
  if (code === 'XX' && upperKey !== 'XX') return trimmed;

  return COUNTRY_NAMES_RU[code] || getIntlRegionName(code) || trimmed;
}

export function getCountryFilterLabel(country: string): string {
  const label = getCountryName(country);
  const upperKey = country.trim().toUpperCase();

  if (!isProviderRegionCode(country) || EXPLICIT_MULTI_COUNTRY_CODES.has(upperKey)) {
    return label;
  }

  const count = getProviderAreaCount(country);
  if (!count || /\d+\+?\s*стран/.test(label)) return label;

  return `${label} (${count} ${pluralizeCountry(count)})`;
}

export function isMultiCountryValue(country?: string | null): boolean {
  if (!country) return false;

  const trimmed = country.trim();
  if (!trimmed) return false;
  if (isProviderRegionCode(trimmed)) return true;
  if (hasListSeparator(trimmed)) return true;

  const lower = trimmed.toLowerCase();
  return [
    'global', 'world', 'worldwide', 'europe', 'asia', 'africa', 'america',
    'regional', 'multi', 'глобал', 'мир', 'евро', 'ази', 'афри', 'америк', 'регион',
  ].some((keyword) => lower.includes(keyword));
}
