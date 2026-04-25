import { useFocusEffect, useRouter, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/features/auth/provider/AuthProvider';
import { colors, spacing, radii } from '@/shared/theme/colors';
import { generateChatResponse, ChatMessage } from '@/services/ai/generateChatResponse';

const SUGGESTED_QUESTIONS = [
  'How much can I spend today?',
  'What is my total balance?',
  'How are my savings goals?',
  'Spending analysis this week',
  'Am I overspending?',
  'Budget discipline tips',
];

function useTypingAnimation(
  fullText: string,
  speed = 16,
  isActive: boolean,
  onComplete?: () => void
) {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    if (!isActive) {
      setDisplayed(fullText);
      return;
    }
    indexRef.current = 0;
    setDisplayed('');

    const interval = setInterval(() => {
      indexRef.current += 1;
      if (indexRef.current >= fullText.length) {
        setDisplayed(fullText);
        clearInterval(interval);
        onComplete?.();
      } else {
        setDisplayed(fullText.slice(0, indexRef.current));
      }
    }, speed);

    return () => clearInterval(interval);
  }, [fullText, speed, isActive, onComplete]);

  return displayed;
}

function TypingMessage({ content, onComplete }: { content: string; onComplete?: () => void }) {
  const displayed = useTypingAnimation(content, 16, true, onComplete);
  return (
    <>
      <Text style={styles.assistantText}>{displayed}</Text>
      <Text style={styles.cursor}>|</Text>
    </>
  );
}

export function AIChatScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const scrollRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "Hi! I'm Penny, your financial assistant. Ask me anything about your money or pick a question below.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingIndex, setTypingIndex] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      setError(null);
      navigation.setOptions({ tabBarStyle: { display: 'none' } });
      return () => {
        navigation.setOptions({ tabBarStyle: undefined });
      };
    }, [navigation])
  );

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    if (!user) {
      setError('You must be signed in to chat with Penny.');
      return;
    }

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const response = await generateChatResponse(
        user.id,
        messages.filter((m) => m.role !== 'assistant' || m.content !== messages[0].content),
        trimmed
      );
      const assistantIndex = messages.length + 1;
      setMessages((prev) => [...prev, { role: 'assistant', content: response }]);
      setTypingIndex(assistantIndex);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get a response.';
      setError(message);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle}>Penny AI</Text>
          <View style={styles.statusDot} />
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.messagesArea}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {/* Messages */}
        {messages.map((msg, index) => {
          const isTyping = msg.role === 'assistant' && typingIndex === index;

          return (
            <View
              key={index}
              style={[
                styles.bubble,
                msg.role === 'user' ? styles.userBubble : styles.assistantBubble,
              ]}
            >
              {isTyping ? (
                <TypingMessage
                  content={msg.content}
                  onComplete={() => setTypingIndex(null)}
                />
              ) : (
                <Text style={msg.role === 'user' ? styles.userText : styles.assistantText}>
                  {msg.content}
                </Text>
              )}
            </View>
          );
        })}

        {loading && (
          <View style={[styles.bubble, styles.assistantBubble, styles.loadingBubble]}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={[styles.assistantText, { marginLeft: 8 }]}>Penny is thinking...</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorBubble}>
            <Ionicons name="warning-outline" size={16} color="#c62828" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>

      {/* Suggested questions + Input */}
      <View style={styles.footer}>
        {messages.length <= 1 && !loading && (
          <View style={styles.suggestionsRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.suggestionsContent}
            >
              {SUGGESTED_QUESTIONS.map((q) => (
                <Pressable key={q} onPress={() => handleSend(q)} style={styles.suggestionChip}>
                  <Text style={styles.suggestionText}>{q}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Ask Penny anything..."
            placeholderTextColor={colors.mutedInk}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            editable={!loading}
          />
          <Pressable
            onPress={() => handleSend(input)}
            disabled={!input.trim() || loading}
            style={[styles.sendButton, (!input.trim() || loading) && styles.sendButtonDisabled]}
          >
            <Ionicons name="arrow-up" size={18} color={colors.surface} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  messagesArea: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    gap: 4,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.surface,
    fontWeight: '500',
  },
  assistantText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
    fontWeight: '500',
  },
  cursor: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '700',
    lineHeight: 20,
  },
  errorBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#fff0f0',
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#ffcdd2',
    alignSelf: 'flex-start',
  },
  errorText: {
    fontSize: 13,
    color: '#c62828',
    fontWeight: '600',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.canvas,
  },
  suggestionsRow: {
    paddingVertical: spacing.sm,
  },
  suggestionsContent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  suggestionChip: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
  },
  suggestionText: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '600',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    maxHeight: 120,
    fontSize: 15,
    color: colors.ink,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.mutedInk,
    opacity: 0.5,
  },
});
