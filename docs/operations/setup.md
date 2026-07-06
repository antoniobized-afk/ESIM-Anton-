# Setup

> [Корневой документ wiki](../README.md)

Актуальный baseline по архитектуре и ограничениям см. в [../architecture/system-overview.md](../architecture/system-overview.md).

## Требования

- Node.js 20+
- `pnpm` 8+ или `npm` 11+ с поддержкой workspaces
- Docker / Docker Compose

Проверка:

```bash
node -v
pnpm -v
docker -v
```

Если `pnpm` недоступен локально, можно работать через `npm workspaces`, но базовый happy path в репозитории всё ещё завязан на `pnpm`.

## 1. Установка зависимостей

### Вариант A. Рекомендуемый

```bash
pnpm install
```

### Вариант B. Если используете npm workspaces

```bash
npm install
```

## 2. Конфигурация

Создайте локальный `.env` на основе `.env.example`:

```bash
copy .env.example .env
```

Для macOS/Linux:

```bash
cp .env.example .env
```

Минимум для локального старта:

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `TELEGRAM_BOT_TOKEN` если нужен реальный bot runtime
- `ESIMACCESS_ACCESS_CODE` и `ESIMACCESS_SECRET_KEY` если нужен реальный eSIM provider

Примечание:

- для локального контура backend должен принимать и `http://localhost:3001`, и `http://localhost:3002`; если используете одно значение `CORS_ORIGIN`, указывайте localhost-origin и не забывайте перезапускать backend после изменения `.env`;
- без eSIM Access credentials backend поднимется, но provider-запросы будут падать;
- без CloudPayments/Robokassa credentials карточные платежные сценарии не будут полностью работоспособны.

## 3. Инфраструктура

```bash
docker-compose up -d
```

Сервисы:

- PostgreSQL 16 на `5432`
- Redis 7 на `6379`

## 4. База данных

### Если используете pnpm

```bash
cd backend
pnpm prisma migrate dev
pnpm prisma:seed
```

### Если используете npm

```bash
cd backend
npx prisma migrate dev
npm run prisma:seed
```

Важно:

- `seed.ts` создаёт админа, loyalty levels, тестовые продукты и system settings;
- products в seed создаются через `create`, не через `upsert`, поэтому повторный запуск может создавать дубликаты.
- в репозитории добавлен baseline migration, поэтому локальный путь теперь тоже должен идти через `Prisma Migrate`, а не через `db push`.

## 5. Запуск приложений

### Общий dev script

#### Через pnpm

```bash
pnpm dev
```

Это запускает:

- `backend`
- `admin`
- `bot`

#### Через npm

```bash
npm run dev
```

### User client отдельно

`client` не входит в корневой `pnpm dev`, его нужно поднимать отдельно:

#### Через pnpm

```bash
cd client
pnpm dev
```

#### Через npm

```bash
cd client
npm run dev
```

## 6. Проверка

- backend docs: `http://localhost:3000/api/docs`
- admin: `http://localhost:3001`
- client: `http://localhost:3002`

## 7. Что проверять руками

Минимальный smoke-test:

1. backend отвечает на `/api/docs`
2. admin открывается и может читать API
3. client открывает каталог
4. bot стартует без падения

## 8. Локальный контур целиком

Если нужен полный рабочий набор процессов, порядок такой:

1. `docker-compose up -d`
2. подготовить `.env`
3. поднять БД-схему и seed в `backend`
4. запустить `backend + admin + bot`
5. отдельно запустить `client`

Итоговые адреса:

- backend: `http://localhost:3000`
- admin: `http://localhost:3001`
- client: `http://localhost:3002`

## Известные ограничения

- в текущем repo admin auth реализован PIN-кодом в браузере, не полноценным backend session flow;
- платежный слой гибридный: CloudPayments и legacy Robokassa сосуществуют;
- часть production-подобных сценариев требует реальных внешних credentials.
