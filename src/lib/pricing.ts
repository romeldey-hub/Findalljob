export interface Pricing {
  amount:        number    // smallest currency unit: paise (INR) or cents (USD)
  currency:      'INR' | 'USD'
  symbol:        string    // '₹' or '$'
  displayFree:   string    // '₹0' or '$0'
  displayPrice:  string    // '₹100' or '$2'
  displayFull:   string    // '₹100/month' or '$2/month'
  countryCode:   string    // 'in' or ''
}

const PRICING: Record<string, Pricing> = {
  in: {
    amount:       10_000,
    currency:     'INR',
    symbol:       '₹',
    displayFree:  '₹0',
    displayPrice: '₹100',
    displayFull:  '₹100/month',
    countryCode:  'in',
  },
  default: {
    amount:       200,
    currency:     'USD',
    symbol:       '$',
    displayFree:  '$0',
    displayPrice: '$2',
    displayFull:  '$2/month',
    countryCode:  '',
  },
}

export function getPricingByCountry(countryCode?: string | null): Pricing {
  const key = (countryCode ?? '').toLowerCase()
  return PRICING[key] ?? PRICING.default
}
