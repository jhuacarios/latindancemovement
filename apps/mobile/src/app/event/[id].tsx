import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { placeLabel, regionName, type EventDto } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import {
  eventMapsLink,
  eventsApi,
  flyerUrl,
  formatEventDateLong,
  formatEventTime,
  instagramProfileUrl,
  styleFamilies,
} from '@/lib/events';
import { Button } from '@/components/button';
import { MediaViewer } from '@/components/media-viewer';
import { StyleMixBar } from '@/components/style-mix-bar';
import { StyleTag } from '@/components/chips';
import { colors, radius, space, ui } from '@/lib/theme';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

/** Flyer completo, con su proporción; al tocarlo se abre a pantalla completa. */
function Flyer({ ev }: { ev: EventDto }) {
  const [ratio, setRatio] = useState(4 / 5);
  const [open, setOpen] = useState<number | null>(null);
  const img = flyerUrl(ev);
  if (!img) return null;
  return (
    <>
      <Pressable onPress={() => setOpen(0)} accessibilityLabel="Ver flyer">
        <Image
          source={img}
          style={[styles.flyer, { aspectRatio: ratio }]}
          contentFit="contain"
          onLoad={(e) => e.source.width && e.source.height && setRatio(e.source.width / e.source.height)}
        />
      </Pressable>
      <MediaViewer
        items={[{ id: ev.id, kind: 'PHOTO', title: ev.title }]}
        urlFor={async () => ({ url: img })}
        index={open}
        onIndex={setOpen}
        onClose={() => setOpen(null)}
      />
    </>
  );
}

function Details({ ev }: { ev: EventDto }) {
  const [more, setMore] = useState(false);
  const long = (ev.description?.length ?? 0) > 280;
  return (
    <View style={ui.card}>
      <Row label="Cuándo">
        <Text style={[ui.body, styles.capitalize]}>{formatEventDateLong(ev.startsAt)}</Text>
        <Text style={ui.muted}>
          {formatEventTime(ev.startsAt)}
          {ev.endsAt ? ` a ${formatEventTime(ev.endsAt)}` : ''} hrs
        </Text>
      </Row>
      {(ev.venueName || ev.address) && (
        <Row label="Dónde">
          {ev.venueName ? <Text style={ui.body}>{ev.venueName}</Text> : null}
          {ev.address ? <Text style={ui.muted}>{ev.address}</Text> : null}
        </Row>
      )}
      {(ev.styles.length > 0 || ev.bachataPct != null) && (
        <Row label="Estilos">
          {ev.bachataPct != null ? (
            <StyleMixBar pct={ev.bachataPct} />
          ) : (
            <View style={styles.tags}>
              {styleFamilies(ev.styles).map((s) => (
                <StyleTag key={s} style={s} />
              ))}
            </View>
          )}
        </Row>
      )}
      {ev.priceInfo ? (
        <Row label="Entradas">
          <Text style={ui.body}>{ev.priceInfo}</Text>
        </Row>
      ) : null}
      {(ev.organizerName || ev.organizerInstagram) && (
        <Row label="Organiza">
          {ev.organizerName ? <Text style={ui.body}>{ev.organizerName}</Text> : null}
          {ev.organizerInstagram ? (
            <Text
              style={styles.link}
              onPress={() => void Linking.openURL(instagramProfileUrl(ev.organizerInstagram!))}
            >
              @{ev.organizerInstagram.replace(/^@/, '')}
            </Text>
          ) : null}
        </Row>
      )}
      {ev.description ? (
        <Row label="Detalles">
          <Text style={ui.body} numberOfLines={long && !more ? 8 : undefined}>
            {ev.description}
          </Text>
          {long && (
            <Text style={styles.link} onPress={() => setMore((m) => !m)}>
              {more ? 'Ver menos' : 'Ver más'}
            </Text>
          )}
        </Row>
      ) : null}
      <Row label="Publicado por">
        <Text style={ui.muted}>{ev.createdByName}</Text>
      </Row>
    </View>
  );
}

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: ev, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['event', id],
    queryFn: () => eventsApi.get(id),
  });

  if (isLoading) {
    return (
      <View style={[ui.screen, styles.center]}>
        <Stack.Screen options={{ title: 'Evento' }} />
        <ActivityIndicator color={colors.clave} />
      </View>
    );
  }
  if (error || !ev) {
    return (
      <View style={[ui.screen, styles.center]}>
        <Stack.Screen options={{ title: 'Evento' }} />
        <Text style={ui.error}>{error instanceof ApiError ? error.message : 'Evento no encontrado.'}</Text>
      </View>
    );
  }

  const cancelled = ev.status === 'CANCELLED';
  const maps = eventMapsLink(ev);
  const where = [regionName(ev.region), ev.city ? placeLabel(ev.city, ev.commune) : null].filter(Boolean).join(' · ');

  return (
    <>
      <Stack.Screen options={{ title: ev.title }} />
      <ScrollView
        style={ui.screen}
        contentContainerStyle={[ui.scroll, { paddingBottom: space.xxl }]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.clave} />
        }
      >
        <View style={{ gap: 4 }}>
          <Text style={ui.h1}>{ev.title}</Text>
          {cancelled && <Text style={styles.cancelled}>CANCELADO</Text>}
          <Text style={ui.muted}>{where}</Text>
        </View>

        <Flyer ev={ev} />
        <Details ev={ev} />

        <View style={{ gap: space.sm }}>
          {ev.ticketUrl && !cancelled && (
            <Button title="🎟️ Comprar entradas" onPress={() => void Linking.openURL(ev.ticketUrl!)} />
          )}
          {maps && <Button title="📍 Cómo llegar" variant="ghost" onPress={() => void Linking.openURL(maps)} />}
          {ev.instagramUrl && (
            <Button
              title="Ver la publicación en Instagram"
              variant="ghost"
              onPress={() => void Linking.openURL(ev.instagramUrl!)}
            />
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
  flyer: { width: '100%', borderRadius: radius.lg, backgroundColor: colors.surface },
  row: { flexDirection: 'row', gap: space.md },
  rowLabel: { width: 92, color: colors.textFaint, fontSize: 13, paddingTop: 2 },
  capitalize: { textTransform: 'capitalize' },
  tags: { flexDirection: 'row', gap: 6 },
  link: { color: colors.clave, fontSize: 14, marginTop: 2 },
  cancelled: {
    alignSelf: 'flex-start',
    color: colors.danger,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: '#ef444422',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
