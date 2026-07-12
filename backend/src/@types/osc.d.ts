declare module 'osc' {
  import { EventEmitter } from 'node:events';

  export type ArgumentType = 'i' | 'f' | 's' | 'b' | 'd' | 'T' | 'F' | 'N' | 'I';

  export interface Argument {
    type: ArgumentType;
    value: number | string | boolean | Uint8Array;
  }

  export type OscArguments = Argument[];

  export interface OscMessage {
    address: string;
    args: OscArguments;
    timeTag?: unknown;
  }

  export interface OscBundle {
    timeTag: {
      raw: [number, number];
      native: number;
    };
    elements: (OscMessage | OscBundle)[];
  }

  export interface UDPPortOptions {
    localAddress: string;
    localPort: number;
    remoteAddress?: string;
    remotePort?: number;
    metadata?: boolean;
    broadcast?: boolean;
  }

  export class UDPPort extends EventEmitter {
    constructor(options: UDPPortOptions);
    open(): void;
    close(): void;
    send(
      oscMsg: { address: string; args: OscArguments },
      timeTag?: unknown,
      info?: unknown,
    ): void;
    on(event: 'ready', listener: () => void): this;
    on(
      event: 'message',
      listener: (message: OscMessage, timeTag?: unknown, info?: unknown) => void,
    ): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'close', listener: () => void): this;
  }
}
