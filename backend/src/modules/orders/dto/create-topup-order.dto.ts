import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type {
  CheckoutPaymentMethod,
  CreateTopupOrderRequest,
} from '@shared/contracts/checkout';

const CHECKOUT_PAYMENT_METHODS: CheckoutPaymentMethod[] = ['card', 'balance'];

export class CreateTopupOrderDto implements CreateTopupOrderRequest {
  @IsString()
  @MaxLength(128)
  packageCode: string;

  @IsOptional()
  @IsIn(CHECKOUT_PAYMENT_METHODS)
  paymentMethod?: CheckoutPaymentMethod;

  // Число дней для Day Pass пополнения (supportTopUpType = 3); 1..365.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  periodNum?: number;
}
