import { useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  PanResponder,
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
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { captureRef } from 'react-native-view-shot';
import Svg, { Path } from 'react-native-svg';
import { useQueryClient } from '@tanstack/react-query';
import {
  STICKER_MAX_BYTES,
  type StickerCutoutMode,
  type StickerCutoutResponse,
  type StickerPackDto,
} from '@baile-latino/types';
import { uploadImage } from '@/lib/api';
import { toJpeg } from '@/lib/images';
import { chatApi, chatKeys } from '@/lib/chat';
import { Button } from '@/components/button';
import { colors, detailHeader, radius, space, ui } from '@/lib/theme';

type Shape = 'circle' | 'rounded' | 'square';
type Tool = 'shape' | 'lasso';
const SHAPES: { value: Shape; label: string }[] = [
  { value: 'circle', label: 'Círculo' },
  { value: 'rounded', label: 'Redondeado' },
  { value: 'square', label: 'Cuadrado' },
];
const TOOLS: { value: Tool; label: string }[] = [
  { value: 'lasso', label: '✂️ Recortar a mano' },
  { value: 'shape', label: '⚪ Forma' },
];
const TEXT_COLORS = ['#ffffff', '#111111', '#facc15', '#22c55e', '#ef4444', '#ec4899'];
/** Lado del lienzo en pantalla (puntos). */
const CANVAS = 280;
/** Mínimo de puntos para que el trazo cuente como contorno. */
const MIN_POINTS = 12;

type Pt = { x: number; y: number };

/**
 * Deja el sticker liviano: WebP 512 px (conserva la transparencia); si aún pesa
 * mucho, más chico. La captura del lienzo sale a la resolución de la pantalla
 * (en iPhone 3x = ~840 px en PNG), que pasaba del límite.
 */
async function compressSticker(uri: string): Promise<{ uri: string; mime: string }> {
  const tries = [
    { width: 512, compress: 0.82, format: SaveFormat.WEBP, mime: 'image/webp' },
    { width: 384, compress: 0.7, format: SaveFormat.WEBP, mime: 'image/webp' },
    { width: 320, compress: 1, format: SaveFormat.PNG, mime: 'image/png' },
  ];
  for (const t of tries) {
    try {
      const ctx = ImageManipulator.manipulate(uri);
      ctx.resize({ width: t.width });
      const ref = await ctx.renderAsync();
      const out = await ref.saveAsync({ compress: t.compress, format: t.format });
      if (new File(out.uri).size <= STICKER_MAX_BYTES) return { uri: out.uri, mime: t.mime };
    } catch {
      // si un formato falla en este teléfono, se prueba el siguiente
    }
  }
  throw new Error('El sticker quedó muy pesado. Prueba con menos detalle o sin texto.');
}

/**
 * Crear un sticker con una foto:
 * - Recortar a mano: dibujas con el dedo el contorno de lo que quieres y el servidor
 *   lo recorta (✨ inteligente: ajusta el borde al objeto que encerraste; o tal cual).
 * - Forma: la foto en círculo, redondeada o cuadrada.
 * Borde blanco opcional y texto arriba/abajo. Queda en "Mis stickers"; si se abrió
 * desde un chat (`chatId`), además se envía ahí.
 */
export default function StickerMakerScreen() {
  const { chatId } = useLocalSearchParams<{ chatId?: string }>();
  const qc = useQueryClient();
  const canvas = useRef<ComponentRef<typeof View>>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('lasso');
  const [shape, setShape] = useState<Shape>('circle');
  const [border, setBorder] = useState(true);
  const [top, setTop] = useState('');
  const [bottom, setBottom] = useState('');
  const [color, setColor] = useState(TEXT_COLORS[0]);
  const [busy, setBusy] = useState(false);
  // Recorte a mano
  const [points, setPoints] = useState<Pt[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [cutting, setCutting] = useState<StickerCutoutMode | null>(null);
  const [cutout, setCutout] = useState<StickerCutoutResponse | null>(null);
  const pts = useRef<Pt[]>([]);

  const clearLasso = () => {
    pts.current = [];
    setPoints([]);
    setCutout(null);
  };

  const pick = async (from: 'library' | 'camera') => {
    try {
      if (from === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Sin acceso a la cámara', 'Dale permiso a Nectason para usar la cámara en Ajustes.');
          return;
        }
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
      const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      const asset = res.canceled ? null : res.assets[0];
      if (!asset) return;
      // Se achica y se pasa a JPG (las del iPhone vienen en HEIC y muy grandes).
      setUri(await toJpeg(asset.uri, asset.width > 1024 ? 1024 : null, 0.9));
      clearLasso();
    } catch (e) {
      Alert.alert('No se pudo usar esa foto', e instanceof Error && e.message ? e.message : 'Prueba con otra.');
    }
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          setDrawing(true);
          setCutout(null);
          pts.current = [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
          setPoints(pts.current);
        },
        onPanResponderMove: (e) => {
          const x = Math.min(Math.max(e.nativeEvent.locationX, 0), CANVAS);
          const y = Math.min(Math.max(e.nativeEvent.locationY, 0), CANVAS);
          const last = pts.current[pts.current.length - 1];
          if (last && Math.hypot(x - last.x, y - last.y) < 3) return;
          pts.current = [...pts.current, { x, y }];
          setPoints(pts.current);
        },
        onPanResponderRelease: () => setDrawing(false),
        onPanResponderTerminate: () => setDrawing(false),
      }),
    [],
  );

  const closed = !drawing && points.length >= MIN_POINTS;
  const pathD = points.length
    ? `M${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')}${closed ? ' Z' : ''}`
    : '';

  const cut = async (mode: StickerCutoutMode) => {
    if (!uri || !closed) return;
    setCutting(mode);
    try {
      const polygon = points.map((p) => [+(p.x / CANVAS).toFixed(4), +(p.y / CANVAS).toFixed(4)]);
      setCutout(
        await uploadImage<StickerCutoutResponse>('/stickers/cutout', uri, 'POST', 'image/jpeg', {
          polygon: JSON.stringify(polygon),
          mode,
        }),
      );
    } catch (e) {
      Alert.alert('No se pudo recortar', e instanceof Error && e.message ? e.message : 'Intenta de nuevo.');
    } finally {
      setCutting(null);
    }
  };

  const save = async () => {
    if (!canvas.current) return;
    setBusy(true);
    try {
      const shot = await captureRef(canvas, { format: 'png', result: 'tmpfile' });
      const out = await compressSticker(shot);
      const pack = await uploadImage<StickerPackDto>('/stickers/mine', out.uri, 'POST', out.mime);
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
  const lassoEditing = tool === 'lasso' && !cutout;
  const canSave = tool === 'shape' || !!cutout;

  return (
    <>
      <Stack.Screen options={{ ...detailHeader, title: 'Crear sticker' }} />
      <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[ui.scroll, { alignItems: 'stretch' }]}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!drawing}
        >
          {!uri ? (
            <View style={[ui.card, { alignItems: 'center' }]}>
              <Text style={{ fontSize: 48 }}>🩰</Text>
              <Text style={[ui.body, { textAlign: 'center' }]}>
                Elige una foto: la recortas (a mano o con una forma), le pones texto y queda en tus stickers para usarla
                en cualquier chat.
              </Text>
              <Button title="Elegir de la galería" onPress={() => void pick('library')} style={{ alignSelf: 'stretch' }} />
              <Button title="Tomar foto" variant="ghost" onPress={() => void pick('camera')} style={{ alignSelf: 'stretch' }} />
            </View>
          ) : (
            <>
              <View style={[styles.row, { justifyContent: 'center' }]}>
                {TOOLS.map((t) => (
                  <Pressable key={t.value} onPress={() => setTool(t.value)} style={[styles.pill, tool === t.value && styles.pillOn]}>
                    <Text style={[styles.pillText, tool === t.value && { color: colors.white }]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.stage}>
                {lassoEditing ? (
                  // Dibujar el contorno sobre la foto (esto no es el sticker, no se captura).
                  <View style={styles.canvas} {...pan.panHandlers}>
                    <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" />
                    <Svg width={CANVAS} height={CANVAS} style={StyleSheet.absoluteFill} pointerEvents="none">
                      {pathD ? (
                        <>
                          <Path
                            d={pathD}
                            stroke="#000000"
                            strokeWidth={5}
                            fill={closed ? '#ffffff33' : 'none'}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                          <Path
                            d={pathD}
                            stroke="#ffffff"
                            strokeWidth={2.5}
                            fill="none"
                            strokeDasharray="8 6"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                        </>
                      ) : null}
                    </Svg>
                    {cutting ? (
                      <View style={styles.cuttingOverlay}>
                        <ActivityIndicator color={colors.white} size="large" />
                        <Text style={styles.cuttingText}>{cutting === 'smart' ? 'Recortando con IA…' : 'Recortando…'}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  // Lienzo del sticker: lo de afuera queda transparente en la imagen final.
                  <View ref={canvas} collapsable={false} style={styles.canvas}>
                    {tool === 'lasso' && cutout ? (
                      <Image source={{ uri: border ? cutout.bordered : cutout.image }} style={{ flex: 1 }} contentFit="contain" />
                    ) : (
                      <View style={[styles.photoWrap, { borderRadius: radiusFor, borderWidth: border ? 8 : 0 }]}>
                        <Image source={uri} style={{ flex: 1 }} contentFit="cover" />
                      </View>
                    )}
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
                )}
              </View>

              {lassoEditing ? (
                <View style={ui.card}>
                  {!closed ? (
                    <Text style={[ui.body, { textAlign: 'center' }]}>
                      Con el dedo, dibuja el contorno de lo que quieres recortar (una persona, una cara, un objeto) sin
                      soltar hasta cerrar la vuelta.
                    </Text>
                  ) : (
                    <>
                      <Button
                        title="✨ Recorte inteligente"
                        onPress={() => void cut('smart')}
                        loading={cutting === 'smart'}
                        disabled={!!cutting}
                      />
                      <Text style={[ui.muted, { textAlign: 'center' }]}>
                        Ajusta el borde a lo que encerraste. Si prefieres tu línea exacta, usa "Tal cual".
                      </Text>
                      <View style={[styles.row, { justifyContent: 'center' }]}>
                        <Button
                          title="Tal cual"
                          variant="ghost"
                          onPress={() => void cut('manual')}
                          loading={cutting === 'manual'}
                          disabled={!!cutting}
                        />
                        <Button title="Borrar trazo" variant="ghost" onPress={clearLasso} disabled={!!cutting} />
                      </View>
                    </>
                  )}
                </View>
              ) : (
                <View style={ui.card}>
                  {tool === 'lasso' && cutout ? (
                    <>
                      {cutout.busy ? (
                        <Text style={ui.muted}>
                          El recorte inteligente está ocupado ahora: se recortó siguiendo tu línea. Prueba de nuevo en
                          unos minutos.
                        </Text>
                      ) : !cutout.smart ? (
                        <Text style={ui.muted}>Se recortó siguiendo tu línea.</Text>
                      ) : null}
                      <Button title="Volver a dibujar" variant="ghost" onPress={clearLasso} />
                    </>
                  ) : (
                    <>
                      <Text style={ui.label}>Forma</Text>
                      <View style={styles.row}>
                        {SHAPES.map((s) => (
                          <Pressable key={s.value} onPress={() => setShape(s.value)} style={[styles.pill, shape === s.value && styles.pillOn]}>
                            <Text style={[styles.pillText, shape === s.value && { color: colors.white }]}>{s.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}
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
              )}

              {canSave ? (
                <Button title={chatId ? 'Guardar y enviar' : 'Guardar en Mis stickers'} onPress={() => void save()} loading={busy} />
              ) : null}
              <Button
                title="Elegir otra foto"
                variant="ghost"
                onPress={() => void pick('library')}
                disabled={busy || !!cutting}
              />
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
    // Fondo suave para que se note la transparencia (no sale en el sticker).
    backgroundColor: '#ffffff10',
  },
  canvas: { width: CANVAS, height: CANVAS, backgroundColor: 'transparent', overflow: 'hidden' },
  photoWrap: { flex: 1, overflow: 'hidden', borderColor: '#ffffff' },
  cuttingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  cuttingText: { color: colors.white, fontWeight: '700' },
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
