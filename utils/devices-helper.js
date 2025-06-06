/**
 * Utility functions for device management
 */

/**
 * Ensures consistency between activeDevice field and isActive flags in devices array
 * @param {Object} user - Mongoose user document
 * @returns {Boolean} - Whether any changes were made
 */
exports.ensureActiveDeviceConsistency = (user) => {
    if (!user) return false;

    let needsUpdate = false;

    // Case 1: activeDevice is set but no device has isActive=true
    if (user.activeDevice) {
        user.devices = user.devices.map(device => {
            const shouldBeActive = device.deviceId === user.activeDevice;
            if (device.isActive !== shouldBeActive) {
                needsUpdate = true;
                return {
                    ...(device.toObject ? device.toObject() : device),
                    isActive: shouldBeActive
                };
            }
            return device;
        });
    }
    // Case 2: No activeDevice set but a device has isActive=true
    else {
        const activeDevice = user.devices.find(device => device.isActive);
        if (activeDevice) {
            user.activeDevice = activeDevice.deviceId;
            needsUpdate = true;
        }
        // Case 3: No activeDevice and no device with isActive=true, but devices exist
        else if (user.devices.length > 0) {
            user.activeDevice = user.devices[0].deviceId;
            user.devices[0] = {
                ...(user.devices[0].toObject ? user.devices[0].toObject() : user.devices[0]),
                isActive: true
            };
            needsUpdate = true;
        }
    }

    return needsUpdate;
};

/**
 * Gets the active device ID using a consistent approach
 * @param {Object} user - Mongoose user document
 * @returns {String|null} - Active device ID or null
 */
exports.getActiveDeviceId = (user) => {
    if (!user) return null;

    // Prefer activeDevice field, fall back to isActive flag
    return user.activeDevice ||
        (user.devices && user.devices.find(d => d.isActive)?.deviceId) ||
        null;
};