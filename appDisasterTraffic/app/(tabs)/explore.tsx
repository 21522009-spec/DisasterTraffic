import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert as RNAlert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { fetchAlerts, submitCommunityReport } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { Alert, AlertType, CommunityReportPayload } from '@/lib/types';

/**
 * Alerts list screen — Explore tab.
 * - Hiển thị danh sách cảnh báo theo thời gian.
 * - Pull-to-refresh.
 * - Realtime: tự động prepend khi có 'new-alert'.
 * - Nút "+ Báo cáo" mở modal gửi báo cáo cộng đồng.
 */

const TYPE_LABEL: Record<AlertType, { label: string; emoji: string; color: string }> = {
    fire: { label: 'Cháy', emoji: '🔥', color: '#dc2626' },
    flood: { label: 'Ngập', emoji: '🌊', color: '#2563eb' },
    traffic: { label: 'Kẹt xe', emoji: '🚗', color: '#ca8a04' },
    earthquake: { label: 'Động đất', emoji: '🌍', color: '#ea580c' },
    landslide: { label: 'Sạt lở', emoji: '⛰️', color: '#92400e' },
    storm: { label: 'Bão', emoji: '🌪️', color: '#4f46e5' },
    other: { label: 'Khác', emoji: '⚠️', color: '#6b7280' },
};

function formatTime(iso?: string) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('vi-VN');
    } catch {
        return '';
    }
}

function dedupePrepend(prev: Alert[], next: Alert): Alert[] {
    if (next._id && prev.some((a) => a._id === next._id)) return prev;
    return [next, ...prev].slice(0, 500);
}

export default function ExploreScreen() {
    const [items, setItems] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);

    const load = async () => {
        try {
            const data = await fetchAlerts({ limit: 100 });
            setItems(data);
        } catch (e) {
            console.warn('[Explore] fetch error:', e);
        }
    };

    useEffect(() => {
        (async () => {
            await load();
            setLoading(false);
        })();

        const socket = getSocket();
        const onNewAlert = (alert: Alert) => {
            setItems((prev) => dedupePrepend(prev, alert));
        };
        socket.on('new-alert', onNewAlert);

        return () => {
            socket.off('new-alert', onNewAlert);
        };
    }, []);

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Cảnh báo gần đây</Text>
                <Pressable
                    onPress={() => setModalVisible(true)}
                    style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.8 }]}
                >
                    <Text style={styles.btnPrimaryText}>+ Báo cáo</Text>
                </Pressable>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#1d4ed8" />
                </View>
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(item, idx) => item._id ?? `${idx}-${item.lat}-${item.lng}`}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                    }
                    contentContainerStyle={items.length === 0 && styles.emptyContainer}
                    ListEmptyComponent={
                        <Text style={styles.emptyText}>Chưa có cảnh báo nào.</Text>
                    }
                    renderItem={({ item }) => {
                        const meta = TYPE_LABEL[item.type] ?? TYPE_LABEL.other;
                        return (
                            <View style={[styles.card, { borderLeftColor: meta.color }]}>
                                <View style={styles.cardHeader}>
                                    <Text style={[styles.cardTitle, { color: meta.color }]}>
                                        {meta.emoji} {meta.label}
                                    </Text>
                                    {item.source && (
                                        <Text style={styles.badge}>{item.source}</Text>
                                    )}
                                    {item.severity != null && (
                                        <Text style={styles.badge}>sev {item.severity}/5</Text>
                                    )}
                                </View>
                                <Text style={styles.cardAddress}>{item.address}</Text>
                                {!!item.description && (
                                    <Text style={styles.cardDesc}>{item.description}</Text>
                                )}
                                <Text style={styles.cardTime}>{formatTime(item.createdAt)}</Text>
                            </View>
                        );
                    }}
                />
            )}

            <ReportModal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                onSubmitted={(alert) => {
                    setItems((prev) => dedupePrepend(prev, alert));
                    setModalVisible(false);
                }}
            />
        </View>
    );
}

// ============================================================
// Report modal
// ============================================================

function ReportModal({
    visible,
    onClose,
    onSubmitted,
}: {
    visible: boolean;
    onClose: () => void;
    onSubmitted: (alert: Alert) => void;
}) {
    const [type, setType] = useState<AlertType>('traffic');
    const [lat, setLat] = useState('');
    const [lng, setLng] = useState('');
    const [address, setAddress] = useState('');
    const [description, setDescription] = useState('');
    const [severity, setSeverity] = useState('3');
    const [submitting, setSubmitting] = useState(false);

    const reset = () => {
        setType('traffic');
        setLat('');
        setLng('');
        setAddress('');
        setDescription('');
        setSeverity('3');
    };

    const onSubmit = async () => {
        const latN = Number(lat);
        const lngN = Number(lng);
        const sevN = Number(severity);
        if (!Number.isFinite(latN) || latN < -90 || latN > 90) {
            RNAlert.alert('Lỗi', 'Vĩ độ chưa hợp lệ.');
            return;
        }
        if (!Number.isFinite(lngN) || lngN < -180 || lngN > 180) {
            RNAlert.alert('Lỗi', 'Kinh độ chưa hợp lệ.');
            return;
        }

        const payload: CommunityReportPayload = {
            type,
            lat: latN,
            lng: lngN,
            address: address.trim() || undefined,
            description: description.trim() || undefined,
            severity: Number.isFinite(sevN) ? sevN : 3,
        };

        setSubmitting(true);
        try {
            const created = await submitCommunityReport(payload);
            reset();
            onSubmitted(created);
        } catch (e: any) {
            const msg = e?.response?.data?.error ?? e?.message ?? 'Lỗi không xác định';
            RNAlert.alert('Gửi thất bại', String(msg));
        } finally {
            setSubmitting(false);
        }
    };

    const types: AlertType[] = ['traffic', 'flood', 'fire', 'landslide', 'storm', 'other'];

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.modalBackdrop}
            >
                <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>Báo cáo cộng đồng</Text>

                    <Text style={styles.label}>Loại</Text>
                    <View style={styles.typeRow}>
                        {types.map((t) => {
                            const meta = TYPE_LABEL[t];
                            const active = t === type;
                            return (
                                <Pressable
                                    key={t}
                                    onPress={() => setType(t)}
                                    style={[
                                        styles.typeChip,
                                        active && { backgroundColor: meta.color, borderColor: meta.color },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.typeChipText,
                                            active && { color: '#fff' },
                                        ]}
                                    >
                                        {meta.emoji} {meta.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <View style={styles.row}>
                        <View style={styles.col}>
                            <Text style={styles.label}>Vĩ độ</Text>
                            <TextInput
                                value={lat}
                                onChangeText={setLat}
                                placeholder="10.762"
                                keyboardType="numeric"
                                style={styles.input}
                            />
                        </View>
                        <View style={styles.col}>
                            <Text style={styles.label}>Kinh độ</Text>
                            <TextInput
                                value={lng}
                                onChangeText={setLng}
                                placeholder="106.660"
                                keyboardType="numeric"
                                style={styles.input}
                            />
                        </View>
                    </View>

                    <Text style={styles.label}>Địa chỉ (tuỳ chọn)</Text>
                    <TextInput
                        value={address}
                        onChangeText={setAddress}
                        placeholder="VD: Đường Lê Văn Sỹ, Q.3"
                        style={styles.input}
                    />

                    <Text style={styles.label}>Mô tả</Text>
                    <TextInput
                        value={description}
                        onChangeText={setDescription}
                        placeholder="Mô tả ngắn"
                        style={[styles.input, styles.textarea]}
                        multiline
                        numberOfLines={3}
                    />

                    <Text style={styles.label}>Mức độ (1-5)</Text>
                    <TextInput
                        value={severity}
                        onChangeText={setSeverity}
                        keyboardType="numeric"
                        maxLength={1}
                        style={styles.input}
                    />

                    <View style={styles.modalActions}>
                        <Pressable onPress={onClose} style={[styles.btn, styles.btnGhost]}>
                            <Text style={styles.btnGhostText}>Huỷ</Text>
                        </Pressable>
                        <Pressable
                            onPress={onSubmit}
                            disabled={submitting}
                            style={[styles.btn, styles.btnPrimary, submitting && { opacity: 0.6 }]}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.btnPrimaryText}>Gửi</Text>
                            )}
                        </Pressable>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

// ============================================================
// styles
// ============================================================

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    header: {
        paddingTop: 50,
        paddingBottom: 12,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#1f2937' },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { color: '#6b7280', fontSize: 14 },

    card: {
        backgroundColor: '#fff',
        marginHorizontal: 12,
        marginVertical: 6,
        padding: 12,
        borderRadius: 10,
        borderLeftWidth: 4,
        elevation: 1,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
    },
    cardTitle: { fontSize: 15, fontWeight: '700' },
    badge: {
        fontSize: 11,
        color: '#374151',
        backgroundColor: '#f3f4f6',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
        overflow: 'hidden',
    },
    cardAddress: { marginTop: 4, fontSize: 14, color: '#1f2937' },
    cardDesc: { marginTop: 2, fontSize: 13, color: '#4b5563' },
    cardTime: { marginTop: 4, fontSize: 11, color: '#9ca3af' },

    btn: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 80,
    },
    btnPrimary: { backgroundColor: '#1d4ed8' },
    btnPrimaryText: { color: '#fff', fontWeight: '600' },
    btnGhost: { backgroundColor: '#f3f4f6' },
    btnGhostText: { color: '#374151', fontWeight: '600' },

    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    modalCard: {
        backgroundColor: '#fff',
        padding: 16,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: '90%',
    },
    modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
    label: { fontSize: 12, color: '#6b7280', marginTop: 8, marginBottom: 4 },
    input: {
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 14,
        color: '#1f2937',
        backgroundColor: '#fff',
    },
    textarea: { minHeight: 70, textAlignVertical: 'top' },
    row: { flexDirection: 'row', gap: 10 },
    col: { flex: 1 },

    typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    typeChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#d1d5db',
        backgroundColor: '#fff',
    },
    typeChipText: { fontSize: 12, color: '#374151' },

    modalActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
        marginTop: 16,
    },
});
