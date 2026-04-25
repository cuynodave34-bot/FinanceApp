import 'react-native-url-polyfill/auto';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    runAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
    execAsync: jest.fn(),
  })),
}));

jest.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({ eq: jest.fn(() => ({ gt: jest.fn(() => ({ data: [], error: null })) })) })),
      upsert: jest.fn(() => ({ error: null })),
      update: jest.fn(() => ({ eq: jest.fn(() => ({ error: null })) })),
    })),
  })),
}));
