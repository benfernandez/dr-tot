import { config } from '../config';
import { supabase } from '../db/supabase';

async function main() {
  console.log('SUPABASE_URL:', JSON.stringify(config.supabaseUrl));
  console.log('Key prefix:', config.supabaseServiceKey.slice(0, 12) + '…');
  console.log('Key length:', config.supabaseServiceKey.length);
  console.log('Key starts with sb_secret_?', config.supabaseServiceKey.startsWith('sb_secret_'));
  console.log('Key starts with eyJ?', config.supabaseServiceKey.startsWith('eyJ'));
  console.log('');

  console.log('Pinging users table…');
  const { data, error } = await supabase.from('users').select('id').limit(1);
  if (error) {
    console.error('ERROR:', error);
  } else {
    console.log('OK. Rows:', data);
  }
}

main();
