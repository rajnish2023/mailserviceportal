

const { URLSearchParams } = require('url');
const https = require('https');
const http  = require('http');
const tokenCache = new Map();

function httpRequest(urlStr, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url     = new URL(urlStr);
    const isHttps = url.protocol === 'https:';
    const lib     = isHttps ? https : http;

    const reqOpts = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method:   options.method || 'GET',
      headers:  options.headers || {},
    };

    const req = lib.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getAccessToken(template) {
  const {
    zohoClientId,
    zohoClientSecret,
    zohoRefreshToken,
    zohoAccountsUrl = 'https://accounts.zoho.com',
  } = template;

   
  if (!zohoClientId || !zohoClientSecret || !zohoRefreshToken) {
    throw new Error(
      `Zoho credentials missing for template "${template.title}". ` +
      'Please set Client ID, Client Secret, and Refresh Token in the template settings.'
    );
  }

  const now      = Date.now();
  const cacheKey = zohoClientId; 

  if (tokenCache.has(cacheKey)) {
    const cached = tokenCache.get(cacheKey);
    if (now < cached.expiresAt - 5 * 60 * 1000) {
      return cached.token;
    }
  }

  console.log(`[Zoho] Refreshing access token for client: ${zohoClientId}`);

  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     zohoClientId,
    client_secret: zohoClientSecret,
    refresh_token: zohoRefreshToken,
  });

  const response = await httpRequest(
    `${zohoAccountsUrl}/oauth/v2/token`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
    params.toString()
  );

  if (response.status !== 200 || !response.body?.access_token) {
    throw new Error(
      `Zoho token refresh failed for client ${zohoClientId}: ` +
      JSON.stringify(response.body)
    );
  }

  const { access_token, expires_in = 3600 } = response.body;

  tokenCache.set(cacheKey, {
    token:     access_token,
    expiresAt: now + expires_in * 1000,
  });

  console.log(`[Zoho] Token refreshed OK for client: ${zohoClientId}`);
  return access_token;
}

function mapFormDataToLead(formData = {}, customMapping = {}) {
  const defaultMap = {
    name:         'Last_Name',
    full_name:    'Last_Name',
    fullname:     'Last_Name',
    first_name:   'First_Name',
    firstname:    'First_Name',
    last_name:    'Last_Name',
    lastname:     'Last_Name',
    email:        'Email',
    phone:        'Phone',
    mobile:       'Phone',
    company:      'Company',
    organization: 'Company',
    website:      'Website',
    message:      'Description',
    description:  'Description',
    subject:      'Lead_Source',
    title:        'Lead_Source',
  };

  const map = { ...defaultMap, ...customMapping };

  const lead = {};

  for (const [formField, value] of Object.entries(formData)) {
    if (!value || typeof value !== 'string') continue;
    const zohoField = map[formField.toLowerCase()] || map[formField];
    if (zohoField) {
      
      if (zohoField === 'Last_Name' && lead.Last_Name) {
        lead.Last_Name = `${lead.Last_Name} ${value}`.trim();
      } else {
        lead[zohoField] = value.trim();
      }
    }
  }

  if (!lead.Last_Name) {
    lead.Last_Name = lead.Email
      ? lead.Email.split('@')[0]
      : 'Form Submission';
  }

  if (!lead.Lead_Source) {
    lead.Lead_Source = 'Web Form';
  }

  return lead;
}

async function findExistingLead(apiDomain, token, leadData) {
  const headers = { Authorization: `Zoho-oauthtoken ${token}` };
 
  if (leadData.Email) {
    const res = await httpRequest(
      `${apiDomain}/crm/v2/Leads/search?criteria=(Email:equals:${encodeURIComponent(leadData.Email)})`,
      { method: 'GET', headers }
    );

    if (res.status === 200 && res.body?.data?.length) {
      return res.body.data[0];
    }
  }
 
  if (leadData.Phone) {
    const res = await httpRequest(
      `${apiDomain}/crm/v2/Leads/search?criteria=(Phone:equals:${encodeURIComponent(leadData.Phone)})`,
      { method: 'GET', headers }
    );

    if (res.status === 200 && res.body?.data?.length) {
      return res.body.data[0];
    }
  }

  return null;
}

 async function createZohoLead(formData, template) {
   const apiDomain = template.zohoApiDomain || 'https://www.zohoapis.com';
   const token = await getAccessToken(template);
 
   const leadData = {
     ...mapFormDataToLead(formData, template.zohoFieldMapping),
     ...(template.zohoExtraFields || {}),
   };
 
   const headers = {
     Authorization: `Zoho-oauthtoken ${token}`,
     'Content-Type': 'application/json',
   };
 
    
   if (template.zohoSkipDuplicates !== false) {
     const existing = await findExistingLead(apiDomain, token, leadData);
 
     if (existing) {
       if (template.zohoUpdateExisting) {
         
         await httpRequest(
           `${apiDomain}/crm/v2/Leads/${existing.id}`,
           { method: 'PUT', headers },
           JSON.stringify({ data: [leadData] })
         );
 
         return {
           success: true,
           updated: true,
           leadId: existing.id,
           message: 'Existing lead updated',
         };
       }
 
       return {
         success: true,
         skipped: true,
         leadId: existing.id,
         message: 'Duplicate lead skipped',
       };
     }
   }
 
  
   const res = await httpRequest(
     `${apiDomain}/crm/v2/Leads`,
     { method: 'POST', headers },
     JSON.stringify({ data: [leadData] })
   );
 
   const record = res.body?.data?.[0];
  
   if (res.status === 202 && record?.code === 'DUPLICATE_DATA') {
     return {
       success: true,
       skipped: true,
       leadId: record.details?.id,
       message: 'Duplicate detected by Zoho',
     };
   }
 
   if (![200, 201, 202].includes(res.status)) {
     throw new Error(`Lead creation failed: ${JSON.stringify(res.body)}`);
   }
 
   return {
     success: true,
     leadId: record?.details?.id,
     message: 'Lead created successfully',
   };
 }

async function validateZohoCredentials(template) {
  try {
    const token = await getAccessToken(template);
    
    const apiDomain = template.zohoApiDomain || 'https://www.zohoapis.com';
    const res = await httpRequest(
      `${apiDomain}/crm/v2/Leads`,
      {
        method:  'GET',
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      }
    );

    if (res.status === 200) {
      return {
        valid:   true,
        orgName: res.body?.data?.[0]?.company_name || 'Connected',
        message: 'Zoho CRM connection successful',
      };
    }

    return {
      valid:   false,
      message: `Zoho returned status ${res.status}: ${JSON.stringify(res.body)}`,
    };
  } catch (err) {
    return { valid: false, message: err.message };
  }
}

module.exports = { getAccessToken, createZohoLead, validateZohoCredentials, mapFormDataToLead };
