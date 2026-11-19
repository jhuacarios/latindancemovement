import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { ChatConversationDto } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import {
  POLL_CONVERSATIONS_MS,
  chatApi,
  chatKeys,
  conversationTitle,
  formatListTime,
  preview,
} from '@/lib/chat';
import { ChatAvatar } from '@/components/chat-avatar';
import { colors, radius, space, ui } from '@/lib/theme';

type Item =
  | { kind: 'conv'; c: ChatConversationDto }
  | { kind: 'community'; placeId: string; channels: ChatConversationDto[] };

/**
 * Cada comunidad aparece una vez (en la posición de su canal más activo) con sus
 * canales debajo, General primero. Solo vienen los canales en que el usuario está.
 */
function groupInbox(list: ChatConversationDto[]): Item[] {
  const items: Item[] = [];
  const groups = new Map<string, Extract<Item, { kind: 'community' }>>();
  for (const c of list) {
    if (c.kind === 'CHANNEL' && c.channel) {
      const g = groups.get(c.channel.placeId);
      if (g) g.channels.push(c);
      else {
        const ng = { kind: 'community' as const, placeId: c.channel.placeId, channels: [c] };
        groups.set(c.channel.placeId, ng);
        items.push(ng);
      }
    } else items.push({ kind: 'conv', c });
  }
  for (const g of groups.values()) {
    g.channels.sort((a, b) => Number(b.channel!.isGeneral) - Number(a.channel!.isGeneral));
  }
  return items;
}

const open = (id: string) => router.push({ pathname: '/chat/[id]', params: { id } });

function Unread({ n }: { n: number }) {
  if (n <= 0) return null;
  return <Text style={styles.unread}>{n > 99 ? '99+' : n}</Text>;
}

function Row({ c }: { c: ChatConversationDto }) {
  const { title, subtitle } = conversationTitle(c);
  const bold = c.unreadCount > 0;
  return (
    <Pressable onPress={() => open(c.id)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <ChatAvatar c={c} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.line}>
          <Text style={[styles.title, bold && styles.bold]} numberOfLines={1}>
            {title}
            {subtitle ? <Text style={styles.sub}>  {subtitle}</Text> : null}
          </Text>
          {c.lastMessageAt && <Text style={styles.time}>{formatListTime(c.lastMessageAt)}</Text>}
        </View>
        <View style={styles.line}>
          <Text style={[styles.preview, bold && { color: colors.text }]} numberOfLines={1}>
            {preview(c)}
          </Text>
          <Unread n={c.unreadCount} />
        </View>
      </View>
    </Pressable>
  );
}

function Community({ channels }: { channels: ChatConversationDto[] }) {
  const [expanded, setExpanded] = useState(true);
  const info = channels[0].channel!;
  const unread = channels.reduce((n, c) => n + c.unreadCount, 0);
  return (
    <View>
      <Pressable onPress={() => setExpanded((v) => !v)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <ChatAvatar c={channels[0]} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.title, unread > 0 && styles.bold]} numberOfLines={1}>{info.placeName}</Text>
          <Text style={styles.preview}>
            Comunidad · {channels.length} {channels.length === 1 ? 'canal' : 'canales'}
          </Text>
        </View>
        {!expanded && <Unread n={unread} />}
        <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      {expanded &&
        channels.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => open(c.id)}
            style={({ pressed }) => [styles.subRow, pressed && styles.pressed]}
          >
            <Text style={styles.hash}>#</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.line}>
                <Text style={[styles.title, { fontSize: 15 }, c.unreadCount > 0 && styles.bold]} numberOfLines={1}>
                  {c.channel!.name}
                </Text>
                {c.lastMessageAt && <Text style={styles.time}>{formatListTime(c.lastMessageAt)}</Text>}
              </View>
              <View style={styles.line}>
                <Text style={styles.preview} numberOfLines={1}>{preview(c)}</Text>
                <Unread n={c.unreadCount} />
              </View>
            </View>
          </Pressable>
        ))}
    </View>
  );
}

export default function MessagesScreen() {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: chatKeys.conversations,
    queryFn: chatApi.conversations,
    refetchInterval: POLL_CONVERSATIONS_MS,
  });
  const items = groupInbox(data ?? []);

  return (
    <SafeAreaView style={ui.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={ui.h1}>Mensajes</Text>
        <Pressable onPress={() => router.push('/chat/new')} style={styles.newBtn} accessibilityLabel="Nuevo chat">
          <Text style={styles.newText}>＋ Nuevo</Text>
        </Pressable>
      </View>
      <FlatList
        data={items}
        keyExtractor={(it) => (it.kind === 'community' ? `place-${it.placeId}` : it.c.id)}
        renderItem={({ item }) => (item.kind === 'community' ? <Community channels={item.channels} /> : <Row c={item.c} />)}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.clave} />}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        ListEmptyComponent={
          <View style={{ padding: space.xl }}>
            {isLoading ? (
              <ActivityIndicator color={colors.clave} />
            ) : error ? (
              <Text style={ui.error}>{error instanceof ApiError ? error.message : 'No se pudo cargar.'}</Text>
            ) : (
              <Text style={ui.muted}>Aún no tienes conversaciones. Parte una con «＋ Nuevo».</Text>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  newBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 8 },
  newText: { color: colors.white, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: 64, paddingRight: space.lg, paddingVertical: 10 },
  pressed: { backgroundColor: colors.surface },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '500' },
  bold: { fontWeight: '700' },
  sub: { color: colors.textFaint, fontSize: 13, fontWeight: '400' },
  time: { color: colors.textFaint, fontSize: 12 },
  preview: { flex: 1, color: colors.textMuted, fontSize: 14 },
  unread: {
    color: colors.white,
    backgroundColor: colors.brand,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  chevron: { color: colors.textFaint, fontSize: 14, width: 14 },
  hash: { color: colors.bachata, fontSize: 16, fontWeight: '800', width: 18, textAlign: 'center' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 72 },
});
