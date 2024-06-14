import EventEmitter from 'node:events';
import { debug } from 'debug';
import type { Characteristic, Peripheral } from '@abandonware/noble';
import { default as noble } from '@abandonware/noble';

export enum Actions {
  AUTO = '4648008e',
  EDGE = '46480290',
  SPOT = '4648018f',
  DOCK = '46480391',
}

export enum States {
  STBY = '46480593',
  DONE = '46480896',
  CHARGING = '46480694',
  ERROR = '46480795',
  AUTO = '4648008e',
  EDGE = '46480290',
  SPOT = '4648018f',
  DOCK = '46480391',
}

export interface DeviceState {
  state: States;
  updatedAt: Date;
}

const GATT_SERVICE = 'ffb0';
const WRITE_CHAR = 'ffb1';
const READ_CHAR = 'ffb2';

const TIMEOUT = 1000 * 3;

export class BLE {
  public state: DeviceState | null = null;
  private peripheral?: Peripheral;
  private writeChar?: Characteristic;
  private readChar?: Characteristic;
  private log = debug('veavon:ble');
  public events = new EventEmitter();

  constructor() {
    noble.on('stateChange', (state) => {
      this.log('state changed: %s', state);
      if (state === 'poweredOn') {
        void this.begin();
      }
    });
  }

  private handleNotify(data: string): void {
    // Expect four bytes of data for status response
    if (data.length !== 8) {
      this.log('malformed notification: %s', data);
      return;
    }

    // Check that the data is a valid state
    if (!Object.values(States).includes(data as States)) {
      this.log('unexpected state: %s', data);
      return;
    }

    this.log('state changed: %s', data);
    this.state = {
      state: data as States,
      updatedAt: new Date(),
    };

    this.events.emit('state', this.state);
  }

  async sendAction(action: Actions): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.writeChar) {
        this.log(
          'trying to send action without write characteristic available',
        );
        resolve(false);
        return;
      }

      this.log('sending action: %s', action);
      this.writeChar.write(Buffer.from(action, 'hex'), true, (err) => {
        if (err) {
          this.log('failed to send action: %s', err);
          resolve(false);
        }

        let timeout: NodeJS.Timeout | null = null;

        const watcher = (): void => {
          this.log('action confirmed');
          if (timeout) {
            clearTimeout(timeout);
          }
          resolve(true);
        };

        this.events.once('state', watcher);
        timeout = setTimeout(() => {
          this.log('timed out waiting for action confirmation');
          this.events.off('state', watcher);
          resolve(false);
        }, TIMEOUT);
      });
    });
  }

  /**
   * This method built upon the idea that while device is connected, it's not discoverable.
   * So we can continuously scan for the device and connect to it when found,
   * dropping old connection if necessary.
   */
  async begin(): Promise<void> {
    await noble.startScanningAsync([GATT_SERVICE], false);
    this.log('scanning started');
    noble.on('discover', (peripheral) => {
      void (async () => {
        // Simple check for now. There is nothing about security in the entire project.
        if (peripheral.advertisement.localName !== 'VEAVON') {
          return;
        }

        this.log('found device: %s', peripheral.advertisement.localName);

        // Drop old connection
        if (this.peripheral) {
          await this.peripheral.disconnectAsync();
          this.log('disconnected from the existing session');
        }

        await peripheral.connectAsync();
        this.log('connected');
        const { characteristics } =
          await peripheral.discoverSomeServicesAndCharacteristicsAsync(
            [GATT_SERVICE],
            ['ffb1', 'ffb2'],
          );

        if (characteristics.length !== 2) {
          this.log('device does not have the required characteristics');
        }

        this.peripheral = peripheral;

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- we requested exactly two characteristics and verified that two were returned
        this.readChar = characteristics.find((c) => c.uuid === READ_CHAR)!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- same as here
        this.writeChar = characteristics.find((c) => c.uuid === WRITE_CHAR)!;
        this.log('characteristics discovered');

        // Enable notifications
        await this.readChar.subscribeAsync();
        this.log('subscribed to notifications');
        this.readChar.on('data', (data, isNotification) => {
          if (!isNotification) {
            return;
          }
          this.handleNotify(data.toString('hex'));
        });

        this.events.emit('ready');
      })();
    });
  }

  async dispose(): Promise<void> {
    if (this.peripheral) {
      await this.peripheral.disconnectAsync();
      this.log('disconnected');
    }
  }
}
