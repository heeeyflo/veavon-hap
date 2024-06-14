import { HAPStatus, HapStatusError } from 'hap-nodejs';
import type { StateGetter, StateSetter } from './hap';
import { HapAccessory } from './hap';
import { Actions, BLE, States } from './ble';

const ble = new BLE();
const getter: StateGetter = (cb) => {
  // State is not available yet
  if (ble.state === null) {
    cb(new HapStatusError(HAPStatus.OUT_OF_RESOURCE));
    return;
  }

  // Consider the vacuum as active if it's in one of these states
  cb(null, [States.AUTO, States.EDGE, States.SPOT].includes(ble.state.state));
};

const setter: StateSetter = (value, cb) => {
  void ble.sendAction(value ? Actions.AUTO : Actions.DOCK).then((success) => {
    cb(success ? undefined : new HapStatusError(HAPStatus.OPERATION_TIMED_OUT));
  });
};

const hap = new HapAccessory(getter, setter);
ble.events.on('ready', () => {
  void hap.advertise();
});

process.on('SIGINT', () => {
  void (async () => {
    await hap.dispose();
    await ble.dispose();
    process.exit();
  })();
});
