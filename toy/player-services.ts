import type { ServiceSession } from './leaderboard-contract';

export const cloudKey = 'sofaraway_toy_v1';

export interface CloudPlatform extends ServiceSession {
  identity(signal: AbortSignal): Promise<string>;
  readCloud(signal: AbortSignal): Promise<string | null>;
  writeCloud(value: string, signal: AbortSignal): Promise<void>;
}

export const shareActions = ['sharePicture', 'saveImageToAlbum', 'share'] as const;
export type ShareAction = typeof shareActions[number];

export interface SharePlatform extends ServiceSession {
  resultNickname(signal: AbortSignal): Promise<string | null>;
  supportsShare(action: ShareAction, signal: AbortSignal): Promise<boolean>;
  shareResult(action: ShareAction, base64Data: string, signal: AbortSignal): Promise<void>;
}
