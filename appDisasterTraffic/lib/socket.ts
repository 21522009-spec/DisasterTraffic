import { io, Socket } from 'socket.io-client';
import { SERVER_URL } from './config';

/**
 * Singleton Socket.IO client.
 * Mọi screen có thể gọi getSocket() — tránh tạo nhiều connection trùng.
 *
 * Dùng:
 *   import { getSocket } from '@/lib/socket';
 *   useEffect(() => {
 *     const s = getSocket();
 *     s.on('new-alert', ...);
 *     return () => s.off('new-alert');
 *   }, []);
 */

let socket: Socket | null = null;

export function getSocket(): Socket {
    if (!socket) {
        socket = io(SERVER_URL, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 30000,  // tối đa 30s giữa các lần retry
        });
    }
    return socket;
}

/** Đóng kết nối — dùng khi user logout hoặc app unmount toàn bộ. */
export function closeSocket(): void {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}
