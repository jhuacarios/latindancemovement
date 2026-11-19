import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { WEEKDAYS, academiesApi, academyLogoUrl } from '@/lib/academies';
import {
  MONTH_NAMES,
  birthdayError,
  birthdayLabel,
  formatRut,
  formatRutInput,
  isValidRut,
  normalizeInstagramHandle,
  placeLabel,
  publicName,
  regionName,
  type PublicUser,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/button';
import { colors, radius, space, ui } from '@/lib/theme';

function Field({
  label,
  hint,
  hintTone = 'muted',
  ...input
}: { label: string; hint?: string; hintTone?: 'muted' | 'ok' | 'error' } & TextInputProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={ui.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.textFaint} style={ui.input} {...input} />
      {hint ? (
        <Text
          style={[
            ui.small,
            hintTone === 'ok' && { color: colors.clave },
            hintTone === 'error' && { color: colors.danger },
          ]}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Mes del cumpleaños: chips de los 12 meses (más cómodo que escribir un número). */
function MonthPicker({ value, onChange }: { value: number | null; onChange: (m: number | null) => void }) {
  return (
    <View style={styles.months}>
      {MONTH_NAMES.map((m, i) => {
        const on = value === i + 1;
        return (
          <Text
            key={m}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(on ? null : i + 1)}
            style={[styles.month, on && styles.monthOn]}
          >
            {m.slice(0, 3)}
          </Text>
        );
      })}
    </View>
  );
}

function PersonalData({ user }: { user: PublicUser }) {
  const { updateUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [lastName, setLastName] = useState(user.lastName ?? '');
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [instagram, setInstagram] = useState(user.instagramHandle ? `@${user.instagramHandle}` : '');
  const [bDay, setBDay] = useState(user.birthDay ? String(user.birthDay) : '');
  const [bMonth, setBMonth] = useState<number | null>(user.birthMonth);
  const [rut, setRut] = useState(user.rut ? formatRut(user.rut) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOk = name.trim().length >= 2;
  const igFilled = instagram.trim() !== '';
  const igOk = !igFilled || normalizeInstagramHandle(instagram) !== null;
  const day = bDay ? Number(bDay) : null;
  const bdayErr = birthdayError(day, bMonth);
  const rutFilled = rut.trim() !== '';
  const rutOk = !rutFilled || isValidRut(rut);
  const showRutErr = rutFilled && !rutOk && rut.replace(/[^0-9kK]/g, '').length >= 8;
  const valid = nameOk && igOk && !bdayErr && rutOk;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const u = await api<PublicUser>('/auth/me/profile', {
        method: 'PATCH',
        body: {
          name: name.trim(),
          lastName: lastName.trim() || null,
          displayName: displayName.trim() || null,
          instagramHandle: igFilled ? instagram.trim() : null,
          birthDay: day,
          birthMonth: bMonth,
          rut: rutFilled ? rut.trim() : null,
        },
      });
      updateUser(u);
      setInstagram(u.instagramHandle ? `@${u.instagramHandle}` : '');
      setRut(u.rut ? formatRut(u.rut) : '');
      Alert.alert('Listo', 'Tus datos quedaron guardados.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar. Revisa tu conexión.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={ui.card}>
      <Text style={ui.h2}>Datos personales</Text>
      <Text style={ui.small}>
        La comunidad ve tu nombre visible. Tu nombre completo, cumpleaños y RUT solo los ves tú y
        la administración.
      </Text>
      <Field label="Nombre" value={name} onChangeText={setName} autoComplete="given-name" maxLength={80}
        hint={nameOk ? undefined : 'Al menos 2 letras.'} hintTone="error" />
      <Field label="Apellido" value={lastName} onChangeText={setLastName} autoComplete="family-name" maxLength={80} />
      <Field label="Nombre visible (opcional)" value={displayName} onChangeText={setDisplayName} maxLength={40}
        placeholder={name.trim() || 'Ej: La Cote, DJ Mambo'}
        hint="Tu pseudónimo: es lo que ve la comunidad. Si lo dejas vacío, se ve tu nombre." />
      <Field label="Instagram (opcional)" value={instagram} onChangeText={setInstagram} placeholder="@tucuenta"
        autoCapitalize="none" autoCorrect={false} maxLength={120}
        hint={igOk ? 'Tu @ o el link de tu perfil. Lo ve la comunidad.' : 'Solo letras, números, punto y guion bajo.'}
        hintTone={igOk ? 'muted' : 'error'} />

      <View style={{ gap: 6 }}>
        <Text style={ui.label}>Cumpleaños (opcional)</Text>
        <TextInput
          value={bDay}
          onChangeText={(t) => setBDay(t.replace(/\D/g, '').slice(0, 2))}
          placeholder="Día"
          placeholderTextColor={colors.textFaint}
          keyboardType="number-pad"
          style={[ui.input, { width: 90 }]}
        />
        <MonthPicker value={bMonth} onChange={setBMonth} />
        <Text style={[ui.small, bdayErr ? { color: colors.danger } : null]}>
          {bdayErr ?? (day && bMonth ? `🎂 ${birthdayLabel(day, bMonth)}` : 'Solo día y mes.')}
        </Text>
      </View>

      <Field label="RUT" value={rut} onChangeText={(t) => setRut(formatRutInput(t))} placeholder="12.345.678-5"
        autoCapitalize="characters" maxLength={12}
        hint={showRutErr ? 'El dígito verificador no calza.' : rutFilled && rutOk ? '✓ RUT válido' : 'Con dígito verificador (si es K, al final).'}
        hintTone={showRutErr ? 'error' : rutFilled && rutOk ? 'ok' : 'muted'} />

      {error && <Text style={ui.error}>{error}</Text>}
      <Button title="Guardar" onPress={() => void save()} loading={saving} disabled={!valid} />
    </View>
  );
}

/** Mis clases de academias (aceptadas primero, luego pendientes). */
function MyClasses() {
  const { data, isLoading } = useQuery({ queryKey: ['my-enrollments'], queryFn: academiesApi.myEnrollments });
  const list = [...(data ?? [])].sort((a, b) => Number(b.status === 'ACCEPTED') - Number(a.status === 'ACCEPTED'));
  return (
    <View style={ui.card}>
      <Text style={ui.h2}>Mis clases</Text>
      {isLoading ? (
        <ActivityIndicator color={colors.clave} />
      ) : list.length === 0 ? (
        <Text style={ui.muted}>
          Todavía no estás inscrito en ninguna clase. Busca una academia y pide inscripción.
        </Text>
      ) : (
        list.map((e) => {
          const logo = academyLogoUrl({ id: e.academyId, hasLogo: e.academyHasLogo });
          return (
            <Pressable
              key={e.id}
              onPress={() => router.push({ pathname: '/academy/[id]', params: { id: e.academyId } })}
              style={({ pressed }) => [styles.classRow, pressed && { opacity: 0.7 }]}
            >
              {logo ? (
                <Image source={logo} style={styles.classLogo} contentFit="cover" />
              ) : (
                <View style={[styles.classLogo, { alignItems: 'center', justifyContent: 'center' }]}>
                  <Text>🎓</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={ui.body} numberOfLines={1}>{e.classTitle}</Text>
                <Text style={ui.small} numberOfLines={1}>
                  {e.academyName} · {WEEKDAYS[e.weekday]} {e.startTime}
                </Text>
              </View>
              <Text
                onPress={
                  e.status === 'ACCEPTED' && e.chatId
                    ? () => router.push({ pathname: '/chat/[id]', params: { id: e.chatId! } })
                    : undefined
                }
                style={[
                  styles.status,
                  e.status === 'ACCEPTED'
                    ? { color: colors.clave, backgroundColor: '#1a7a4e33' }
                    : { color: colors.bachata, backgroundColor: '#f59e0b22' },
                ]}
              >
                {e.status === 'ACCEPTED' ? (e.chatId ? '💬 Chat' : '✓ Inscrito') : '⏳ Pendiente'}
              </Text>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const where = [placeLabel(user.city, user.commune), user.region && regionName(user.region)]
    .filter(Boolean)
    .join(' · ');

  return (
    <SafeAreaView style={ui.screen} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={ui.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{publicName(user).charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={ui.h1} numberOfLines={1}>{publicName(user)}</Text>
              <Text style={ui.muted} numberOfLines={1}>{user.email}</Text>
              {where ? <Text style={ui.small}>{where}</Text> : null}
            </View>
          </View>

          <MyClasses />

          <PersonalData user={user} />

          <Button
            title="Cerrar sesión"
            variant="danger"
            onPress={() =>
              Alert.alert('Cerrar sesión', '¿Quieres salir de tu cuenta en este teléfono?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Salir', style: 'destructive', onPress: () => void logout() },
              ])
            }
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontSize: 26, fontWeight: '700' },
  months: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  classLogo: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.selva },
  status: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' },
  month: {
    color: colors.textMuted,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    overflow: 'hidden',
    textTransform: 'capitalize',
  },
  monthOn: { color: colors.white, backgroundColor: colors.brand, borderColor: colors.brand },
});
