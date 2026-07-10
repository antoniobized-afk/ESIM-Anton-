import { Prisma } from '@prisma/client';

/**
 * Минимальная проекция пользователя внутри order detail.
 *
 * Orders/payment runtime нужны только contact-поля для уведомлений, а admin
 * использует компактные display-поля. Полный canonical User, его финансовые
 * поля, legacy identity slot и relation-объекты принадлежат users-модулю и не
 * являются частью контракта заказа.
 */
export const ORDER_DETAIL_USER_SELECT = {
  id: true,
  telegramId: true,
  username: true,
  firstName: true,
  lastName: true,
  email: true,
} satisfies Prisma.UserSelect;

export type OrderDetailUserSource = Prisma.UserGetPayload<{
  select: typeof ORDER_DETAIL_USER_SELECT;
}>;

export type OrderDetailUserReadModel = {
  id: string;
  telegramId: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

export function toOrderDetailUserReadModel(
  user: OrderDetailUserSource,
): OrderDetailUserReadModel {
  return {
    id: user.id,
    telegramId: user.telegramId === null ? null : user.telegramId.toString(),
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  };
}
