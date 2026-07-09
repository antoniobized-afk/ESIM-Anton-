export const LOYALTY_LEVEL_PRESENTATION_VARIANTS = [
  'none',
  'slate',
  'bronze',
  'silver',
  'gold',
  'platinum',
  'emerald',
  'sky',
  'rose',
  'teal',
] as const;

export type LoyaltyLevelPresentationVariant =
  (typeof LOYALTY_LEVEL_PRESENTATION_VARIANTS)[number];

export type LoyaltyLevelPresentationInput = {
  id?: string | null;
  name?: string | null;
};

export type LoyaltyLevelPresentation = {
  label: string;
  variant: LoyaltyLevelPresentationVariant;
  seeded: boolean;
};

const SEEDED_LEVEL_VARIANTS: Record<string, LoyaltyLevelPresentationVariant> = {
  Новичок: 'slate',
  Бронза: 'bronze',
  Серебро: 'silver',
  Золото: 'gold',
  Платина: 'platinum',
};

const CUSTOM_LEVEL_VARIANTS = [
  'emerald',
  'sky',
  'rose',
  'teal',
] as const satisfies readonly LoyaltyLevelPresentationVariant[];

const EMPTY_LEVEL_PRESENTATION: LoyaltyLevelPresentation = {
  label: 'Без уровня',
  variant: 'none',
  seeded: false,
};

export function resolveLoyaltyLevelPresentation(
  level: LoyaltyLevelPresentationInput | null | undefined,
): LoyaltyLevelPresentation {
  const label = normalizeLevelName(level?.name);

  if (!label) {
    return EMPTY_LEVEL_PRESENTATION;
  }

  const seededVariant = SEEDED_LEVEL_VARIANTS[label];

  if (seededVariant) {
    return {
      label,
      variant: seededVariant,
      seeded: true,
    };
  }

  return {
    label,
    variant: resolveCustomLevelVariant(level?.id ?? label),
    seeded: false,
  };
}

function normalizeLevelName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
}

function resolveCustomLevelVariant(seed: string): LoyaltyLevelPresentationVariant {
  const normalizedSeed = seed.trim().toLowerCase();
  const hash = normalizedSeed
    .split('')
    .reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);

  return CUSTOM_LEVEL_VARIANTS[hash % CUSTOM_LEVEL_VARIANTS.length];
}
