import { User } from '@supabase/supabase-js';

import { getSupabaseClient } from '@/integrations/supabase/client';

export async function ensureRemoteProfile(user: User) {
  try {
    const supabase = getSupabaseClient();
    const displayName =
      typeof user.user_metadata?.display_name === 'string'
        ? user.user_metadata.display_name
        : null;

    const { error } = await supabase.from('profiles').upsert(
      {
        user_id: user.id,
        display_name: displayName,
      },
      {
        onConflict: 'user_id',
      }
    );

    if (error) {
      console.warn('Profile bootstrap skipped:', error.message);
    }
  } catch (error) {
    console.warn('Profile bootstrap skipped:', error);
  }
}
