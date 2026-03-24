
const submissionStore = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of submissionStore.entries()) {
    if (now > record.expiresAt) {
      submissionStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

function checkRateLimit(ip, templateId, windowMs = 5 * 60 * 1000, maxHits = 1) {
  const key = `${ip}::${templateId}`;
  const now  = Date.now();

  if (submissionStore.has(key)) {
    const record = submissionStore.get(key);

    if (now < record.expiresAt) {
      
      if (record.hits >= maxHits) {
        const retryAfterSeconds = Math.ceil((record.expiresAt - now) / 1000);
        const minutes = Math.floor(retryAfterSeconds / 60);
        const seconds = retryAfterSeconds % 60;
        const timeStr = minutes > 0
          ? `${minutes} minute${minutes > 1 ? 's' : ''}${seconds > 0 ? ` ${seconds}s` : ''}`
          : `${seconds} second${seconds > 1 ? 's' : ''}`;

        return {
          allowed: false,
          retryAfterSeconds,
          message: `You already submitted this form. Please wait ${timeStr} before submitting again.`,
        };
      }
      
      record.hits += 1;
      submissionStore.set(key, record);
      return { allowed: true };
    }
  }

  
  submissionStore.set(key, {
    hits:      1,
    expiresAt: now + windowMs,
  });
  return { allowed: true };
}

 
const SPAM_KEYWORDS = [
  'viagra', 'cialis', 'pharmacy', 'pills', 'weight loss', 'diet pills',
  'make money fast', 'earn $', 'earn money online', 'work from home',
  'investment opportunity', 'double your money', 'wire transfer',
  'western union', 'moneygram', 'bitcoin transfer', 'crypto investment',
  'send me your', 'bank account', 'urgent transfer',
  'casino', 'poker', 'betting', 'lottery', 'you have won', 'you are selected',
  'claim your prize', 'free gift', 'free iphone',
  'seo services', 'buy backlinks', 'increase traffic', 'rank on google',
  'buy followers', 'instagram followers', 'youtube views',
  'click here now', 'limited time offer', 'act now', 'risk free',
  'no credit card', '100% free', 'guaranteed', 'prince of nigeria',
  'inheritance', 'unclaimed funds', 'secret shopper',
];


const URL_REGEX = /https?:\/\/[^\s]+/gi;

function checkSpam(data, options = {}) {
  const {
    fieldsToCheck = null,   
    maxUrls       = 1,
    minLength     = 5,
    maxLength     = 5000,
  } = options;

  const valuesToCheck = [];
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'string') continue;
    if (key === 'email') continue;
    if (fieldsToCheck && !fieldsToCheck.includes(key)) continue;
    valuesToCheck.push({ field: key, value: value.trim() });
  }

  for (const { field, value } of valuesToCheck) {
    if (value.length < minLength) {
      return {
        isSpam: true,
        reason: `The "${field}" field is too short. Please provide more details.`,
      };
    }

    if (value.length > maxLength) {
      return {
        isSpam: true,
        reason: `The "${field}" field exceeds the maximum allowed length.`,
      };
    }
    if (/<script|<iframe|javascript:|on\w+=/i.test(value)) {
      return {
        isSpam:  true,
        reason:  'Your message contains invalid content and cannot be submitted.',
        silent:  true,
      };
    }
 
    const urls = value.match(URL_REGEX) || [];
    if (urls.length > maxUrls) {
      return {
        isSpam: true,
        reason: `Your message contains too many links (${urls.length}). Maximum allowed: ${maxUrls}.`,
      };
    }
 
    if (value.length > 20) {
      const letters = value.replace(/[^a-zA-Z]/g, '');
      if (letters.length > 0) {
        const upperRatio = (value.replace(/[^A-Z]/g, '').length / letters.length);
        if (upperRatio > 0.7) {
          return {
            isSpam: true,
            reason: 'Please avoid writing in ALL CAPS.',
          };
        }
      }
    }
 
    if (/(.)\1{6,}/.test(value)) {
      return {
        isSpam: true,
        reason: 'Your message contains repeated characters and looks like spam.',
      };
    }
 
    const lower = value.toLowerCase();
    for (const keyword of SPAM_KEYWORDS) {
      if (lower.includes(keyword)) {
        return {
          isSpam:  true,
          reason:  'Your message was flagged as spam and could not be submitted.',
          silent:  true, 
          keyword,       
        };
      }
    }
  }

  return { isSpam: false };
}


module.exports = { checkRateLimit, checkSpam };
