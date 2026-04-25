import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import axios from 'axios';
import io from 'socket.io-client';

// Change this to your actual local IP address when running on a physical device or emulator.
// Example: 'http://192.168.1.100:3000'
const BACKEND_URL = 'http://localhost:3000';

const MapScreen = () => {
  const [events, setEvents] = useState([]);

  // Initial region centered around Ho Chi Minh City
  const initialRegion = {
    latitude: 10.7756,
    longitude: 106.7004,
    latitudeDelta: 0.2,
    longitudeDelta: 0.2,
  };

  useEffect(() => {
    // 1. Fetch initial data from API
    const fetchEvents = async () => {
      try {
        const response = await axios.get(`${BACKEND_URL}/api/disaster-events`);
        setEvents(response.data);
      } catch (error) {
        console.error('Error fetching disaster events:', error);
      }
    };

    fetchEvents();

    // 2. Set up Socket.io connection for real-time updates
    const socket = io(BACKEND_URL);

    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    socket.on('new-disaster-event', (newEvent) => {
      console.log('Received new disaster event via WebSocket:', newEvent);
      // Add the new event to the list
      setEvents((prevEvents) => [newEvent, ...prevEvents]);
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
    };
  }, []);

  // Helper function to pick pin color based on disaster type
  const getPinColor = (type) => {
    if (type === 'fire') return 'red';
    if (type === 'flood') return 'blue';
    return 'yellow'; // default
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={initialRegion}
      >
        {events.map((event) => (
          <Marker
            key={event._id || Math.random().toString()}
            coordinate={{
              latitude: event.latitude,
              longitude: event.longitude,
            }}
            pinColor={getPinColor(event.type)}
          >
            <Callout>
              <View style={styles.calloutContainer}>
                <Text style={styles.title}>{event.title}</Text>
                <Text style={styles.source}>Nguồn: {event.source}</Text>
                <Text style={styles.type}>
                  Loại: {event.type === 'fire' ? 'Hỏa hoạn' : 'Ngập lụt'}
                </Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  calloutContainer: {
    width: 200,
    padding: 10,
  },
  title: {
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 5,
  },
  source: {
    fontSize: 12,
    color: '#666',
  },
  type: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 5,
  },
});

export default MapScreen;
