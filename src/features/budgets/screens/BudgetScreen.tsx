import { Text } from 'react-native';

import { Screen } from '@/shared/ui/Screen';

export function BudgetScreen() {
  return (
    <Screen
      title="Budget"
      subtitle="Daily budget, future budgets, carry-over, and overspending adjustments belong here."
    >
      <Text>
        The service layer is scaffolded so budget math can remain deterministic
        and testable.
      </Text>
    </Screen>
  );
}
