import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { colors, spacing, radii } from '@/shared/theme/colors';
import { toDateKey, toTimeKey, dateKeyToDate, timeKeyToDate } from '@/shared/utils/time';

interface DatePickerFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  style?: any;
}

export function DatePickerField({ value, onChange, placeholder, style }: DatePickerFieldProps) {
  const [show, setShow] = useState(false);

  const displayValue = value || placeholder || 'Select date';
  const pickerValue = value && value.length === 10 ? dateKeyToDate(value) : new Date();

  return (
    <View style={style}>
      <Pressable onPress={() => setShow(true)} style={styles.field}>
        <Text style={[styles.fieldText, !value && styles.placeholderText]}>{displayValue}</Text>
      </Pressable>
      {show && (
        <>
          <DateTimePicker
            value={pickerValue}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, selectedDate) => {
              if (event.type === 'dismissed' || !selectedDate) {
                setShow(false);
                return;
              }
              onChange(toDateKey(selectedDate));
              setShow(false);
            }}
          />
          {Platform.OS === 'ios' && (
            <Pressable onPress={() => setShow(false)} style={styles.doneButton}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

export function TimePickerField({ value, onChange, placeholder, style }: DatePickerFieldProps) {
  const [show, setShow] = useState(false);

  const displayValue = value || placeholder || 'Select time';
  const pickerValue =
    value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? timeKeyToDate(value) : new Date();

  return (
    <View style={style}>
      <Pressable onPress={() => setShow(true)} style={styles.field}>
        <Text style={[styles.fieldText, !value && styles.placeholderText]}>{displayValue}</Text>
      </Pressable>
      {show && (
        <>
          <DateTimePicker
            value={pickerValue}
            mode="time"
            is24Hour={true}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, selectedDate) => {
              if (event.type === 'dismissed' || !selectedDate) {
                setShow(false);
                return;
              }
              onChange(toTimeKey(selectedDate));
              setShow(false);
            }}
          />
          {Platform.OS === 'ios' && (
            <Pressable onPress={() => setShow(false)} style={styles.doneButton}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.surfaceSecondary,
    justifyContent: 'center',
  },
  fieldText: {
    color: colors.ink,
    fontSize: 14,
  },
  placeholderText: {
    color: colors.mutedInk,
  },
  doneButton: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  doneText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
});
