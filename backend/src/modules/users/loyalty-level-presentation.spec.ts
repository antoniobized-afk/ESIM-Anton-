import { resolveLoyaltyLevelPresentation } from '@shared/loyalty-level-presentation';

describe('resolveLoyaltyLevelPresentation', () => {
  it('назначает seeded levels стабильным variants', () => {
    expect(resolveLoyaltyLevelPresentation({ id: 'custom-id', name: 'Новичок' })).toEqual({
      label: 'Новичок',
      variant: 'slate',
      seeded: true,
    });
    expect(resolveLoyaltyLevelPresentation({ name: 'Бронза' }).variant).toBe('bronze');
    expect(resolveLoyaltyLevelPresentation({ name: 'Серебро' }).variant).toBe('silver');
    expect(resolveLoyaltyLevelPresentation({ name: 'Золото' }).variant).toBe('gold');
    expect(resolveLoyaltyLevelPresentation({ name: 'Платина' }).variant).toBe('platinum');
  });

  it('держит custom level variant детерминированным по id', () => {
    const first = resolveLoyaltyLevelPresentation({ id: 'level_custom_1', name: 'VIP' });
    const second = resolveLoyaltyLevelPresentation({ id: 'level_custom_1', name: 'VIP plus' });

    expect(first.variant).toBe(second.variant);
    expect(first.seeded).toBe(false);
  });

  it('использует name как fallback seed для custom levels без id', () => {
    const first = resolveLoyaltyLevelPresentation({ name: 'Ambassador' });
    const second = resolveLoyaltyLevelPresentation({ name: 'Ambassador' });

    expect(first.variant).toBe(second.variant);
    expect(first.label).toBe('Ambassador');
  });

  it('не маскирует отсутствующий cached level под seeded Новичок', () => {
    expect(resolveLoyaltyLevelPresentation(null)).toEqual({
      label: 'Без уровня',
      variant: 'none',
      seeded: false,
    });
  });
});
