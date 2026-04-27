import { getDatabase } from '@/db/sqlite/client';
import { createId } from '@/shared/utils/id';
import { nowIso } from '@/shared/utils/time';

export type AiChatMemoryMessage = {
  id: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

type AiChatMemoryRow = {
  id: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

function mapMemoryMessage(row: AiChatMemoryRow): AiChatMemoryMessage {
  return row;
}

export async function listAiChatMemory(userId: string, limit = 20) {
  const database = getDatabase();
  const rows = await database.getAllAsync<AiChatMemoryRow>(
    `select
      id,
      user_id as userId,
      role,
      content,
      created_at as createdAt
    from ai_chat_memory
    where user_id = ?
    order by created_at desc
    limit ?`,
    [userId, limit]
  );

  return rows.reverse().map(mapMemoryMessage);
}

export async function appendAiChatMemory(
  userId: string,
  role: AiChatMemoryMessage['role'],
  content: string
) {
  const trimmed = content.trim();

  if (!trimmed) {
    return null;
  }

  const database = getDatabase();
  const message: AiChatMemoryMessage = {
    id: createId(),
    userId,
    role,
    content: trimmed,
    createdAt: nowIso(),
  };

  await database.runAsync(
    `insert into ai_chat_memory (
      id,
      user_id,
      role,
      content,
      created_at
    ) values (?, ?, ?, ?, ?)`,
    [message.id, message.userId, message.role, message.content, message.createdAt]
  );

  return message;
}

export async function pruneAiChatMemory(userId: string, keepLatest = 30) {
  const database = getDatabase();

  await database.runAsync(
    `delete from ai_chat_memory
    where user_id = ?
      and id not in (
        select id
        from ai_chat_memory
        where user_id = ?
        order by created_at desc
        limit ?
      )`,
    [userId, userId, keepLatest]
  );
}
