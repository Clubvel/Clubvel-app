import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import axios from 'axios';

type Claim = { club_name: string; payout_date: string | null; amount: number | null; position: number | null };
export default function ClaimsScreen() {
  const { user } = useAuth(); const router = useRouter(); const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
  const [claims,setClaims]=useState<Claim[]>([]); const [loading,setLoading]=useState(true);
  useEffect(()=>{ if(!user?.id){setLoading(false);return;} axios.get(`${API_URL}/api/member/payout-schedule/${user.id}`).then(r=>setClaims(r.data.schedules||[])).catch(()=>setClaims([])).finally(()=>setLoading(false)); },[user?.id]);
  return <View style={styles.container}>
    <View style={styles.header}><Text style={styles.headerTitle}>Claims Schedule</Text><TouchableOpacity onPress={()=>router.push('/(member)/profile')}>{user?.profile_photo?<Image source={{uri:user.profile_photo}} style={styles.profileImage}/>:<View style={styles.profilePlaceholder}><Ionicons name="person" size={20} color={Colors.white}/></View>}</TouchableOpacity></View>
    <ScrollView contentContainerStyle={styles.content}>
      {loading?<ActivityIndicator color={Colors.mediumGreen}/>:claims.length===0?<View style={styles.empty}><Ionicons name="trophy-outline" size={64} color={Colors.gold}/><Text style={styles.emptyTitle}>No recorded claims yet</Text><Text style={styles.emptyText}>When your group has an actual claim or payout scheduled for you, it will appear here.</Text></View>:claims.map((claim,i)=><View key={`${claim.club_name}-${claim.payout_date}-${i}`} style={styles.card}><View style={styles.cardHead}><Ionicons name="trophy-outline" size={24} color={Colors.gold}/><Text style={styles.club}>{claim.club_name}</Text></View><Text style={styles.row}>Scheduled: {claim.payout_date || 'Date unavailable'}</Text><Text style={styles.row}>Amount: {claim.amount == null ? 'Amount unavailable' : `R${claim.amount.toLocaleString()}`}</Text>{claim.position!=null&&<Text style={styles.row}>Position: #{claim.position}</Text>}</View>)}
    </ScrollView>
  </View>;
}
const styles=StyleSheet.create({container:{flex:1,backgroundColor:Colors.lightBackground},header:{backgroundColor:Colors.mediumGreen,paddingTop:60,paddingBottom:20,paddingHorizontal:24,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},headerTitle:{fontSize:24,fontWeight:'bold',color:Colors.white},profileImage:{width:44,height:44,borderRadius:22,borderWidth:2,borderColor:Colors.gold},profilePlaceholder:{width:44,height:44,borderRadius:22,backgroundColor:Colors.gold,justifyContent:'center',alignItems:'center'},content:{flexGrow:1,padding:24},empty:{flex:1,alignItems:'center',justifyContent:'center',padding:24},emptyTitle:{fontSize:20,fontWeight:'bold',color:Colors.textPrimary,marginTop:16},emptyText:{fontSize:14,color:Colors.textSecondary,textAlign:'center',lineHeight:20,marginTop:8},card:{backgroundColor:Colors.white,padding:18,borderRadius:12,borderWidth:1,borderColor:Colors.cardBorder,marginBottom:12},cardHead:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:12},club:{fontSize:17,fontWeight:'bold',color:Colors.textPrimary},row:{fontSize:14,color:Colors.textSecondary,marginTop:5}});
