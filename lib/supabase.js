const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate env vars — surface clear error if missing
if (!url || !key || key.includes('...')) {
    console.error('MISSING ENV VARS! SUPABASE_URL=' + (url ? 'set' : 'MISSING') +
        ', SUPABASE_SERVICE_ROLE_KEY=' + (key ? (key.includes('...') ? 'TRUNCATED' : 'set') : 'MISSING'));
}

const supabase = createClient(url || '', key || '');
module.exports = supabase;
