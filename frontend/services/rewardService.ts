import axios from 'axios';

export type RewardKind = 'airtime' | 'data';

export interface RewardIntent {
  intentId: string;
  customData: string;
  adUnitId: string;
  rewardKind: RewardKind;
}

export async function createRewardIntent(
  token: string,
  rewardKind: RewardKind,
): Promise<RewardIntent> {
  const base = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!base) throw new Error('Clubvel server configuration is missing.');
  if (!token) throw new Error('Please sign in to request a reward.');

  const response = await axios.post(
    `${base.replace(/\/$/, '')}/api/rewards/admob/intent`,
    { reward_kind: rewardKind },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 },
  );

  const data = response.data;
  const customData = data?.custom_data;
  const adUnitId = data?.ad_unit_id;

  if (typeof customData !== 'string' || !customData ||
      typeof adUnitId !== 'string' || !/^ca-app-pub-\d+\/\d+$/.test(adUnitId)) {
    throw new Error('The server returned an invalid reward intent.');
  }

  return { intentId: customData, customData, adUnitId, rewardKind };
}
