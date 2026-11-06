import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { iniciarSesion, registrarse } from './useSesion';

interface Props {
  titulo: string;
  descripcion: string;
  /** Los operadores no se registran: los invita su alcaldía (RF-01). */
  permitirRegistro: boolean;
  color?: string;
}

export function FormularioAcceso({ titulo, descripcion, permitirRegistro, color = '#0F766E' }: Props) {
  const [modo, setModo] = useState<'entrar' | 'registro'>('entrar');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'aviso'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    setEnviando(true);
    setMensaje(null);
    if (modo === 'entrar') {
      const e = await iniciarSesion(correo, contrasena);
      if (e) setMensaje({ tipo: 'error', texto: e });
    } else {
      const r = await registrarse(correo, contrasena);
      if (r?.error) setMensaje({ tipo: 'error', texto: r.error });
      else if (r?.aviso) setMensaje({ tipo: 'aviso', texto: r.aviso });
    }
    setEnviando(false);
  };

  return (
    <KeyboardAvoidingView behavior="height" style={styles.container}>
      <Text style={styles.titulo}>{modo === 'entrar' ? titulo : 'Crear cuenta'}</Text>
      <Text style={styles.texto}>{descripcion}</Text>
      <TextInput
        style={styles.input}
        placeholder="Correo"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={correo}
        onChangeText={setCorreo}
      />
      <TextInput
        style={styles.input}
        placeholder={modo === 'registro' ? 'Contraseña (mín. 8 caracteres)' : 'Contraseña'}
        secureTextEntry
        autoComplete={modo === 'registro' ? 'new-password' : 'current-password'}
        value={contrasena}
        onChangeText={setContrasena}
      />
      {mensaje && <Text style={mensaje.tipo === 'error' ? styles.error : styles.aviso}>{mensaje.texto}</Text>}
      <Pressable
        style={[styles.boton, { backgroundColor: color }]}
        onPress={enviar}
        disabled={enviando || !correo || !contrasena}
        accessibilityRole="button">
        {enviando ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.textoBoton}>{modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}</Text>
        )}
      </Pressable>
      {permitirRegistro && (
        <Pressable onPress={() => setModo(modo === 'entrar' ? 'registro' : 'entrar')} accessibilityRole="button" style={styles.cambiar}>
          <Text style={styles.textoCambiar}>{modo === 'entrar' ? '¿No tienes cuenta? Regístrate' : 'Ya tengo cuenta'}</Text>
        </Pressable>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  titulo: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  texto: { fontSize: 16, textAlign: 'center', color: '#475569' },
  input: { minHeight: 56, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, paddingHorizontal: 16, fontSize: 17 },
  error: { color: '#B91C1C', textAlign: 'center' },
  aviso: { color: '#0F766E', textAlign: 'center' },
  boton: { minHeight: 64, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  textoBoton: { color: 'white', fontSize: 18, fontWeight: '700' },
  cambiar: { alignItems: 'center', padding: 8 },
  textoCambiar: { color: '#0F766E', fontWeight: '600' },
});
