import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function SeleccionModo() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>¿Cómo usarás ClearStreets?</Text>
      <Link href="/operador" asChild>
        <Pressable style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>Soy operador en campo</Text>
        </Pressable>
      </Link>
      <Link href="/ciudadano" asChild>
        <Pressable style={[styles.button, styles.secondary]} accessibilityRole="button">
          <Text style={styles.buttonText}>Soy ciudadano</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  button: { minHeight: 64, borderRadius: 12, backgroundColor: '#208AEF', justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: '#0F766E' },
  buttonText: { color: 'white', fontSize: 18, fontWeight: '600' },
});
