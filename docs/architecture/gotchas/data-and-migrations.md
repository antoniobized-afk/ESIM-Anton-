# Data and Migrations Gotchas

> [Назад к оглавлению](./README.md)

- `backend` больше не должен использовать `db push` как основную production стратегию; baseline migration добавлен, новые schema changes нужно вести через migrations.
- `backend/prisma/seed.ts` создаёт продукты без `upsert`, поэтому повторный запуск может раздувать каталог дубликатами.
- исторически проект жил без `prisma/migrations`; после добавления baseline migration существующие БД нужно baseline/apply'ить осознанно, а не смешивать с ручными `db push`.
- После Phase 18 обновленный backend runtime ожидает таблицы `user_identities` и `user_identity_audit`: `prisma migrate deploy` должен пройти до старта новой версии backend. Запуск обновленного resolver-а на БД без additive migration приведет к runtime errors, а не к безопасному fallback.
- Phase 18 identity backfill нельзя запускать как migration side effect. Канонический порядок: `phase18:identity-backfill` dry-run -> классификация blocking conflicts -> `phase18:identity-backfill --apply` -> повторный dry-run на идемпотентность.
- На Windows `pnpm prisma generate` может упираться в lock `query_engine-windows.dll.node`; если нужен только refresh типов после schema change, рабочий обход — `pnpm prisma generate --no-engine`.
- После `prisma migrate dev` Prisma Client может остаться stale, если `node_modules/.pnpm/@prisma+client` не был пересоздан postinstall-ом. Симптом — `P6001: the URL must start with the protocol prisma://` при корректном `postgresql://` в `DATABASE_URL`. Решение: явный `npx prisma generate` в `backend/`. Обнаружено при Phase 16: binary client от 07.05 не соответствовал schema от 19.05.
- Ещё один симптом того же drift-класса: `PrismaClientKnownRequestError` на простых вызовах вроде `this.prisma.esimProduct.count()` во время `onModuleInit()`, хотя сама модель существует. Подтверждённый root cause — запуск backend на несогласованной связке `applied migrations / generated Prisma Client / dist build`. Канонический recovery порядок: `npx prisma migrate deploy` -> `npx prisma generate` -> `npm run build` -> `npm run start`.
