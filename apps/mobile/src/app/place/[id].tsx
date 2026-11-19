import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import MapView, { Marker } from 'react-native-maps';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  pctFromStyles,
  placeLabel,
  regionName,
  type CommunityDto,
  type CommunityPlaceDto,
} from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import { chatKeys } from '@/lib/chat';
import { galleryPhotoUrl, mapsLink, placePhotoUrl, placesApi } from '@/lib/places';
import { formatDuration } from '@/lib/academies';
import { Button } from '@/components/button';
import { MediaViewer } from '@/components/media-viewer';
import { StyleMixBar } from '@/components/style-mix-bar';
import { colors, radius, space, ui } from '@/lib/theme';

function Grid3<T extends { id: string }>({
  items,
  onOpen,
  render,
}: {
  items: T[];
  onOpen: (i: number) => void;
  render: (item: T) => React.ReactNode;
}) {
  const [w, setW] = useState(0);
  const cell = w > 0 ? Math.floor((w - 4) / 3) : 0;
  return (
    <View style={styles.grid} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {cell > 0 &&
        items.map((it, i) => (
          <Pressable key={it.id} onPress={() => onOpen(i)} style={{ width: cell, height: cell }}>
            {render(it)}
          </Pressable>
        ))}
    </View>
  );
}

/** Portada: la galería 3×3 si tiene; si no, la foto principal. */
function Cover({ p }: { p: CommunityPlaceDto }) {
  const [open, setOpen] = useState<number | null>(null);
  const img = placePhotoUrl(p);
  if (p.galleryIds.length === 0) {
    return img ? <Image source={img} style={styles.cover} contentFit="cover" /> : null;
  }
  const items = p.galleryIds.map((id) => ({ id, kind: 'PHOTO' as const, title: p.name }));
  return (
    <>
      <Grid3
        items={items}
        onOpen={setOpen}
        render={(it) => <Image source={galleryPhotoUrl(p.id, it.id)} style={styles.thumb} contentFit="cover" />}
      />
      <MediaViewer
        items={items}
        urlFor={async (pid) => ({ url: galleryPhotoUrl(p.id, pid) })}
        index={open}
        onIndex={setOpen}
        onClose={() => setOpen(null)}
      />
    </>
  );
}

function Info({ p }: { p: CommunityPlaceDto }) {
  const pct = p.bachataPct ?? (p.styles.length ? pctFromStyles(p.styles) : null);
  const row = (label: string, value: React.ReactNode) => (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={{ flex: 1 }}>{typeof value === 'string' ? <Text style={ui.body}>{value}</Text> : value}</View>
    </View>
  );
  return (
    <View style={ui.card}>
      {(p.place || p.address) && row('Dónde', [p.place, p.address].filter(Boolean).join('\n'))}
      {p.schedule && row('Cuándo', p.schedule)}
      {pct !== null && row('Mezcla', <StyleMixBar pct={pct} />)}
      {p.instagramHandles.length > 0 &&
        row(
          'Instagram',
          <View style={{ gap: 4 }}>
            {p.instagramHandles.map((h) => (
              <Text key={h} style={styles.link} onPress={() => void Linking.openURL(`https://instagram.com/${h}`)}>
                @{h}
              </Text>
            ))}
          </View>,
        )}
      {p.description ? <Text style={[ui.body, { marginTop: space.xs }]}>{p.description}</Text> : null}
    </View>
  );
}

function MapCard({ p }: { p: CommunityPlaceDto }) {
  const has = p.lat != null && p.lng != null;
  return (
    <View style={ui.card}>
      <Text style={ui.h2}>Punto de encuentro</Text>
      {has && (
        <MapView
          style={styles.map}
          initialRegion={{ latitude: p.lat!, longitude: p.lng!, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
          scrollEnabled={false}
          zoomEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
        >
          <Marker coordinate={{ latitude: p.lat!, longitude: p.lng! }} title={p.name} pinColor={colors.brand} />
        </MapView>
      )}
      <Button title="📍 Cómo llegar" variant="ghost" onPress={() => void Linking.openURL(mapsLink(p))} />
    </View>
  );
}

function Community({ placeId }: { placeId: string }) {
  const qc = useQueryClient();
  const key = ['place-community', placeId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => placesApi.community(placeId) });
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<CommunityDto>) => {
    setBusy(true);
    try {
      qc.setQueryData(key, await fn());
      void qc.invalidateQueries({ queryKey: chatKeys.conversations });
      void qc.invalidateQueries({ queryKey: ['place-media', placeId] });
    } catch (e) {
      Alert.alert('No se pudo', e instanceof ApiError ? e.message : 'Revisa tu conexión.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !data) return <View style={ui.card}><ActivityIndicator color={colors.clave} /></View>;
  const members = `${data.memberCount} ${data.memberCount === 1 ? 'miembro' : 'miembros'}`;

  if (!data.isMember) {
    return (
      <View style={ui.card}>
        <Text style={ui.h2}>💬 Comunidad</Text>
        <Text style={ui.muted}>{members}. Únete para conversar en el General, entrar a los canales y ver las fotos y videos.</Text>
        <Button title="Unirme a la comunidad" onPress={() => void run(() => placesApi.join(placeId))} loading={busy} />
      </View>
    );
  }
  return (
    <View style={ui.card}>
      <Text style={ui.h2}>💬 Comunidad</Text>
      <Text style={ui.small}>{members}</Text>
      {data.channels.map((c) => (
        <View key={c.id} style={styles.channel}>
          <Text style={styles.hash}>#</Text>
          <View style={{ flex: 1 }}>
            <Text style={ui.body}>{c.name}</Text>
            <Text style={ui.small} numberOfLines={1}>
              {c.description ? `${c.description} · ` : ''}
              {c.memberCount} {c.memberCount === 1 ? 'miembro' : 'miembros'}
            </Text>
          </View>
          {c.unreadCount > 0 && <Text style={styles.unread}>{c.unreadCount}</Text>}
          {c.joined ? (
            <Pressable
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
              onLongPress={
                c.isGeneral
                  ? undefined
                  : () =>
                      Alert.alert(`#${c.name}`, undefined, [
                        { text: 'Salir del canal', style: 'destructive', onPress: () => void run(() => placesApi.leaveChannel(placeId, c.id)) },
                        { text: 'Cancelar', style: 'cancel' },
                      ])
              }
              style={styles.openBtn}
            >
              <Text style={styles.openText}>Abrir</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => void run(() => placesApi.joinChannel(placeId, c.id))} style={[styles.openBtn, styles.joinBtn]}>
              <Text style={[styles.openText, { color: colors.white }]}>Unirme</Text>
            </Pressable>
          )}
        </View>
      ))}
      <Text
        style={[ui.small, { marginTop: space.xs }]}
        onPress={() =>
          Alert.alert('Salir de la comunidad', 'Saldrás del General y de todos sus canales.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Salir', style: 'destructive', onPress: () => void run(() => placesApi.leave(placeId)) },
          ])
        }
      >
        Salir de la comunidad
      </Text>
    </View>
  );
}

/** Fotos y videos del social: solo miembros (403 si no). */
function Media({ placeId }: { placeId: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const { data, error, isLoading } = useQuery({
    queryKey: ['place-media', placeId],
    queryFn: () => placesApi.media(placeId),
    retry: false,
  });
  if (error instanceof ApiError && error.status === 403) {
    return (
      <View style={ui.card}>
        <Text style={ui.h2}>📷 Fotos y videos</Text>
        <Text style={ui.muted}>Únete a la comunidad para verlos.</Text>
      </View>
    );
  }
  if (isLoading || !data) return null;
  const items = data.items;
  return (
    <View style={ui.card}>
      <Text style={ui.h2}>📷 Fotos y videos</Text>
      {items.length === 0 ? (
        <Text style={ui.muted}>Todavía no hay fotos ni videos.</Text>
      ) : (
        <Grid3
          items={items}
          onOpen={setOpen}
          render={(m) => (
            <>
              {m.thumbUrl ? (
                <Image source={m.thumbUrl} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ fontSize: 22 }}>{m.kind === 'PHOTO' ? '🖼️' : '🎬'}</Text>
                </View>
              )}
              {m.kind === 'VIDEO' && <Text style={styles.badge}>▶ {formatDuration(m.durationMs) ?? ''}</Text>}
            </>
          )}
        />
      )}
      <MediaViewer
        items={items}
        urlFor={(mid) => placesApi.mediaUrl(placeId, mid)}
        index={open}
        onIndex={setOpen}
        onClose={() => setOpen(null)}
      />
    </View>
  );
}

export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: p, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['place', id],
    queryFn: () => placesApi.get(id),
  });
  const outdoor = p?.kind === 'OUTDOOR_SOCIAL';

  return (
    <>
      <Stack.Screen options={{ title: p?.name ?? 'Social' }} />
      <ScrollView
        style={ui.screen}
        contentContainerStyle={[ui.scroll, { paddingBottom: space.xxl }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              void refetch();
              void qc.invalidateQueries({ queryKey: ['place-community', id] });
              void qc.invalidateQueries({ queryKey: ['place-media', id] });
            }}
            tintColor={colors.clave}
          />
        }
      >
        {isLoading && <ActivityIndicator color={colors.clave} />}
        {error && <Text style={ui.error}>{error instanceof ApiError ? error.message : 'No se pudo cargar.'}</Text>}
        {p && (
          <>
            <View style={{ gap: 4 }}>
              <Text style={ui.h1}>{p.name}</Text>
              <Text style={ui.muted}>
                {[placeLabel(p.city, p.commune), regionName(p.region)].filter(Boolean).join(' · ')}
                {!p.active ? ' · EN PAUSA' : ''}
              </Text>
            </View>
            <Cover p={p} />
            <Info p={p} />
            <MapCard p={p} />
            {outdoor && <Community placeId={p.id} />}
            {outdoor && <Media placeId={p.id} />}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  cover: { width: '100%', aspectRatio: 1, borderRadius: radius.lg, backgroundColor: colors.surface },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  thumb: { width: '100%', height: '100%', backgroundColor: colors.selva },
  infoRow: { flexDirection: 'row', gap: space.md },
  infoLabel: { color: colors.textFaint, fontSize: 13, width: 72 },
  link: { color: colors.clave, fontSize: 14, fontWeight: '600' },
  map: { width: '100%', height: 180, borderRadius: radius.md, overflow: 'hidden' },
  channel: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  hash: { color: colors.bachata, fontSize: 18, fontWeight: '800', width: 20, textAlign: 'center' },
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
  openBtn: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 6 },
  joinBtn: { backgroundColor: colors.brand, borderColor: colors.brand },
  openText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  badge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: '#000000aa',
    paddingHorizontal: 5,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
