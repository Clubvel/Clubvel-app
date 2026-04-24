import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  backRoute?: string;
  showProfile?: boolean;
  onProfilePress?: () => void;
  backgroundColor?: string;
  titleColor?: string;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  showBackButton = false,
  backRoute,
  showProfile = true,
  onProfilePress,
  backgroundColor = Colors.darkGreen,
  titleColor = Colors.white,
}) => {
  const router = useRouter();
  const { user } = useAuth();

  const handleBackPress = () => {
    if (backRoute) {
      router.push(backRoute as any);
    } else {
      router.back();
    }
  };

  const handleProfilePress = () => {
    if (onProfilePress) {
      onProfilePress();
    }
  };

  return (
    <View style={[styles.header, { backgroundColor }]}>
      <View style={styles.leftSection}>
        {showBackButton && (
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={titleColor} />
          </TouchableOpacity>
        )}
        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
          {subtitle && (
            <Text style={[styles.subtitle, { color: titleColor === Colors.white ? 'rgba(255,255,255,0.7)' : Colors.textSecondary }]}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      {showProfile && (
        <TouchableOpacity onPress={handleProfilePress} style={styles.profileButton}>
          {user?.profile_photo ? (
            <Image source={{ uri: user.profile_photo }} style={styles.profileImage} />
          ) : (
            <View style={styles.profilePlaceholder}>
              <Ionicons name="person" size={20} color={Colors.white} />
            </View>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  profileButton: {
    padding: 4,
  },
  profileImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  profilePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AppHeader;
