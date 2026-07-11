// src/vendors/vendors.config.js
const GOOD = (notes) => ({ self_reported_ok: true, notes });
const BAD = (notes) => ({ self_reported_ok: false, notes });

export const VENDOR_ROSTER = [
  {
    id: 'greenblade', name: 'GreenBlade Lawn Care', task_type: 'lawn_mowing', price_range: [40, 65],
    quoteSequence: [45, 50, 55, 50, 60, 55, 50, 45, 55],
    attestationSequence: Array.from({ length: 9 }, () => GOOD('lawn mowed, edges trimmed')),
  },
  {
    id: 'freshcart', name: 'FreshCart Grocery', task_type: 'grocery_restock', price_range: [80, 150],
    quoteSequence: [90, 100, 95, 105, 100, 95, 100, 95, 100],
    attestationSequence: [
      GOOD('all items delivered'),
      GOOD('all items delivered'),
      GOOD('all items delivered'),
      BAD('missing three items, substitutions not approved'),
      GOOD('all items delivered'),
      GOOD('all items delivered'),
      GOOD('all items delivered'),
      GOOD('all items delivered'),
      GOOD('all items delivered'),
    ],
  },
  {
    id: 'quickfix', name: 'QuickFix Plumbing', task_type: 'plumbing_repair', price_range: [150, 400],
    quoteSequence: [200, 250, 220, 300, 180, 210, 260, 190, 240],
    attestationSequence: Array.from({ length: 9 }, () => GOOD('leak repaired, pressure tested')),
  },
];
