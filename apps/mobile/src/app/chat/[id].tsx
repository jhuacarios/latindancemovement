import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Stack, useLocalSearchParams } from 'expo-router';
import { UserAvatar } from '@/components/avatar-editor';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CHAT_REACTIONS, STICKER_DELETED, type ChatMessageDto } from '@baile-latino/types';
import { StickerSheet } from '@/components/sticker-sheet';
import { GifSheet, useGifsEnabled } from '@/components/gif-sheet';
import { stickerUrl } from '@/lib/stickers';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  POLL_THREAD_MS,
  chatApi,
  chatKeys,
  conversationTitle,
  dayKey,
  formatDayLabel,
  formatMsgTime,
  messageImageSource,
} from '@/lib/chat';
import { colors, radius, space, ui } from '@/lib/theme';

type Picked = { uri: string; width: number; height: number };

/** Achica la foto (lado mayor 1600 px, JPEG 80%) antes de enviarla. */
async function prepare(asset: ImagePicker.ImagePickerAsset): Promise<Picked> {
  const big = Math.max(asset.width, asset.height);
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (big > 1600) {
    ctx.resize(asset.width >= asset.height ? { width: 1600 } : { height: 1600 });
  }
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return { uri: out.uri, width: out.width, height: out.height };
}

function Bubble({
  m,
  mine,
  showSender,
  isGroup,
  convId,
  maxWidth,
  onLongPress,
  onToggleReaction,
}: {
  m: ChatMessageDto;
  mine: boolean;
  showSender: boolean;
  isGroup: boolean;
  convId: string;
  maxWidth: number;
  onLongPress: () => void;
  onToggleReaction: (emoji: string) => void;
}) {
  // Sticker y GIF van sin globo.
  const isSticker = Boolean((m.stickerId && m.stickerId !== STICKER_DELETED) || m.gif);
  const imgW = Math.min(maxWidth - 16, 260);
  const imgH = m.imageWidth && m.imageHeight ? Math.round((imgW * m.imageHeight) / m.imageWidth) : imgW;
  return (
    <View>
    <View style={[styles.bubbleRow, mine ? { justifyContent: 'flex-end' } : null]}>
      {/* En grupos, la foto de quien escribe al inicio de cada tanda (si no, el hueco para alinear). */}
      {isGroup && !mine &&
        (showSender ? (
          <UserAvatar user={{ id: m.senderId, avatarAt: m.senderAvatarAt, name: m.senderName, displayName: null }} size={28} />
        ) : (
          <View style={{ width: 28 }} />
        ))}
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={300}
        style={[isSticker ? styles.stickerBox : [styles.bubble, mine ? styles.mine : styles.theirs], { maxWidth }]}
      >
        {showSender && <Text style={styles.sender}>{m.senderName}</Text>}
        {m.gif ? (
          <Image
            source={m.gif.url}
            style={{ width: 220, height: Math.round((220 * m.gif.height) / Math.max(1, m.gif.width)), borderRadius: radius.md }}
            contentFit="cover"
          />
        ) : (
          isSticker && <Image source={stickerUrl(m.stickerId!)} style={{ width: 128, height: 128 }} contentFit="contain" />
        )}
        {m.stickerId === STICKER_DELETED && (
          <Text style={[styles.text, { fontStyle: 'italic', opacity: 0.7 }, mine && { color: colors.white }]}>
            Sticker eliminado
          </Text>
        )}
        {m.hasImage && (
          <Image
            source={messageImageSource(convId, m.id)}
            style={{ width: imgW, height: Math.min(imgH, 360), borderRadius: radius.md, marginBottom: m.body ? 6 : 0 }}
            contentFit="cover"
          />
        )}
        {m.body ? <Text style={[styles.text, mine && { color: colors.white }]}>{m.body}</Text> : null}
        <Text style={[styles.meta, mine && !isSticker && { color: '#ffffffb3' }]}>{formatMsgTime(m.createdAt)}</Text>
      </Pressable>
    </View>
    {m.reactions.length > 0 && (
      <View style={[styles.chips, mine ? { justifyContent: 'flex-end' } : { paddingLeft: isGroup ? 34 : 0 }]}>
        {m.reactions.map((r) => (
          <Pressable
            key={r.emoji}
            onPress={() => onToggleReaction(r.emoji)}
            style={[styles.chip, r.mine && styles.chipMine]}
            accessibilityLabel={`${r.emoji} ${r.count}: ${r.names.join(', ')}`}
          >
            <Text style={styles.chipText}>
              {r.emoji}
              {r.count > 1 ? ` ${r.count}` : ''}
            </Text>
          </Pressable>
        ))}
      </View>
    )}
    </View>
  );
}

/** Fila de emojis para reaccionar (mantener presionado un mensaje). */
function ReactionSheet({
  message,
  onPick,
  onClose,
}: {
  message: ChatMessageDto | null;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const mine = message?.reactions.find((r) => r.mine)?.emoji ?? null;
  const who = message?.reactions.flatMap((r) => r.names.map((n) => `${r.emoji} ${n}`)) ?? [];
  return (
    <Modal visible={Boolean(message)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <View style={styles.sheet}>
          <View style={styles.emojiRow}>
            {CHAT_REACTIONS.map((e) => (
              <Pressable
                key={e}
                onPress={() => onPick(e)}
                style={[styles.emojiBtn, mine === e && styles.emojiOn]}
                accessibilityLabel={`Reaccionar ${e}`}
              >
                <Text style={{ fontSize: 30 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
          {who.length > 0 && (
            <Text style={[ui.small, { textAlign: 'center' }]} numberOfLines={3}>
              {who.join('  ·  ')}
            </Text>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

export default function ChatThreadScreen() {
  const { id, draft } = useLocalSearchParams<{ id: string; draft?: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const conversations = useQuery({ queryKey: chatKeys.conversations, queryFn: chatApi.conversations });
  const conv = conversations.data?.find((c) => c.id === id) ?? null;
  const isGroup = conv ? conv.kind !== 'DIRECT' : false;
  const head = conv ? conversationTitle(conv) : { title: 'Chat', subtitle: '' };

  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Texto sugerido al abrir desde otra pantalla (p. ej. "Enviar mensaje" de una academia).
  const [text, setText] = useState(draft ?? '');
  const [pending, setPending] = useState<Picked | null>(null);
  const [sending, setSending] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const refreshLists = useCallback(() => {
    void qc.invalidateQueries({ queryKey: chatKeys.conversations });
    void qc.invalidateQueries({ queryKey: chatKeys.unread });
  }, [qc]);

  // Carga inicial + marcar leído.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    chatApi
      .messages(id)
      .then((page) => {
        if (!alive) return;
        setMessages(page.messages);
        setCursor(page.nextCursor);
        setLoading(false);
        void chatApi.markRead(id).then(refreshLists);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof ApiError ? e.message : 'No se pudo cargar el chat.');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, refreshLists]);

  // --- Reacciones ---
  const [reacting, setReacting] = useState<ChatMessageDto | null>(null);
  const reactionsSince = useRef<string | null>(null);
  const applyReactions = useCallback((messageId: string, reactions: ChatMessageDto['reactions']) => {
    setMessages((prev) => prev.map((x) => (x.id === messageId ? { ...x, reactions } : x)));
  }, []);
  const react = async (messageId: string, emoji: string) => {
    setReacting(null);
    try {
      applyReactions(messageId, await chatApi.react(id, messageId, emoji));
    } catch (e) {
      Alert.alert('No se pudo', e instanceof ApiError ? e.message : 'Revisa tu conexión.');
    }
  };
  // Polling de reacciones: solo los mensajes cuyas reacciones cambiaron.
  useEffect(() => {
    if (loading) return;
    let alive = true;
    reactionsSince.current = null;
    void chatApi
      .reactionChanges(id)
      .then((r) => {
        if (alive) reactionsSince.current = r.now;
      })
      .catch(() => undefined);
    const t = setInterval(async () => {
      if (!reactionsSince.current) return;
      const r = await chatApi.reactionChanges(id, reactionsSince.current).catch(() => null);
      if (!alive || !r) return;
      reactionsSince.current = r.now;
      for (const c of r.changes) applyReactions(c.messageId, c.reactions);
    }, POLL_THREAD_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, loading, applyReactions]);

  // Polling de mensajes nuevos.
  useEffect(() => {
    if (loading) return;
    const t = setInterval(async () => {
      const last = messagesRef.current[messagesRef.current.length - 1];
      const fresh = last
        ? await chatApi.since(id, last.id).catch(() => [])
        : (await chatApi.messages(id).catch(() => null))?.messages ?? [];
      if (!fresh.length) return;
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...prev, ...fresh.filter((m) => !known.has(m.id))];
      });
      if (fresh.some((m) => m.senderId !== user?.id)) void chatApi.markRead(id).then(refreshLists);
    }, POLL_THREAD_MS);
    return () => clearInterval(t);
  }, [id, loading, user?.id, refreshLists]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await chatApi.messages(id, cursor);
      setMessages((prev) => [...page.messages, ...prev]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const pick = async (from: 'camera' | 'library') => {
    try {
      const perm =
        from === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso necesario', from === 'camera' ? 'Activa el acceso a la cámara.' : 'Activa el acceso a tus fotos.');
        return;
      }
      const res =
        from === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (res.canceled || !res.assets[0]) return;
      setPending(await prepare(res.assets[0]));
    } catch {
      Alert.alert('No se pudo', 'No se pudo preparar la foto.');
    }
  };

  const [stickers, setStickers] = useState(false);
  const [gifsOpen, setGifsOpen] = useState(false);
  const gifsEnabled = useGifsEnabled();
  const sendExtra = async (kind: 'sticker' | 'gif', extraId: string) => {
    setStickers(false);
    setGifsOpen(false);
    try {
      const m = kind === 'gif' ? await chatApi.sendGif(id, extraId) : await chatApi.sendSticker(id, extraId);
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      refreshLists();
    } catch (e) {
      Alert.alert('No se envió', e instanceof ApiError ? e.message : 'Revisa tu conexión.');
    }
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && !pending) || sending) return;
    setSending(true);
    try {
      const m = pending ? await chatApi.sendImage(id, pending, body) : await chatApi.send(id, body);
      setMessages((prev) => [...prev, m]);
      setText('');
      setPending(null);
      refreshLists();
    } catch (e) {
      Alert.alert('No se envió', e instanceof ApiError ? e.message : 'Revisa tu conexión.');
    } finally {
      setSending(false);
    }
  };

  // Lista invertida: el más nuevo primero (queda abajo).
  const data = useMemo(() => [...messages].reverse(), [messages]);
  const bubbleMax = Math.round(width * 0.78);
  const placeholder = !conv
    ? 'Escribe un mensaje…'
    : conv.kind === 'CHANNEL'
      ? `Escribe en ${head.title}…`
      : conv.kind === 'CLASS'
        ? 'Escribe a la clase…'
        : `Escríbele a ${head.title}…`;

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={{ alignItems: Platform.OS === 'ios' ? 'center' : 'flex-start' }}>
              <Text style={styles.headTitle} numberOfLines={1}>{head.title}</Text>
              {head.subtitle ? <Text style={styles.headSub} numberOfLines={1}>{head.subtitle}</Text> : null}
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={ui.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
      >
        {loading ? (
          <ActivityIndicator color={colors.clave} style={{ marginTop: space.xl }} />
        ) : error ? (
          <Text style={[ui.error, { padding: space.lg }]}>{error}</Text>
        ) : (
          <FlatList
            data={data}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: space.md, gap: 4 }}
            onEndReached={() => void loadMore()}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.clave} /> : undefined}
            ListEmptyComponent={
              <Text style={[ui.muted, { textAlign: 'center', transform: [{ scaleY: -1 }] }]}>
                Todavía no hay mensajes. ¡Rompe el hielo!
              </Text>
            }
            renderItem={({ item: m, index }) => {
              const older = data[index + 1];
              const mine = m.senderId === user?.id;
              const newDay = !older || dayKey(older.createdAt) !== dayKey(m.createdAt);
              const showSender = isGroup && !mine && (newDay || older?.senderId !== m.senderId);
              return (
                <View>
                  {newDay && <Text style={styles.day}>{formatDayLabel(m.createdAt)}</Text>}
                  <Bubble
                    m={m}
                    mine={mine}
                    showSender={showSender}
                    isGroup={isGroup}
                    convId={id}
                    maxWidth={bubbleMax - (isGroup && !mine ? 34 : 0)}
                    onLongPress={() => setReacting(m)}
                    onToggleReaction={(e) => void react(m.id, e)}
                  />
                </View>
              );
            }}
          />
        )}

        {pending && (
          <View style={styles.pendingBar}>
            <Image source={pending.uri} style={styles.pendingImg} contentFit="cover" />
            <Text style={[ui.small, { flex: 1 }]}>Foto lista para enviar</Text>
            <Pressable onPress={() => setPending(null)} hitSlop={10}>
              <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>
        )}

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
          <Pressable
            onPress={() =>
              Alert.alert('Enviar foto', undefined, [
                { text: 'Tomar foto', onPress: () => void pick('camera') },
                { text: 'Elegir de la galería', onPress: () => void pick('library') },
                { text: 'Cancelar', style: 'cancel' },
              ])
            }
            style={styles.iconBtn}
            accessibilityLabel="Adjuntar foto"
          >
            <Text style={{ fontSize: 20 }}>📷</Text>
          </Pressable>
          <Pressable onPress={() => setStickers(true)} style={styles.iconBtn} accessibilityLabel="Stickers">
            <Text style={{ fontSize: 20 }}>🩰</Text>
          </Pressable>
          {gifsEnabled && (
            <Pressable onPress={() => setGifsOpen(true)} style={styles.iconBtn} accessibilityLabel="GIFs">
              <Text style={styles.gifLabel}>GIF</Text>
            </Pressable>
          )}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={pending ? 'Agrega un texto (opcional)…' : placeholder}
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={2000}
            style={styles.input}
          />
          <Pressable
            onPress={() => void send()}
            disabled={sending || (!text.trim() && !pending)}
            style={[styles.sendBtn, (sending || (!text.trim() && !pending)) && { opacity: 0.4 }]}
            accessibilityLabel="Enviar"
          >
            {sending ? <ActivityIndicator color={colors.white} /> : <Text style={styles.sendText}>➤</Text>}
          </Pressable>
        </View>
        <StickerSheet visible={stickers} onPick={(sid) => void sendExtra('sticker', sid)} onClose={() => setStickers(false)} />
        <GifSheet visible={gifsOpen} onPick={(gid) => void sendExtra('gif', gid)} onClose={() => setGifsOpen(false)} />
        <ReactionSheet
          message={reacting}
          onPick={(e) => reacting && void react(reacting.id, e)}
          onClose={() => setReacting(null)}
        />
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  stickerBox: { paddingHorizontal: 2, alignItems: 'flex-start' },
  gifLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '800', borderWidth: 1, borderColor: colors.line, borderRadius: 6, paddingHorizontal: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -6, paddingHorizontal: 6 },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  chipMine: { borderColor: colors.brand, backgroundColor: '#1a7a4e55' },
  chipText: { color: colors.text, fontSize: 13 },
  sheetBackdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: space.xl },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around' },
  emojiBtn: { padding: 6, borderRadius: radius.pill },
  emojiOn: { backgroundColor: '#1a7a4e88' },
  headTitle: { color: colors.text, fontSize: 16, fontWeight: '700', maxWidth: 240 },
  headSub: { color: colors.textFaint, fontSize: 12, maxWidth: 240 },
  day: {
    alignSelf: 'center',
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginVertical: space.sm,
  },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  bubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  mine: { backgroundColor: colors.brand, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 6 },
  sender: { color: colors.bachata, fontSize: 12, fontWeight: '700', marginBottom: 2 },
  text: { color: colors.text, fontSize: 15, lineHeight: 20 },
  meta: { color: colors.textFaint, fontSize: 10, alignSelf: 'flex-end', marginTop: 2 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.selva,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    color: colors.text,
    fontSize: 15,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: colors.white, fontSize: 18 },
  pendingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  pendingImg: { width: 48, height: 48, borderRadius: radius.sm },
});
