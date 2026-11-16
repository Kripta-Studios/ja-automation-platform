/** Canonical operational category values shared by expense intake and Finance policy forms. */
export const expenseCategories = [
  ['hotel', 'Hotel'],
  ['rental_car', 'Rental car'],
  ['fuel', 'Fuel'],
  ['tolls', 'Tolls'],
  ['parking', 'Parking'],
  ['airfare', 'Airfare'],
  ['ground_transport', 'Train / bus / taxi / rideshare'],
  ['meals', 'Meals'],
  ['per_diem', 'Per diem'],
  ['materials', 'Project materials'],
  ['tools', 'Tools / consumables'],
  ['shipping', 'Shipping'],
  ['phone_data', 'Phone / data'],
  ['visa_permit', 'Visa / permit'],
  ['other', 'Other'],
] as const;

/**
 * The short list workers see first (phone-friendly chips). Every other
 * canonical category stays available behind "More…". `copy` is the key in
 * sections/expense-copy.ts.
 */
export const primaryExpenseCategories = [
  { value: 'meals', copy: 'catMeals' },
  { value: 'hotel', copy: 'catHotel' },
  { value: 'fuel', copy: 'catFuel' },
  { value: 'ground_transport', copy: 'catTransport' },
  { value: 'materials', copy: 'catMaterials' },
  { value: 'other', copy: 'catOther' },
] as const;
