import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { FulfillmentFinalizeException } from '@/modules/orders/orders.service';

/**
 * Перехватывает FulfillmentFinalizeException — ситуацию, когда провайдер
 * выдал eSIM, но локальная финализация заказа не прошла (timeout, deadlock и пр.).
 *
 * Вместо голого "Internal server error" возвращает 409 Conflict с понятным
 * сообщением для пользователя.
 */
@Catch(FulfillmentFinalizeException)
export class FulfillmentExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(FulfillmentExceptionFilter.name);

  catch(exception: FulfillmentFinalizeException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    this.logger.warn(
      `Fulfillment finalize failed: orderId=${exception.orderId}, ` +
      `stage=${exception.stage}, message=${exception.message}`,
    );

    response.status(HttpStatus.CONFLICT).json({
      statusCode: HttpStatus.CONFLICT,
      error: 'FulfillmentFinalizeError',
      message:
        'eSIM успешно выдана, но обработка заказа задержалась. ' +
        'Проверьте раздел «Мои eSIM» — ваша карта должна появиться в течение минуты.',
      orderId: exception.orderId,
      stage: exception.stage,
    });
  }
}
