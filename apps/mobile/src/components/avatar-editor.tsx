import { useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { avatarPath, publicName, type PublicUser } from '@baile-latino/types';
import { API_BASE, ApiError, api, uploadImage } from '@/lib/api';
import { toJpeg } from '@/lib/images';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

/** Foto de perfil, o la inicial sobre el color de la marca si no tiene. */
export function UserAvatar({
  user,
  size,
}: {
  user: Pick<PublicUser, 'id' | 'avatarAt' | 'name' | 'displayName'>;
  size: number;
}) {
  const path = avatarPath(user);
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (path) return <Image source={`${API_BASE}${path}`} style={[box, styles.img]} contentFit="cover" transition={150} />;
  return (
    <View style={[box, styles.empty]}>
      <Text style={[styles.initial, { fontSize: size * 0.4 }]}>
        {publicName(user).trim().charAt(0).toUpperCase() || '👤'}
      </Text>
    </View>
  );
}

/** Avatar del perfil propio: al tocarlo se cambia (galería o cámara, recortada en cuadrado) o se quita. */
export function AvatarEditor({ size = 72 }: { size?: number }) {
  const { user, updateUser } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const upload = async (from: 'library' | 'camera') => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
    const res =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    setBusy(true);
    try {
      // Ya viene recortada en cuadrado: se achica a 512 px y se pasa a JPG (también si era HEIC).
      const jpg = await toJpeg(asset.uri, asset.width > 512 ? 512 : null);
      updateUser(await uploadImage<PublicUser>('/auth/me/avatar', jpg));
    } catch (e) {
      Alert.alert('No se pudo', e instanceof Error && e.message ? e.message : 'No se pudo usar esa imagen.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      updateUser(await api<PublicUser>('/auth/me/avatar', { method: 'DELETE' }));
    } catch (e) {
      Alert.alert('No se pudo', e instanceof ApiError ? e.message : 'Revisa tu conexión.');
    } finally {
      setBusy(false);
    }
  };

  const open = () => {
    const actions: { label: string; run: () => void; destructive?: boolean }[] = [
      { label: 'Elegir de la galería', run: () => void upload('library') },
      { label: 'Tomar foto', run: () => void upload('camera') },
      ...(user.avatarAt ? [{ label: 'Quitar foto', run: () => void remove(), destructive: true }] : []),
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Foto de perfil',
          options: [...actions.map((a) => a.label), 'Cancelar'],
          cancelButtonIndex: actions.length,
          destructiveButtonIndex: actions.findIndex((a) => a.destructive),
        },
        (i) => actions[i]?.run(),
      );
    } else {
      Alert.alert('Foto de perfil', undefined, [
        ...actions.map((a) => ({ text: a.label, onPress: a.run, style: a.destructive ? ('destructive' as const) : undefined })),
        { text: 'Cancelar', style: 'cancel' as const },
      ]);
    }
  };

  return (
    <Pressable onPress={open} disabled={busy} accessibilityLabel="Cambiar foto de perfil">
      <UserAvatar user={user} size={size} />
      <View style={[styles.badge, busy && { backgroundColor: colors.surface }]}>
        {busy ? <ActivityIndicator size="small" color={colors.clave} /> : <Text style={styles.badgeText}>✎</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  img: { backgroundColor: colors.surface },
  empty: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.white, fontWeight: '700' },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.brand,
    borderWidth: 2,
    borderColor: colors.selva,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 13, fontWeight: '700' },
});
