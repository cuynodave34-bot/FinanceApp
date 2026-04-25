import React, { useEffect, useRef } from 'react';
import {
  Modal as RNModal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Animated,
  TouchableWithoutFeedback,
} from 'react-native';

import { colors, radii, spacing } from '@/shared/theme/colors';

export type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type AppModalProps = {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  onRequestClose?: () => void;
  children?: React.ReactNode;
};

export function AppModal({
  visible,
  title,
  message,
  buttons = [{ text: 'OK', style: 'default' }],
  onRequestClose,
  children,
}: AppModalProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0);
      slideAnim.setValue(20);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onRequestClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onRequestClose}>
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                styles.container,
                { transform: [{ translateY: slideAnim }] },
              ]}
            >
              <Text style={styles.title}>{title}</Text>
              {message ? <Text style={styles.message}>{message}</Text> : null}
              {children}
              <View style={styles.buttonRow}>
                {buttons.map((button, index) => (
                  <Pressable
                    key={index}
                    onPress={() => {
                      button.onPress?.();
                      onRequestClose?.();
                    }}
                    style={[
                      styles.button,
                      button.style === 'destructive' && styles.destructiveButton,
                      button.style === 'cancel' && styles.cancelButton,
                      buttons.length === 1 && styles.fullWidthButton,
                    ]}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        button.style === 'destructive' && styles.destructiveText,
                        button.style === 'cancel' && styles.cancelText,
                      ]}
                    >
                      {button.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  container: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 340,
    gap: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: colors.mutedInk,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: 'center',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  fullWidthButton: {
    flex: 0,
    width: '100%',
  },
  destructiveButton: {
    backgroundColor: colors.dangerLight,
  },
  cancelButton: {
    backgroundColor: colors.surfaceSecondary,
  },
  buttonText: {
    color: colors.surface,
    fontWeight: '700',
    fontSize: 14,
  },
  destructiveText: {
    color: colors.danger,
  },
  cancelText: {
    color: colors.ink,
  },
});

export function useAppModal() {
  const [modal, setModal] = React.useState<{
    visible: boolean;
    title: string;
    message?: string;
    buttons: AlertButton[];
  }>({ visible: false, title: '', buttons: [] });

  const show = (title: string, message?: string, buttons?: AlertButton[]) => {
    setModal({ visible: true, title, message, buttons: buttons ?? [{ text: 'OK', style: 'default' }] });
  };

  const hide = () => setModal((prev) => ({ ...prev, visible: false }));

  const ModalComponent = (
    <AppModal
      visible={modal.visible}
      title={modal.title}
      message={modal.message}
      buttons={modal.buttons}
      onRequestClose={hide}
    />
  );

  return { show, hide, ModalComponent };
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmStyle = 'default',
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  confirmStyle?: 'default' | 'destructive';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AppModal
      visible={visible}
      title={title}
      message={message}
      onRequestClose={onCancel}
      buttons={[
        { text: cancelText, style: 'cancel', onPress: onCancel },
        { text: confirmText, style: confirmStyle, onPress: onConfirm },
      ]}
    />
  );
}

export function InfoModal({
  visible,
  title,
  message,
  onClose,
}: {
  visible: boolean;
  title: string;
  message?: string;
  onClose: () => void;
}) {
  return (
    <AppModal
      visible={visible}
      title={title}
      message={message}
      onRequestClose={onClose}
      buttons={[{ text: 'OK', style: 'default', onPress: onClose }]}
    />
  );
}
