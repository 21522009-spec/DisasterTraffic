import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { fetchAlerts, fetchCameras } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { Alert, AlertType, Camera } from '@/lib/types';

/**
 * Map screen — Home tab.
 * - Load lịch sử cảnh báo + camera đã đăng ký qua REST.
 * - Lắng nghe Socket.IO 'new-alert' và 'camera:*' để cập nhật realtime.
 * - Hiển thị marker cảnh báo theo type, marker camera theo trạng thái.
 */

const TYPE_META: Record<AlertType, { label: string; color: string; emoji: string }> = {
    fire: { label: 'Cháy', color: '#dc2626', emoji: '🔥' },
    flood: { label: 'Ngập', color: '#2563eb', emoji: '🌊' },
    traffic: { label: 'Kẹt xe', color: '#ca8a04', emoji: '🚗' },
    earthquake: { label: 'Động đất', color: '#ea580c', emoji: '🌍' },
    landslide: { label: 'Sạt lở', color: '#92400e', emoji: '⛰️' },
    storm: { label: 'Bão', color: '#4f46e5', emoji: '🌪️' },
    other: { label: 'Khác', color: '#6b7280', emoji: '⚠️' },
};

const CAMERA_STATUS_COLOR: Record<string, string> = {
    active: '#7c3aed',
    paused: '#9ca3af',
    broken: '#ef4444',
    pending: '#f59e0b',
};

function metaFor(type: string) {
    return TYPE_META[(type as AlertType)] ?? TYPE_META.other;
}

function dedupe(prev: Alert[], next: Alert): Alert[] {
    if (next._id && prev.some((a) => a._id === next._id)) return prev;
    return [next, ...prev].slice(0, 500);
}

function upsertCamera(prev: Camera[], next: Camera): Camera[] {
    const idx = prev.findIndex((c) => c._id === next._id);
    if (idx === -1) return [...prev, next];
    const copy = [...prev];
    copy[idx] = next;
    return copy;
}

export default function MapScreen() {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [cameras, setCameras] = useState<Camera[]>([]);
    const [loading, setLoading] = useState(true);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        // 1. REST: load alerts + cameras song song
        (async () => {
            try {
                const [alertsData, camsData] = await Promise.all([
                    fetchAlerts({ limit: 200 }),
                    fetchCameras({ limit: 500 }),
                ]);
                if (!cancelled) {
                    setAlerts(alertsData);
                    setCameras(camsData);
                }
            } catch (e) {
                console.warn('[MapScreen] fetch error:', e);
                if (!cancelled) setError('Không tải được dữ liệu từ server.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        // 2. Socket: realtime
        const socket = getSocket();

        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);
        const onNewAlert = (alert: Alert) => {
            setAlerts((prev) => dedupe(prev, alert));
        };
        const onCameraCreated = (cam: Camera) => {
            setCameras((prev) => upsertCamera(prev, cam));
        };
        const onCameraUpdated = (cam: Camera) => {
            setCameras((prev) => upsertCamera(prev, cam));
        };
        const onCameraDeleted = (info: { _id: string }) => {
            setCameras((prev) => prev.filter((c) => c._id !== info._id));
        };

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('new-alert', onNewAlert);
        socket.on('camera:created', onCameraCreated);
        socket.on('camera:updated', onCameraUpdated);
        socket.on('camera:deleted', onCameraDeleted);

        if (socket.connected) setConnected(true);

        return () => {
            cancelled = true;
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('new-alert', onNewAlert);
            socket.off('camera:created', onCameraCreated);
            socket.off('camera:updated', onCameraUpdated);
            socket.off('camera:deleted', onCameraDeleted);
        };
    }, []);

    const counts = useMemo(() => {
        const c: Record<string, number> = {};
        for (const a of alerts) c[a.type] = (c[a.type] ?? 0) + 1;
        return c;
    }, [alerts]);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>HCM City Monitor</Text>
                <View style={styles.headerRow}>
                    <View
                        style={[
                            styles.statusDot,
                            { backgroundColor: connected ? '#10b981' : '#ef4444' },
                        ]}
                    />
                    <Text style={styles.statusText}>
                        {connected ? 'Đang kết nối realtime' : 'Mất kết nối'} · {alerts.length} cảnh báo · {cameras.length} camera
                    </Text>
                </View>
            </View>

            <MapView
                style={styles.map}
                initialRegion={{
                    latitude: 10.762622,
                    longitude: 106.660172,
                    latitudeDelta: 0.1,
                    longitudeDelta: 0.1,
                }}
                showsTraffic
                showsUserLocation
                showsMyLocationButton
            >
                {/* Camera markers */}
                {cameras.map((cam) => (
                    <Marker
                        key={`cam-${cam._id}`}
                        coordinate={{ latitude: cam.lat, longitude: cam.lng }}
                        title={`📷 ${cam.name}`}
                        description={`${cam.address || ''} · ${cam.status}`}
                        pinColor={CAMERA_STATUS_COLOR[cam.status] || CAMERA_STATUS_COLOR.active}
                        opacity={0.9}
                    />
                ))}

                {/* Alert markers (đè lên camera) */}
                {alerts.map((alert) => {
                    const meta = metaFor(alert.type);
                    const id = alert._id ?? `${alert.lat},${alert.lng},${alert.type}`;
                    return (
                        <Marker
                            key={`alert-${id}`}
                            coordinate={{ latitude: alert.lat, longitude: alert.lng }}
                            title={`${meta.emoji} ${meta.label}`}
                            description={alert.address}
                            pinColor={meta.color}
                        />
                    );
                })}
            </MapView>

            {loading && (
                <View style={styles.overlay}>
                    <ActivityIndicator size="large" color="#1d4ed8" />
                    <Text style={styles.overlayText}>Đang tải dữ liệu…</Text>
                </View>
            )}

            {error && !loading && (
                <View style={styles.errorBar}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            <View style={styles.legend}>
                {(['fire', 'flood', 'traffic', 'other'] as AlertType[]).map((t) => {
                    const meta = TYPE_META[t];
                    const n = counts[t] ?? 0;
                    return (
                        <View key={t} style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: meta.color }]} />
                            <Text style={styles.legendText}>
                                {meta.emoji} {meta.label} {n}
                            </Text>
                        </View>
                    );
                })}
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: CAMERA_STATUS_COLOR.active }]} />
                    <Text style={styles.legendText}>📷 Camera {cameras.length}</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: {
        paddingTop: 50,
        paddingBottom: 12,
        paddingHorizontal: 16,
        backgroundColor: 'white',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        zIndex: 10,
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#1d4ed8' },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        gap: 6,
    },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: 12, color: '#6b7280' },
    map: { flex: 1 },

    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    overlayText: { marginTop: 8, color: '#1f2937' },

    errorBar: {
        position: 'absolute',
        top: 110,
        left: 12,
        right: 12,
        padding: 10,
        borderRadius: 10,
        backgroundColor: '#fee2e2',
        borderColor: '#fca5a5',
        borderWidth: 1,
    },
    errorText: { color: '#991b1b', fontSize: 13 },

    legend: {
        position: 'absolute',
        bottom: 16,
        left: 12,
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: 10,
        padding: 8,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        maxWidth: 320,
        elevation: 3,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { fontSize: 11, color: '#374151' },
});
