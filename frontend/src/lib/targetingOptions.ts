/** Suggestions for Settings → Who to find (free text is always allowed). */

export { TARGET_COUNTRY_OPTIONS as COUNTRY_SUGGESTIONS } from './mockData';

export const CITY_SUGGESTIONS = [
  'Salem', 'Omalur', 'Mettur', 'Attur', 'Sankari', 'Edappadi', 'Gangavalli',
  'Namakkal', 'Tiruchengode', 'Rasipuram', 'Erode', 'Bhavani', 'Coimbatore',
  'Chennai', 'Bengaluru', 'Madurai', 'Trichy', 'Hosur', 'Vellore', 'Puducherry',
  'Mumbai', 'Delhi', 'Hyderabad', 'Pune', 'Kolkata', 'Ahmedabad', 'Kochi',
];

export const BUYER_INDUSTRY_SUGGESTIONS = [
  'dental clinic', 'medical clinic', 'boutique hotel', 'fitness studio', 'gym',
  'restaurant', 'cafe', 'bakery', 'catering service', 'boutique law firm',
  'accounting firm', 'insurance agency', 'real estate agency', 'construction company',
  'architecture studio', 'interior design studio', 'driving school', 'coaching center',
  'beauty salon', 'spa', 'photography studio', 'event management company',
  'travel agency', 'car dealership', 'auto repair shop', 'furniture store',
  'jewellery store', 'pharmacy', 'logistics company', 'import export company',
  'SaaS startup', 'B2B SaaS company', 'fintech startup', 'healthtech startup', 'edtech startup',
];

export const AGENCY_INDUSTRY_SUGGESTIONS = [
  'boutique digital agency', 'digital product studio', 'custom software development agency',
  'web design agency', 'web development studio', 'app development agency',
  'SaaS development agency', 'MVP development studio', 'UX design studio',
];

/** Providers our backend can route to (Anthropic needs the official SDK — not offered). */
export const AI_PROVIDERS = ['Gemini', 'OpenAI', 'Zhipu (GLM)', 'DeepSeek', 'Groq', 'Mistral', 'Ollama'];
