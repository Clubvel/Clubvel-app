import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';

export default function TrustScoreScreen() {
  const router = useRouter();
  const signals = [
    ['checkmark-circle-outline', 'Confirmed contributions', 'Verified contribution records, not self-reported activity.'],
    ['time-outline', 'Payment consistency', 'Confirmed payment timing where reliable due-date data exists.'],
    ['calendar-outline', 'Participation history', 'Length of verified active participation in Clubvel groups.'],
    ['people-outline', 'Verified group participation', 'Only active memberships in real Clubvel groups.'],
  ] as const;
  return <View style={styles.container}>
    <View style={styles.header}><TouchableOpacity onPress={() => router.back()} style={styles.side}><Ionicons name="arrow-back" size={24} color={Colors.white}/></TouchableOpacity><Text style={styles.headerTitle}>Trust Score</Text><View style={styles.side}/></View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}><Ionicons name="shield-checkmark-outline" size={54} color={Colors.gold}/><Text style={styles.title}>Not scored yet</Text><Text style={styles.body}>Clubvel does not currently assign you a numerical Trust Score. We will not show a made-up score when there is no validated scoring model.</Text></View>
      <Text style={styles.sectionTitle}>What a future score could use</Text>
      {signals.map(([icon,title,body]) => <View key={title} style={styles.card}><Ionicons name={icon} size={24} color={Colors.mediumGreen}/><View style={styles.cardText}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardBody}>{body}</Text></View></View>)}
      <View style={styles.note}><Ionicons name="information-circle-outline" size={22} color={Colors.mediumGreen}/><Text style={styles.noteText}>Any future score should use verifiable Clubvel participation data and be explained clearly. Clubvel is not presenting this as a credit score or lender assessment.</Text></View>
    </ScrollView>
  </View>;
}
const styles=StyleSheet.create({container:{flex:1,backgroundColor:Colors.lightBackground},header:{backgroundColor:Colors.darkGreen,paddingTop:60,paddingBottom:20,paddingHorizontal:24,flexDirection:'row',alignItems:'center'},side:{width:40},headerTitle:{flex:1,textAlign:'center',fontSize:20,fontWeight:'bold',color:Colors.white},content:{padding:24,paddingBottom:40},hero:{backgroundColor:Colors.white,borderRadius:16,borderWidth:1,borderColor:Colors.cardBorder,padding:24,alignItems:'center',marginBottom:28},title:{fontSize:26,fontWeight:'bold',color:Colors.textPrimary,marginTop:12,marginBottom:8},body:{fontSize:15,color:Colors.textSecondary,lineHeight:22,textAlign:'center'},sectionTitle:{fontSize:19,fontWeight:'bold',color:Colors.textPrimary,marginBottom:12},card:{backgroundColor:Colors.white,borderRadius:12,borderWidth:1,borderColor:Colors.cardBorder,padding:16,flexDirection:'row',gap:12,marginBottom:10},cardText:{flex:1},cardTitle:{fontSize:16,fontWeight:'600',color:Colors.textPrimary,marginBottom:4},cardBody:{fontSize:13,color:Colors.textSecondary,lineHeight:19},note:{marginTop:14,padding:16,borderRadius:12,backgroundColor:Colors.white,borderWidth:1,borderColor:Colors.cardBorder,flexDirection:'row',gap:10},noteText:{flex:1,fontSize:13,color:Colors.textSecondary,lineHeight:19}});
