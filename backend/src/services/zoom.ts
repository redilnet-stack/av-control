import jwt from 'jsonwebtoken';

// ── Types ───────────────────────────────────────────────────────────

export interface ZoomCredentials {
  s2sClientId: string;
  s2sClientSecret: string;
  accountId: string;
  sdkKey: string;
  sdkSecret: string;
}

export interface ZoomMeeting {
  id: number;
  topic: string;
  startUrl: string;
  joinUrl: string;
  password: string;
  startTime: string;
  duration: number;
  status: string;
}

export interface ZoomParticipant {
  id: string;
  name: string;
  audioMuted: boolean;
  videoMuted: boolean;
}

// ── Zoom API Service ────────────────────────────────────────────────

const ZOOM_BASE = 'https://api.zoom.us/v2';
const ZOOM_AUTH = 'https://zoom.us/oauth/token';

export class ZoomService {
  private creds: ZoomCredentials;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(creds: ZoomCredentials) {
    this.creds = creds;
  }

  updateCredentials(creds: ZoomCredentials): void {
    this.creds = creds;
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }

  // ── OAuth token management ──────────────────────────────────────

  private async ensureToken(): Promise<string> {
    // Return cached token if still valid (with 5-minute buffer)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 300_000) {
      return this.accessToken;
    }

    const basicAuth = Buffer.from(
      `${this.creds.s2sClientId}:${this.creds.s2sClientSecret}`,
    ).toString('base64');

    const params = new URLSearchParams({
      grant_type: 'account_credentials',
      account_id: this.creds.accountId,
    });

    const res = await fetch(ZOOM_AUTH, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Zoom OAuth failed (${res.status}): ${errBody}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return this.accessToken!;
  }

  private async apiFetch(
    path: string,
    options: { method?: string; body?: unknown; params?: URLSearchParams } = {},
  ): Promise<unknown> {
    const token = await this.ensureToken();
    const { method = 'GET', body, params } = options;

    let url = `${ZOOM_BASE}${path}`;
    if (params) url += `?${params.toString()}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Zoom API error (${res.status}): ${errBody}`);
    }

    // 204 No Content (e.g., DELETE success)
    if (res.status === 204) return null;

    return res.json() as unknown;
  }

  // ── Meeting management ──────────────────────────────────────────

  async createMeeting(topic: string, settings?: {
    duration?: number;
    password?: string;
    muteUponEntry?: boolean;
  }): Promise<ZoomMeeting> {
    const body: Record<string, unknown> = {
      topic,
      type: 2, // Scheduled meeting
      start_time: new Date().toISOString(),
      duration: settings?.duration ?? 60,
      settings: {
        host_video: true,
        participant_video: true,
        mute_upon_entry: settings?.muteUponEntry ?? false,
        join_before_host: true,
        waiting_room: false,
      },
    };

    if (settings?.password) {
      (body.settings as Record<string, unknown>).password = settings.password;
    }

    const data = (await this.apiFetch('/users/me/meetings', {
      method: 'POST',
      body,
    })) as Record<string, unknown>;

    return {
      id: data.id as number,
      topic: data.topic as string,
      startUrl: data.start_url as string,
      joinUrl: data.join_url as string,
      password: (data.password as string) ?? '',
      startTime: data.start_time as string,
      duration: data.duration as number,
      status: data.status as string,
    };
  }

  async getMeeting(meetingId: number): Promise<ZoomMeeting> {
    const data = (await this.apiFetch(`/meetings/${meetingId}`)) as Record<string, unknown>;
    return {
      id: data.id as number,
      topic: data.topic as string,
      startUrl: data.start_url as string,
      joinUrl: data.join_url as string,
      password: (data.password as string) ?? '',
      startTime: data.start_time as string,
      duration: data.duration as number,
      status: data.status as string,
    };
  }

  async endMeeting(meetingId: number): Promise<void> {
    await this.apiFetch(`/meetings/${meetingId}/status`, {
      method: 'PUT',
      body: { action: 'end' },
    });
  }

  async deleteMeeting(meetingId: number): Promise<void> {
    await this.apiFetch(`/meetings/${meetingId}`, { method: 'DELETE' });
  }

  // ── Participant controls ────────────────────────────────────────

  async muteAll(meetingId: number, allowUnmuteSelf = false): Promise<void> {
    await this.apiFetch(`/meetings/${meetingId}/participants/state`, {
      method: 'PUT',
      body: { action: 'mute', allow_unmute_self: allowUnmuteSelf },
    });
  }

  async unmuteAll(meetingId: number): Promise<void> {
    await this.apiFetch(`/meetings/${meetingId}/participants/state`, {
      method: 'PUT',
      body: { action: 'unmute' },
    });
  }

  async muteParticipant(meetingId: number, participantId: string): Promise<void> {
    await this.apiFetch(`/meetings/${meetingId}/participants/${participantId}`, {
      method: 'PATCH',
      body: { mute: true },
    });
  }

  async unmuteParticipant(meetingId: number, participantId: string): Promise<void> {
    await this.apiFetch(`/meetings/${meetingId}/participants/${participantId}`, {
      method: 'PATCH',
      body: { mute: false },
    });
  }

  async listParticipants(meetingId: number): Promise<ZoomParticipant[]> {
    const data = (await this.apiFetch(`/meetings/${meetingId}/participants`, {
      params: new URLSearchParams({ page_size: '300' }),
    })) as { participants: Array<Record<string, unknown>> };

    return (data.participants ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      audioMuted: (p.audio_muted as boolean) ?? false,
      videoMuted: (p.video_muted as boolean) ?? false,
    }));
  }

  // ── Meeting SDK signature ────────────────────────────────────────

  generateSignature(meetingNumber: number, role: 0 | 1 = 1): string {
    const iat = Math.round(Date.now() / 1000) - 30;
    const exp = iat + 60 * 60 * 2; // 2 hours

    const payload = {
      appKey: this.creds.sdkKey,
      sdkKey: this.creds.sdkKey,
      mn: meetingNumber,
      role,
      iat,
      exp,
      tokenExp: exp,
    };

    return jwt.sign(payload, this.creds.sdkSecret);
  }
}
