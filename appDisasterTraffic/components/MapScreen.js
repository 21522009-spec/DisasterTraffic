import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Alert } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import io from 'socket.io-client';
import axios from 'axios';
import { SERVER_URL } from '../lib/config';

const BACKEND_URL = SERVER_URL;

const MapScreen = () => {
    const [disasters, setDisasters] = useState([]);

    // Vùng mặc định tại TP.HCM
    const initialRegion = {
        latitude: 10.7769,
        longitude: 106.7009,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
    };

    useEffect(() => {
        // 1. Lấy dữ liệu từ Backend (Initial Load)
        const fetchInitialDisasters = async () => {
            try {
                const response = await axios.get(`${BACKEND_URL}/api/disasters`);
                setDisasters(response.data);
            } catch (error) {
                console.error('Lỗi khi tải dữ liệu thiên tai:', error);
                Alert.alert('Lỗi', 'Không thể kết nối đến máy chủ để lấy dữ liệu thiên tai.');
            }
        };

        fetchInitialDisasters();

        // 2. Lắng nghe Socket.io cho các sự kiện mới phát sinh
        const socket = io(BACKEND_URL);

        socket.on('connect', () => {
            console.log('Đã kết nối Socket.io tới Backend');
        });

        socket.on('new_disaster_alert', (newAlert) => {
            console.log('Có cảnh báo thiên tai mới:', newAlert);

            // Thêm sự kiện mới vào danh sách hiện tại
            setDisasters((prevDisasters) => {
                // Kiểm tra tránh trùng lặp nếu cần (dựa vào id)
                const exists = prevDisasters.some(d => d._id === newAlert._id);
                if (exists) return prevDisasters;
                return [newAlert, ...prevDisasters];
            });

            Alert.alert(
                'Cảnh báo Mới!',
                `Phát hiện ${newAlert.type} tại ${newAlert.address}`
            );
        });

        socket.on('disconnect', () => {
            console.log('Đã ngắt kết nối Socket.io');
        });

        // Cleanup khi unmount
        return () => {
            socket.disconnect();
        };
    }, []);

    // Hàm helper để chọn màu marker theo loại thiên tai
    const getPinColor = (type) => {
        switch (type) {
            case 'fire':
                return 'red';
            case 'flood':
                return 'blue';
            case 'traffic':
                return 'orange';
            default:
                return 'purple';
        }
    };

    // Hàm helper để dịch loại thiên tai
    const translateType = (type) => {
        switch (type) {
            case 'fire': return 'Cháy';
            case 'flood': return 'Ngập lụt';
            case 'traffic': return 'Kẹt xe';
            default: return type;
        }
    }

    return (
        <View style={styles.container}>
            <MapView
                style={styles.map}
                initialRegion={initialRegion}
            >
                {disasters.map((item, index) => {
                    // Xử lý tọa độ, một số API trả về lng, lat, một số trả về longitude, latitude
                    const latitude = item.lat || item.latitude;
                    const longitude = item.lng || item.longitude;

                    if (!latitude || !longitude) return null;

                    return (
                        <Marker
                            key={item._id || index.toString()}
                            coordinate={{ latitude, longitude }}
                            pinColor={getPinColor(item.type)}
                        >
                            <Callout>
                                <View style={styles.calloutContainer}>
                                    <Text style={styles.calloutTitle}>{translateType(item.type)}</Text>
                                    <Text style={styles.calloutText}>{item.address}</Text>
                                    <Text style={styles.calloutTime}>
                                        {new Date(item.createdAt || Date.now()).toLocaleTimeString()}
                                    </Text>
                                </View>
                            </Callout>
                        </Marker>
                    );
                })}
            </MapView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    map: {
        width: '100%',
        height: '100%',
    },
    calloutContainer: {
        width: 150,
        padding: 5,
    },
    calloutTitle: {
        fontWeight: 'bold',
        fontSize: 16,
        marginBottom: 2,
    },
    calloutText: {
        fontSize: 14,
        marginBottom: 2,
    },
    calloutTime: {
        fontSize: 12,
        color: 'gray',
    },
});

export default MapScreen;
