import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.DEV
  ? 'http://localhost:3000'
  : undefined;

export interface DeviceEvent {
  device: string;
  type: string;
  data: unknown;
  timestamp: number;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<DeviceEvent | null>(null);
  const listenersRef = useRef<Map<string, Set<(data: unknown) => void>>>(
    new Map(),
  );

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('deviceEvent', (event: DeviceEvent) => {
      setLastEvent(event);
      const handlers = listenersRef.current.get(event.type);
      if (handlers) {
        handlers.forEach((fn) => fn(event.data));
      }
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  function subscribe(type: string, handler: (data: unknown) => void) {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(handler);
    return () => {
      listenersRef.current.get(type)?.delete(handler);
    };
  }

  return { socket: socketRef, connected, lastEvent, subscribe };
}
