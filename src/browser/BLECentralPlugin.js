function notSupported() {
    console.log('BLE is not supported on the browser');
}

function formatUUID(uuid) {
    if (uuid.startsWith('0x')) {
        return parseInt(uuid);
    }
    if (/^[0-9a-fA-F]+$/.test(uuid)) {
        return parseInt(uuid, 16);
    }
    return uuid;
}

module.exports = {
    deviceInfos: new Map(),
    
    scan: function(services, seconds, success, failure) {
        return this.startScanWithOptions(services, {}, success, failure);
    },
    startScan: function(services, success, failure) {
        return this.startScanWithOptions(services, {}, success, failure);
    },
    startScanWithOptions: function(services, options, success, failure) {
        if (!navigator.bluetooth) {
            failure('Bluetooth is not supported on this browser.');
            return;
        }

        let requestDeviceOptions = {};

        if (services && services.length) {
            requestDeviceOptions.filters = services.map(s => ({
                services: [formatUUID(s)]
            }));
            if (options.optionalServices) {
                requestDeviceOptions.optionalServices = options.optionalServices.map(formatUUID);
            }
        } else {
            requestDeviceOptions.acceptAllDevices = true;
        }

        navigator.bluetooth.requestDevice(requestDeviceOptions).then(device => {
            var deviceInfo = this.deviceInfos.get(device.id) || {};
            deviceInfo.device = device;
            this.deviceInfos.set(device.id, deviceInfo);
            success({ id: device.id, name: device.name });
        }).catch(failure);
    },
    stopScan: function(success, failure) {
        if (success) success();
    },
    connect: function(deviceId, success, failure) {
        const getDeviceInfo = (server) => {
            const results = {
                id: server.device.id,
                name: server.device.name,
                services: [],
                characteristics: [],
            };
            return server
                .getPrimaryServices()
                .then((services) => {
                    results.services = services.map((service) => service.uuid);
                    return Promise.all(services.map((service) => service.getCharacteristics()));
                })
                .then((allServiceCharacteristics) => {
                    for (let i = 0; i < allServiceCharacteristics.length; i++) {
                        const service = results.services[i];
                        const serviceCharacteristics = allServiceCharacteristics[i];
                        for (const serviceCharacteristic of serviceCharacteristics) {
                            const properties = [];
                            if (serviceCharacteristic.properties) {
                                if (serviceCharacteristic.properties.read) {
                                    properties.push('Read');
                                }
                                if (serviceCharacteristic.properties.write) {
                                    properties.push('Write');
                                }
                                if (serviceCharacteristic.properties.notify) {
                                    properties.push('Notify');
                                }
                            }
                            results.characteristics.push({
                                service,
                                characteristic: serviceCharacteristic.uuid,
                                properties
                            });
                        }
                    }
                    success(results);
                });
        };

        const connectGatt = (gatt) => {
            return gatt.connect().then(server => {
                this.deviceInfos.set(deviceId, {
                    device: deviceInfo,
                    server: server
                })
                return getDeviceInfo(server);
            }).catch(err => {
                if (failure) failure(err);
            });
        };

        const deviceInfo = this.deviceInfos.get(deviceId);
        if (!deviceInfo) {
            return navigator.bluetooth.getDevices().then(devices => {
                for (const device of devices) {
                    if (device.id === deviceId) {
                        return connectGatt(device.gatt);
                    }
                }
                if (failure) failure(new Error('device not found'));
            });
        }
        if (deviceInfo.server && deviceInfo.server.connected) {
            return getDeviceInfo(deviceInfo.server);
        } else {
            return connectGatt(deviceInfo.device.gatt);
        }
    },
    disconnect: function(deviceId, success, failure) {
        var deviceInfo = this.deviceInfos.get(deviceId)
        if (deviceInfo) {
            var device = deviceInfo.server && deviceInfo.server.device;
            if (device && device.gatt.connected) {
                device.gatt.disconnect();
                success(device);
            } else {
                success();
            }
        } else if (failure) {
            failure(new Error("Peripheral not found"));
        }
    },
    read: function(deviceId, service_uuid, characteristic_uuid, success, failure) {
       if (this.deviceInfos.has(deviceId)) {
            this.deviceInfos.get(deviceId).server.getPrimaryService(formatUUID(service_uuid)).then(service => {
                return service.getCharacteristic(formatUUID(characteristic_uuid));
            }).then(characteristic => {
                return characteristic.readValue();
            }).then(result => {
                success(result);
            }).catch(error => {
                if (failure) failure(error);
            });
        } else if (failure) { 
          failure();
        }
    },
    readRSSI: function(deviceId, success, failure) {
        notSupported();
        if (failure) failure(new Error("not supported"));
    },
    write: function(deviceId, service_uuid, characteristic_uuid, data, success, failure) {
        if (this.deviceInfos.has(deviceId)) {
            this.deviceInfos.get(deviceId).server.getPrimaryService(formatUUID(service_uuid)).then(service => {
                return service.getCharacteristic(formatUUID(characteristic_uuid));
            }).then(characteristic => {
                return characteristic.writeValueWithResponse(data);
            }).then(result => {
                success(result);
            }).catch(error => {
                if (failure) failure(error);
            });
        } else if (failure) { 
          failure(new Error("device not connected"));
        }
    },
    writeWithoutResponse: function(deviceId, service_uuid, characteristic_uuid, data, success, failure) {
        if (this.deviceInfos.has(deviceId)) {
            this.deviceInfos.get(deviceId).server.getPrimaryService(formatUUID(service_uuid)).then(service => {
                return service.getCharacteristic(formatUUID(characteristic_uuid));
            }).then(characteristic => {
                return characteristic.writeWithoutResponse(data);
            }).then(result => {
                success(result);
            }).catch(error => {
                if (failure) failure(error);
            });
        } else if (failure) { 
            failure(new Error("device not connected"));
        }
    },
    startNotification: function(deviceId, service_uuid, characteristic_uuid, success, failure) {
         if (this.deviceInfos.has(deviceId)) {
            this.deviceInfos.get(deviceId).server.getPrimaryService(formatUUID(service_uuid)).then(service => {
                return service.getCharacteristic(formatUUID(characteristic_uuid));
            }).then(characteristic => {
                return characteristic.startNotifications().then(result => {
                    characteristic.addEventListener('characteristicvaluechanged', function (event) {
                        success(event.target.value.buffer);
                    });
                });
            }).catch(error => {
                if (failure) failure(error);
            })
        } else if (failure) { 
            failure(new Error("device not connected"));
        }
    },
    stopNotifcation: function(deviceId, service_uuid, characteristic_uuid, success, failure) {
       if (this.deviceInfos.has(deviceId)) {
            this.deviceInfos.get(deviceId).server.getPrimaryService(formatUUID(service_uuid)).then(service => {
                return service.getCharacteristic(formatUUID(characteristic_uuid));
            }).then(characteristic => {
                return characteristic.stopNotifications();
            }).then(result => {
                success(result);
            }).catch(error => {
                if (failure) failure(error);
            });
        } else if (failure) { 
            failure(new Error("device not connected"));
        }
    },
    isEnabled: function(success, failure) {
        notSupported();
        if (failure) failure(new Error("not supported"));
    },
    isConnected: function(deviceId, success, failure) {
        if (this.deviceInfos.has(deviceId)) {
            const server = this.deviceInfos.get(deviceId).server;
            if (server && server.device.gatt.connected) {
                success();
            } else {
                if (failure) failure();
            }
        } else if (failure) {
            failure();
        }
    },
    showBluetoothSettings: function(success, failure) {
        notSupported();
        if (failure) failure(new Error("not supported"));
    },
    enable: function(success, failure) {
        notSupported();
        if (failure) failure(new Error("not supported"));
    },
    startStateNotifications: function(success, failure) {
        notSupported();
        if (failure) failure(new Error("not supported"));
    },
    stopStateNotifications: function(success, failure) {
        notSupported();
        if (failure) failure(new Error("not supported"));
    }
};
