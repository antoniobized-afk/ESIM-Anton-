import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ReferralPayoutMode } from '@prisma/client';

type PartnerRewardPolicyInput = {
  referralOwnerId?: string | null;
  referralBonusPercent?: number | null;
  referralPayoutMode?: ReferralPayoutMode | null;
};

function hasValue(value: unknown) {
  return value !== undefined && value !== null;
}

@ValidatorConstraint({ name: 'PartnerRewardPolicyComplete', async: false })
export class PartnerRewardPolicyCompleteConstraint
  implements ValidatorConstraintInterface
{
  validate(_: unknown, args: ValidationArguments) {
    const dto = args.object as PartnerRewardPolicyInput;
    const hasOwner = hasValue(dto.referralOwnerId);
    const hasBonusPercent = hasValue(dto.referralBonusPercent);
    const hasPayoutMode = hasValue(dto.referralPayoutMode);
    const hasAnyRewardField = hasOwner || hasBonusPercent || hasPayoutMode;

    if (!hasAnyRewardField) return true;

    if (dto.referralOwnerId === null) {
      return !hasBonusPercent && !hasPayoutMode;
    }

    return hasOwner && hasBonusPercent && hasPayoutMode;
  }

  defaultMessage() {
    return 'referralOwnerId, referralBonusPercent и referralPayoutMode должны передаваться вместе; для снятия владельца передайте referralOwnerId=null без reward-полей';
  }
}

export function IsPartnerRewardPolicyComplete(
  validationOptions?: ValidationOptions,
) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: PartnerRewardPolicyCompleteConstraint,
    });
  };
}
