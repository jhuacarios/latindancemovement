import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { placeLabel, type ChatUser } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import { chatApi, chatKeys } from '@/lib/chat';
import { colors, space, ui } from '@/lib/theme';

/** Buscar a alguien y abrir (o retomar) el chat 1 a 1. */
export default function NewChatScreen() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery({ queryKey: chatKeys.users(term), queryFn: () => chatApi.users(term) });

  const start = async (u: ChatUser) => {
    setOpening(u.id);
    setError(null);
    try {
      const c = await chatApi.start(u.id);
      await qc.invalidateQueries({ queryKey: chatKeys.conversations });
      router.replace({ pathname: '/chat/[id]', params: { id: c.id } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo abrir el chat.');
      setOpening(null);
    }
  };

  return (
    <View style={ui.screen}>
      <View style={{ padding: space.lg, gap: space.sm }}>
        <TextInput
          autoFocus
          value={q}
          onChangeText={setQ}
          placeholder="Busca por nombre o Instagram"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          style={ui.input}
        />
        {error && <Text style={ui.error}>{error}</Text>}
      </View>
      {isLoading ? (
        <ActivityIndicator color={colors.clave} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(u) => u.id}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={<Text style={[ui.muted, { padding: space.lg }]}>No encontramos a nadie con ese nombre.</Text>}
          renderItem={({ item: u }) => (
            <Pressable
              onPress={() => void start(u)}
              disabled={Boolean(opening)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
            >
              <View style={styles.avatar}>
                <Text style={styles.initial}>{u.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ui.body}>{u.name}</Text>
                <Text style={ui.small}>
                  {[u.instagramHandle ? `@${u.instagramHandle}` : null, placeLabel(u.city, u.commune)]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {opening === u.id && <ActivityIndicator color={colors.clave} />}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a7a4e55', alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.clave, fontSize: 16, fontWeight: '700' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 68 },
});
