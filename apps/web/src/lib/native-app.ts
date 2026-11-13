import { useEffect, useState } from 'react';

/**
 * What the Android app (apps/android) and the iPhone app (apps/ios) expose to the web app as
 * `window.DoStotinkaApp`.
 */
interface NativeBridge {
  getInfo(): string;
  connect(token: string, sourceId: string, name: string): boolean;
  disconnect(): void;
  setWatched(json: string): void;
  openNotificationAccess(): void;
  openAppInfo(): void;
  changeServer(): void;
  /** iPhone: opens the Shortcuts app. */
  openShortcuts?(): void;
}

export interface NativeInfo {
  /** Missing in Android app versions before 0.9. */
  platform?: 'android' | 'ios';
  appVersion: string;
  device: string;
  server: string | null;
  connected: boolean;
  sourceId: string | null;
  sourceName: string | null;
  notificationAccess: boolean;
  watched: string[];
  recent: { app: string; label: string; lastSeen: number }[];
  lastSentAt: number;
  sentCount: number;
  lastError: string | null;
  /** iPhone: payments waiting to be sent. */
  pending?: number;
}

/** The bridge when DoStotinka runs inside the Android or iPhone app, otherwise undefined. */
export const nativeApp: NativeBridge | undefined =
  typeof window !== 'undefined'
    ? (window as unknown as { DoStotinkaApp?: NativeBridge }).DoStotinkaApp
    : undefined;

function read(): NativeInfo | null {
  if (!nativeApp) return null;
  try {
    const info = JSON.parse(nativeApp.getInfo()) as Partial<NativeInfo>;
    return info.appVersion ? (info as NativeInfo) : null;
  } catch {
    return null;
  }
}

/** Live state of the app (notification access can change in Android's settings at any time). */
export function useNativeInfo(): [NativeInfo | null, () => void] {
  const [info, setInfo] = useState<NativeInfo | null>(read);
  useEffect(() => {
    if (!nativeApp) return;
    const refresh = () => setInfo(read());
    const timer = setInterval(refresh, 3000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return [info, () => setInfo(read())];
}
