export type PlanId = 'free' | 'pro_lite' | 'pro_plus'

export interface PlanPricing {
  planId:       PlanId
  label:        string
  amount:       number        // paise for INR, cents for USD (0 for free)
  currency:     'INR' | 'USD'
  symbol:       string
  displayPrice: string        // '₹0' / '₹299' / '$5' etc.
  displayFull:  string        // '₹299/month'
  credits:      number        // 10 / 40 / 120
  isPopular?:   boolean
}

export interface RegionPricing {
  countryCode: string
  currency:    'INR' | 'USD'
  symbol:      string
  plans: {
    free:    PlanPricing
    proLite: PlanPricing
    proPlus: PlanPricing
  }
}

// Legacy interface — kept so old callers (landing page server component) don't break
export interface Pricing {
  amount:       number
  currency:     'INR' | 'USD'
  symbol:       string
  displayFree:  string
  displayPrice: string
  displayFull:  string
  countryCode:  string
}

const INDIA: RegionPricing = {
  countryCode: 'in',
  currency:    'INR',
  symbol:      '₹',
  plans: {
    free:    { planId: 'free',     label: 'Free',     amount: 0,      currency: 'INR', symbol: '₹', displayPrice: '₹0',   displayFull: '₹0/month',   credits: 10 },
    proLite: { planId: 'pro_lite', label: 'Pro Lite', amount: 29_900, currency: 'INR', symbol: '₹', displayPrice: '₹299', displayFull: '₹299/month', credits: 40,  isPopular: true },
    proPlus: { planId: 'pro_plus', label: 'Pro Plus', amount: 59_900, currency: 'INR', symbol: '₹', displayPrice: '₹599', displayFull: '₹599/month', credits: 120 },
  },
}

const DEFAULT: RegionPricing = {
  countryCode: '',
  currency:    'USD',
  symbol:      '$',
  plans: {
    free:    { planId: 'free',     label: 'Free',     amount: 0,    currency: 'USD', symbol: '$', displayPrice: '$0',  displayFull: '$0/month',  credits: 10 },
    proLite: { planId: 'pro_lite', label: 'Pro Lite', amount: 500,  currency: 'USD', symbol: '$', displayPrice: '$5',  displayFull: '$5/month',  credits: 40,  isPopular: true },
    proPlus: { planId: 'pro_plus', label: 'Pro Plus', amount: 1200, currency: 'USD', symbol: '$', displayPrice: '$12', displayFull: '$12/month', credits: 120 },
  },
}

export function getRegionPricing(countryCode?: string | null): RegionPricing {
  return (countryCode ?? '').toLowerCase() === 'in' ? INDIA : DEFAULT
}

export function getPlanPricing(countryCode?: string | null, planId?: PlanId | null): PlanPricing {
  const r = getRegionPricing(countryCode)
  if (planId === 'pro_lite') return r.plans.proLite
  if (planId === 'pro_plus') return r.plans.proPlus
  return r.plans.free
}

// Backward compat — returns Pro Lite pricing as the "single pro" price
export function getPricingByCountry(countryCode?: string | null): Pricing {
  const r = getRegionPricing(countryCode)
  return {
    amount:       r.plans.proLite.amount,
    currency:     r.currency,
    symbol:       r.symbol,
    displayFree:  r.plans.free.displayPrice,
    displayPrice: r.plans.proLite.displayPrice,
    displayFull:  r.plans.proLite.displayFull,
    countryCode:  r.countryCode,
  }
}
