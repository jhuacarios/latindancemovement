'use client';

import { useParams } from 'next/navigation';
import { ChatView } from '@/components/chat-view';

export default function ChatConversationPage() {
  const { id } = useParams<{ id: string }>();
  return <ChatView activeId={id} />;
}
