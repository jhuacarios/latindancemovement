import { useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { captureRef } from 'react-native-view-shot';
import { useQueryClient } from '@tanstack/react-query';
import { STICKER_MAX_BYTES, type StickerPackDto } from '@baile-latino/types';
import { ApiError, uploadImage } from '@/lib/api';
import { chatApi, chatKeys } from '@/lib/chat';
import { Button } from '@/components/button';
import { colors, detailHeader, radius, space, ui } from '@/lib/theme';

type Shape = 'circle' | 'rounded' | 'square';
const SHAPES: { value: Shape; label: string }[] = [
  { value: 'circle', label: 'Círculo' },
  { value: 'rounded', label: 'Redondeado' },
  { value: 'square', label: 'Cuadrado' },
];
const TEXT_COLORS = ['#ffffff', '#111111', '#facc15', '#22c55e', '#ef4444', '#ec4899'];
/** Lado del lienzo en pantalla; el sticker se guarda a OUT px (PNG, fondo transparente). */
const CANVAS = 280;
const OUT = 320;

/**
 * Crear un sticker: foto recortada (círculo, redondeado o cuadrado), borde blanco
 * opcional y texto arriba/abajo. Se dibuja en el teléfono y se guarda en "Mis stickers".
 * Si se abrió desde un chat (`chatId`), además se envía ahí.
 */
export default function StickerMakerScreen() {
  const { chatId } = useLocalSearchParams<{ chatId?: string }>();
  const qc = useQueryClient();
  const canvas = useRef<ComponentRef<typeof View>>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [shape, setShape] = useState<Shape>('circle');
  const [border, setBorder] = useState(true);
  const [top, setTop] = useState('');
  const [bottom, setBottom] = useState('');
  const [color, setColor] = useState(TEXT_COLORS[0]);
  const [busy, setBusy] = useState(false);

  const pick = async (from: 'library' | 'camera') => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
    const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!res.canceled && res.assets[0]) setUri(res.assets[0].uri);
  };

  const save = async () => {
    if (!canvas.current) return;
    setBusy(true);
    try {
      // PNG conserva la transparencia de las esquinas; si pesa mucho, se baja el tamaño.
      let out = await captureRef(canvas, { format: 'png', width: OUT, height: OUT, result: 'tmpfile' });
      if (new File(out).size > STICKER_MAX_BYTES) {
        out = await captureRef(canvas, { format: 'png', width: 240, height: 240, result: 'tmpfile' });
      }
      const pack = await uploadImage<StickerPackDto>('/stickers/mine', out, 'POST', 'image/png');
      void qc.invalidateQueries({ queryKey: ['stickers'] });
      const stickerId = pack.stickers[pack.stickers.length - 1];
      if (chatId && stickerId) {
        await chatApi.sendSticker(chatId, stickerId);
        void qc.invalidateQueries({ queryKey: chatKeys.conversations });
      }
      router.back();
    } catch (e) {
      Alert.alert('No se pudo', e instanceof Error && e.message ? e.message : 'No se pudo guardar el sticker.');
    } finally {
      setBusy(false);
    }
  };

  const radiusFor = shape === 'circle' ? CANVAS / 2 : shape === 'rounded' ? 48 : 6;
  const textStyle = [styles.text, { color, textShadowColor: color === '#111111' ? '#ffffff' : '#000000' }];

  return (
    <>
      <Stack.Screen options={{ ...detailHeader, title: 'Crear sticker' }} />
      <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[ui.scroll, { alignItems: 'stretch' }]} keyboardShouldPersistTaps="handled">
          {!uri ? (
            <View style={[ui.card, { alignItems: 'center' }]}>
              <Text style={{ fontSize: 48 }}>🩰</Text>
              <Text style={[ui.body, { textAlign: 'center' }]}>
                Elige una foto: se recorta, le pones texto y queda en tus stickers para usarla en cualquier chat.
              </Text>
              <Button title="Elegir de la galería" onPress={() => void pick('library')} style={{ alignSelf: 'stretch' }} />
              <Button title="Tomar foto" variant="ghost" onPress={() => void pick('camera')} style={{ alignSelf: 'stretch' }} />
            </View>
          ) : (
            <>
              {/* Lienzo: fondo transparente; lo de afuera de la forma queda transparente en el PNG. */}
              <View style={styles.stage}>
                <View ref={canvas} collapsable={false} style={styles.canvas}>
                  <View
                    style={[
                      styles.photoWrap,
                      { borderRadius: radiusFor, borderWidth: border ? 8 : 0 },
                    ]}
                  >
                    <Image source={uri} style={{ flex: 1 }} contentFit="cover" />
                  </View>
                  {top ? (
                    <Text style={[textStyle, styles.top]} numberOfLines={2} adjustsFontSizeToFit>
                      {top}
                    </Text>
                  ) : null}
                  {bottom ? (
                    <Text style={[textStyle, styles.bottom]} numberOfLines={2} adjustsFontSizeToFit>
                      {bottom}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={ui.card}>
                <Text style={ui.label}>Forma</Text>
                <View style={styles.row}>
                  {SHAPES.map((s) => (
                    <Pressable key={s.value} onPress={() => setShape(s.value)} style={[styles.pill, shape === s.value && styles.pillOn]}>
                      <Text style={[styles.pillText, shape === s.value && { color: colors.white }]}>{s.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={[styles.row, { justifyContent: 'space-between' }]}>
                  <Text style={ui.body}>Borde blanco</Text>
                  <Switch value={border} onValueChange={setBorder} trackColor={{ true: colors.brand, false: colors.line }} />
                </View>
                <Text style={ui.label}>Texto arriba</Text>
                <TextInput
                  value={top}
                  onChangeText={setTop}
                  placeholder="Ej: ¡VAMOS A BAILAR!"
                  placeholderTextColor={colors.textFaint}
                  maxLength={40}
                  style={ui.input}
                />
                <Text style={ui.label}>Texto abajo</Text>
                <TextInput
                  value={bottom}
                  onChangeText={setBottom}
                  placeholder="Ej: Ese giro 🔥"
                  placeholderTextColor={colors.textFaint}
                  maxLength={40}
                  style={ui.input}
                />
                <Text style={ui.label}>Color del texto</Text>
                <View style={styles.row}>
                  {TEXT_COLORS.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setColor(c)}
                      style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]}
                      accessibilityLabel={`Color ${c}`}
                    />
                  ))}
                </View>
              </View>

              <Button
                title={chatId ? 'Guardar y enviar' : 'Guardar en Mis stickers'}
                onPress={() => void save()}
                loading={busy}
              />
              <Button title="Elegir otra foto" variant="ghost" onPress={() => void pick('library')} disabled={busy} />
              {busy && <ActivityIndicator color={colors.clave} />}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignSelf: 'center',
    padding: space.sm,
    borderRadius: radius.lg,
    // Cuadriculado suave para que se note la transparencia (no sale en el sticker).
    backgroundColor: '#ffffff10',
  },
  canvas: { width: CANVAS, height: CANVAS, backgroundColor: 'transparent' },
  photoWrap: { flex: 1, overflow: 'hidden', borderColor: '#ffffff' },
  text: {
    position: 'absolute',
    left: 8,
    right: 8,
    textAlign: 'center',
    fontSize: 30,
    fontWeight: '900',
    textTransform: 'uppercase',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  top: { top: 10 },
  bottom: { bottom: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  pill: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.line },
  swatchOn: { borderColor: colors.clave, borderWidth: 3 },
});
