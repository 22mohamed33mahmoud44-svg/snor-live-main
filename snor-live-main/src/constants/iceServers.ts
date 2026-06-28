// Centralized WebRTC ICE configuration (STUN + TURN).
// TURN credentials must be fetched from backend — never hardcoded here.

export const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export const RTC_CONFIG_STUN_ONLY: RTCConfiguration = {
  iceServers: STUN_SERVERS,
};