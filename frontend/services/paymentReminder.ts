import axios from 'axios';
import { Alert, Linking } from 'react-native';

// External sharing is offered only after the authoritative in-app alert exists.
export async function addPaymentReminder(apiUrl: string | undefined, token: string,
                                         contributionId: string) {
  try {
    const { data } = await axios.post(`${apiUrl}/api/treasurer/send-reminder`, {
      contribution_id: contributionId,
    }, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
    Alert.alert('Reminder added to member Alerts', 'The member can view the reminder in Clubvel.', [
      { text: 'Done', style: 'cancel' },
      ...(data.phone_number && data.reminder_message ? [{
        text: 'Open WhatsApp',
        onPress: async () => {
          try {
            const digits = data.phone_number.replace(/^\+/, '');
            await Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(data.reminder_message)}`);
            Alert.alert('WhatsApp opened', 'Press Send in WhatsApp to share the reminder. The in-app alert remains saved.');
          } catch {
            Alert.alert('WhatsApp could not be opened', 'The reminder is still saved in member Alerts.');
          }
        },
      }] : []),
    ]);
  } catch (error: any) {
    Alert.alert('Could not add reminder', error.response?.data?.detail || 'Please try again.');
  }
}
