import {
  Accessory,
  Characteristic,
  CharacteristicEventTypes,
  Service,
  Categories,
  type CharacteristicValue,
  type CharacteristicGetCallback,
  type CharacteristicSetCallback,
} from 'hap-nodejs';
import { debug } from 'debug';
import { getRequiredEnv } from './utils';

export type StateGetter = (cb: CharacteristicGetCallback) => void;
export type StateSetter = (
  value: CharacteristicValue,
  cb: CharacteristicSetCallback,
) => void;

export class HapAccessory {
  private log = debug('veavon:hap');
  private service = new Service.Outlet('State');
  private accessory = new Accessory(
    'Veavon Robot Vacuum',
    '13121337-0815-42e5-8d00-2104973c3ccf',
  );

  constructor(getter: StateGetter, setter: StateSetter) {
    const characteristic = this.service.getCharacteristic(Characteristic.On);
    characteristic.on(CharacteristicEventTypes.GET, getter);
    characteristic.on(CharacteristicEventTypes.SET, setter);
    this.log('accessory "%s" craeted', this.accessory.displayName);
  }

  static create(getter: StateGetter, setter: StateSetter): HapAccessory {
    return new HapAccessory(getter, setter);
  }

  async advertise(): Promise<void> {
    this.accessory.addService(this.service);
    await this.accessory.publish({
      username: '13:12:13:37:DE:AD',
      pincode: getRequiredEnv('HAP_PIN'),
      port: 47129,
      category: Categories.OTHER,
    });
    this.log('accessory advertised', this.accessory.displayName);
  }

  async dispose(): Promise<void> {
    this.log('disposing accessory', this.accessory.displayName);
    return this.accessory.unpublish();
  }
}
