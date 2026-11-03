import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

interface ClubvelSpotlightProps {
  title?: string;
  subtitle?: string;
  onPress?: () => void;
  showLabel?: boolean;
}

export const ClubvelSpotlight: React.FC<ClubvelSpotlightProps> = ({
  title = 'Clubvel Spotlight',
  subtitle = 'Smart savings. Stronger together.',
  onPress,
  showLabel = true,
}) => {
  const Container: any = onPress ? TouchableOpacity : View;

  return (
    <Container
      style={styles.container}
      onPress={onPress}
      activeOpacity={onPress ? 0.9 : 1}
      accessibilityRole={onPress ? 'button' : 'none'}
    >
      {showLabel && (
        <View style={styles.labelRow}>
          <Text style={styles.labelText}>Spotlight</Text>
        </View>
      )}
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="sparkles" size={18} color={Colors.textPrimary} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
        {onPress && (
          <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
        )}
      </View>
    </Container>
  );
};

export default ClubvelSpotlight;

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 24,
    marginTop: 18,
    marginBottom: 12,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  labelRow: {
    marginBottom: 6,
  },
  labelText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 1,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
});
