const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const groqApiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
const allowClientAiKey = process.env.EXPO_PUBLIC_ALLOW_CLIENT_AI_KEY === 'true';

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  groqApiKey,
  allowClientAiKey,
  hasSupabaseConfig: Boolean(supabaseUrl && supabaseAnonKey),
};
