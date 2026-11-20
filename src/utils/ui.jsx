export const Avatar = ({ name, size = 'h-10 w-10' }) => (
  <div className={`${size} flex shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white`}>{(name || '?')[0].toUpperCase()}</div>
)
export const CATEGORIES = ['Rent', 'Electricity', 'Water', 'Internet', 'Groceries', 'Supplies', 'Food', 'Others']
const CATEGORY_SET = new Set(CATEGORIES)
export const catLabel = (c) => (CATEGORY_SET.has(c) ? c : 'Others')
const ICONS = { Rent: '🏠', Electricity: '⚡', Water: '💧', Internet: '🌐', Groceries: '🛒', Supplies: '📦', Food: '🍜', Others: '🧾' }
export const catIcon = (c) => ICONS[c] || ICONS.Others
