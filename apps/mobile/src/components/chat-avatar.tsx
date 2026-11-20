import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { ChatConversationDto } from '@baile-latino/types';
import { API_BASE } from '@/lib/api';
import { UserAvatar } from '@/components/avatar-editor';
import { colors, radius } from '@/lib/theme';

/**
 * Avatar de una conversación: foto del social (canal, con #), logo de la academia
 * (clase, con 🎓) o la foto de la persona (chat privado; su inicial si no tiene).
 */
export function ChatAvatar({ c, size = 44 }: { c: ChatConversationDto; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };

  let uri: string | null = null;
  let badge: string | null = null;
  if (c.kind === 'CHANNEL' && c.channel) {
    badge = '#';
    if (c.channel.placeHasPhoto) {
      uri = `${API_BASE}/community/places/${c.channel.placeId}/photo?v=${encodeURIComponent(c.channel.placeUpdatedAt)}`;
    }
  } else if (c.kind === 'CLASS' && c.classGroup) {
    badge = '🎓';
    uri = `${API_BASE}/academies/${c.classGroup.academyId}/logo`;
  }

  if (!badge) {
    if (c.other) return <UserAvatar user={{ ...c.other, displayName: null }} size={size} />;
    const name = '?';
    return (
      <View style={[styles.round, box, { borderRadius: size / 2 }]}>
        <Text style={styles.initial}>{name.charAt(0).toUpperCase()}</Text>
      </View>
    );
  }
  return (
    <View style={box}>
      {uri && !failed ? (
        <Image source={uri} style={[box, { borderRadius: radius.md }]} contentFit="cover" onError={() => setFailed(true)} />
      ) : (
        <View style={[styles.square, box]}>
          <Text style={{ fontSize: size * 0.4 }}>{badge === '#' ? '#' : '🎓'}</Text>
        </View>
      )}
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{badge}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  round: { backgroundColor: '#1a7a4e55', alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.clave, fontSize: 18, fontWeight: '700' },
  square: { borderRadius: radius.md, backgroundColor: '#f59e0b26', alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 18,
    height: 18,
    borderRadius: 6,
    backgroundColor: colors.bachata,
    borderWidth: 2,
    borderColor: colors.selva,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#111' },
});
