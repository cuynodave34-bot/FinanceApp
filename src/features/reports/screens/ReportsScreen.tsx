import { Text } from 'react-native';

import { Screen } from '@/shared/ui/Screen';

export function ReportsScreen() {
  return (
    <Screen
      title="Reports"
      subtitle="Weekly, monthly, category, wallet, and biggest-expense reporting will build on local SQLite queries."
    >
      <Text>
        AI insights are intentionally deferred until the local reporting layer is
        stable and trustworthy.
      </Text>
    </Screen>
  );
}
