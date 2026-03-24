
const PROVIDER_DOMAINS = {
  gmail:   ['gmail.com'],
  outlook: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'outlook.in'],
  yahoo:   ['yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'yahoo.com.au', 'ymail.com'],
  icloud:  ['icloud.com', 'me.com', 'mac.com'],
};

function detectProvider(email) {
  if (!email || typeof email !== 'string') return null;

  const domain = email.trim().toLowerCase().split('@')[1];
  if (!domain) return null;

  for (const [provider, domains] of Object.entries(PROVIDER_DOMAINS)) {
    if (domains.includes(domain)) return provider;
  }

  return 'custom';
}

function checkProviderAllowed(email, allowedProviders = []) {

  if (!allowedProviders || allowedProviders.length === 0) {
    return { allowed: true };
  }

  const provider = detectProvider(email);

  if (!provider) {
    return {
      allowed: false,
      reason:  'Invalid email address format',
    };
  }

  if (allowedProviders.includes(provider)) {
    return { allowed: true, provider };
  }

  const providerLabels = {
    gmail:   'Gmail (@gmail.com)',
    outlook: 'Outlook/Hotmail (@outlook.com, @hotmail.com)',
    yahoo:   'Yahoo (@yahoo.com)',
    icloud:  'iCloud (@icloud.com)',
    custom:  'Custom/Business email',
  };

  const allowedList = allowedProviders
    .map(p => providerLabels[p] || p)
    .join(', ');

  return {
    allowed:  false,
    provider,
    reason:   `This form only accepts submissions from: ${allowedList}. Your email provider (${provider}) is not allowed.`,
  };
}

module.exports = { detectProvider, checkProviderAllowed };
