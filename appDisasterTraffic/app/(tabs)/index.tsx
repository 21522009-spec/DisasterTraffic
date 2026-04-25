import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { io } from 'socket.io-client'; 

const SERVER_URL = 'https://constance-unproclaimed-maryland.ngrok-free.dev';
interface AlertData {
    type: string;
    address: string;
    lng: number;
    lat: number;
}

export default function App() {
    const [alerts, setAlerts] = useState<AlertData[]>([]);

    useEffect(() => {
        // Lấy dữ liệu lịch sử từ MongoDB khi mở App
        fetch(`${SERVER_URL}/api/alerts`)
            .then(res => res.json())
            .then((data: AlertData[]) => {
                setAlerts(data);
            })
            .catch(err => console.log("Lỗi tải dữ liệu:", err));

        // Kết nối Socket.io để nhận cảnh báo Real-time
        const socket = io(SERVER_URL);

        socket.on('new-alert', (newAlert: AlertData) => {
            // Khi có cảnh báo mới, thêm vào danh sách hiện tại
            setAlerts((prevAlerts) => [newAlert, ...prevAlerts]);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    return (
        <View style={styles.container}>
            {/* Phần Header của App */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>HCM City Monitor</Text>
            </View>

            {/* Bản đồ React Native */}
            <MapView
                style={styles.map}
                initialRegion={{
                    latitude: 10.762622, // Tọa độ TP.HCM
                    longitude: 106.660172,
                    latitudeDelta: 0.1, // Độ zoom
                    longitudeDelta: 0.1,
                }}
                showsTraffic={true}
            >
                {/* Vẽ các điểm cảnh báo lên bản đồ */}
                {alerts.map((alert, index) => (
                    <Marker
                        key={index}
                        coordinate={{ latitude: alert.lat, longitude: alert.lng }}
                        title={alert.type === 'fire' ? '🔥 Cháy' : '🌊 Ngập lụt'}
                        description={alert.address}
                        pinColor={alert.type === 'fire' ? 'red' : 'blue'}
                    />
                ))}
            </MapView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        paddingTop: 50,
        paddingBottom: 15,
        backgroundColor: 'white',
        alignItems: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        zIndex: 10,
    },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1d4ed8' },
    map: { width: '100%', height: '100%' },
});