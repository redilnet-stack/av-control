import { EventEmitter } from 'node:events';
import { Socket } from 'node:net';
import { logger } from '../../logger.js';
import type { VideohubConfig, VideohubInputInfo, VideohubOutputInfo, VideohubState, PortLock } from './types.js';
import type { VideohubDriverHandle } from './driver-interface.js';

/**
 * Real Videohub driver that communicates over TCP port 9990
 * using the Blackmagic Videohub Ethernet Protocol v2.3.
 *
 * Protocol: text-based blocks terminated by blank lines.
 * Each block has an ALL-CAPS header followed by a colon, then key-value lines.
 * On connect, the server dumps full state. Thereafter it pushes delta updates.
 */
export class VideohubDriver extends EventEmitter implements VideohubDriverHandle {
  private socket: Socket | null = null;
  private config: VideohubConfig;
  private _connected = false;
  private lastEmittedState: VideohubState | null = null;
  private inputCount = 0;
  private outputCount = 0;
  private modelName = '';
  private protocolVersion = '';

  // Accumulated state as we parse blocks
  private inputs: VideohubInputInfo[] = [];
  private outputs: VideohubOutputInfo[] = [];
  private locks: PortLock[] = [];

  // Buffer for incoming data
  private buffer = '';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_DELAY = 30_000;
  private readonly INITIAL_RECONNECT_DELAY = 1_000;
  private intentionalDisconnect = false;

  constructor(config: VideohubConfig) {
    super();
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    if (this._connected) return;

    if (!this.config.host) {
      throw new Error('Videohub host not configured');
    }

    return new Promise((resolve, reject) => {
      const socket = new Socket();
      this.socket = socket;

      socket.setEncoding('utf-8');
      socket.setKeepAlive(true);

      socket.connect(this.config.port, this.config.host!, () => {
        this._connected = true;
        this.intentionalDisconnect = false;
        this.reconnectAttempts = 0;
        logger.info(`Videohub connected to ${this.config.host}:${this.config.port}`);
        this.emit('connected');
        // Don't resolve yet — wait for state dump to arrive
      });

      socket.on('data', (data: string) => {
        this.buffer += data;
        this.processBuffer();
      });

      socket.on('close', () => {
        this._connected = false;
        logger.warn('Videohub connection closed');
        this.emit('disconnected');
        this.socket = null;
        this.scheduleReconnect();
      });

      socket.on('error', (err: Error) => {
        logger.error('Videohub socket error', { error: err.message });
        this.emit('error', err);
      });

      // Listen for the protocol preamble to confirm connection succeeded
      const onData = (data: string) => {
        if (data.includes('PROTOCOL PREAMBLE:')) {
          socket.off('data', onData);
          // Connection successful — state dump will follow
        }
      };
      socket.on('data', onData);

      // Timeout if we don't get the preamble quickly
      socket.once('data', () => {
        // We got data, connection is live
        resolve();
      });

      // Connection error handling
      socket.once('error', (err: Error) => {
        this.cleanup();
        reject(err);
      });

      // Connection timeout
      setTimeout(() => {
        if (!this._connected && !socket.destroyed) {
          socket.destroy();
          this.cleanup();
          reject(new Error('Videohub connection timeout'));
        }
      }, 10_000);
    });
  }

  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    this.cancelReconnect();
    this.cleanup();
    this._connected = false;
    logger.info('Videohub disconnected');
    this.emit('disconnected');
  }

  /** Route an input to an output by sending a routing command. */
  async setRoute(output: number, input: number): Promise<void> {
    if (!this._connected || !this.socket) {
      logger.warn('Videohub not connected, cannot set route');
      return;
    }

    const cmd = `VIDEO OUTPUT ROUTING:\n${output} ${input}\n\n`;
    logger.debug(`Videohub set route: output ${output} → input ${input}`);
    this.socket.write(cmd);
  }

  /** Rename an input port label. */
  async setInputLabel(inputId: number, label: string): Promise<void> {
    if (!this._connected || !this.socket) {
      logger.warn('Videohub not connected, cannot set input label');
      return;
    }

    const cmd = `INPUT LABELS:\n${inputId} ${label}\n\n`;
    logger.debug(`Videohub set input ${inputId} label → "${label}"`);
    this.socket.write(cmd);
  }

  /** Rename an output port label. */
  async setOutputLabel(outputId: number, label: string): Promise<void> {
    if (!this._connected || !this.socket) {
      logger.warn('Videohub not connected, cannot set output label');
      return;
    }

    const cmd = `OUTPUT LABELS:\n${outputId} ${label}\n\n`;
    logger.debug(`Videohub set output ${outputId} label → "${label}"`);
    this.socket.write(cmd);
  }

  refreshState(): void {
    if (this.lastEmittedState) {
      this.emit('videohubState', this.lastEmittedState);
    }
  }

  getLastState(): VideohubState | null {
    return this.lastEmittedState;
  }

  // ── Private ─────────────────────────────────────────────────────────

  private cleanup(): void {
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch { /* ignore */ }
      this.socket = null;
    }
    this._connected = false;
  }

  private scheduleReconnect(): void {
    if (this.intentionalDisconnect) return;

    this.reconnectAttempts++;
    const delay = Math.min(
      this.INITIAL_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1),
      this.MAX_RECONNECT_DELAY,
    );

    logger.info(`Videohub reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        logger.error('Videohub reconnect failed', { error: (err as Error).message });
      });
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /** Parse incoming TCP data buffer, extracting complete blocks. */
  private processBuffer(): void {
    // Blocks are terminated by blank lines (\n\n or \r\n\r\n)
    while (this.buffer.includes('\n\n') || this.buffer.includes('\r\n\r\n')) {
      let blockEnd: number;
      if (this.buffer.includes('\r\n\r\n')) {
        blockEnd = this.buffer.indexOf('\r\n\r\n') + 2; // keep one \r\n for processing
      } else {
        blockEnd = this.buffer.indexOf('\n\n') + 1; // keep one \n
      }

      const block = this.buffer.substring(0, blockEnd).trimEnd();
      this.buffer = this.buffer.substring(blockEnd + 1); // skip blank line

      if (block) {
        this.processBlock(block.split('\n'));
      }
    }
  }

  /** Process a single protocol block (array of lines). */
  private processBlock(lines: string[]): void {
    if (lines.length === 0) return;

    const header = lines[0].trim();

    if (header === 'ACK') {
      logger.debug('Videohub ACK received');
      this.emit('ack');
      return;
    }

    if (header === 'NAK') {
      logger.warn('Videohub NAK received');
      this.emit('nak');
      return;
    }

    if (header === 'PING:') {
      // Respond to ping
      if (this.socket) {
        this.socket.write('\n');
      }
      return;
    }

    const bodyLines = lines.slice(1).filter((l) => l.trim().length > 0);

    if (header === 'PROTOCOL PREAMBLE:') {
      this.parsePreamble(bodyLines);
    } else if (header === 'VIDEOHUB DEVICE:') {
      this.parseDeviceInfo(bodyLines);
    } else if (header === 'INPUT LABELS:') {
      this.parseInputLabels(bodyLines);
    } else if (header === 'OUTPUT LABELS:') {
      this.parseOutputLabels(bodyLines);
    } else if (header === 'VIDEO OUTPUT ROUTING:') {
      this.parseRouting(bodyLines);
    } else if (header === 'VIDEO OUTPUT LOCKS:') {
      this.parseLocks(bodyLines);
    }
    // Skip other blocks we don't need (MONITORING, SERIAL, etc.)

    this.tryEmitState();
  }

  private parsePreamble(lines: string[]): void {
    for (const line of lines) {
      const [key, ...rest] = line.split(':');
      if (key.trim() === 'Version') {
        this.protocolVersion = rest.join(':').trim();
        logger.debug(`Videohub protocol version: ${this.protocolVersion}`);
      }
    }
  }

  private parseDeviceInfo(lines: string[]): void {
    for (const line of lines) {
      const [key, ...rest] = line.split(':');
      const value = rest.join(':').trim();
      const k = key.trim();

      if (k === 'Model name') {
        this.modelName = value;
      } else if (k === 'Video inputs') {
        this.inputCount = parseInt(value, 10) || 0;
      } else if (k === 'Video outputs') {
        this.outputCount = parseInt(value, 10) || 0;
      }
    }

    // Pre-allocate arrays
    this.inputs = Array.from({ length: this.inputCount }, (_, i) => ({
      inputId: i,
      label: `Input ${i + 1}`,
    }));
    this.outputs = Array.from({ length: this.outputCount }, (_, i) => ({
      outputId: i,
      label: `Output ${i + 1}`,
      routedInput: 0,
    }));
    this.locks = Array.from({ length: this.outputCount }, () => 'U');

    logger.debug(`Videohub device: ${this.modelName} (${this.inputCount}×${this.outputCount})`);
  }

  private parseInputLabels(lines: string[]): void {
    for (const line of lines) {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (match) {
        const id = parseInt(match[1], 10);
        const label = match[2].trim();
        if (this.inputs[id]) {
          this.inputs[id].label = label;
        }
      }
    }
  }

  private parseOutputLabels(lines: string[]): void {
    for (const line of lines) {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (match) {
        const id = parseInt(match[1], 10);
        const label = match[2].trim();
        if (this.outputs[id]) {
          this.outputs[id].label = label;
        }
      }
    }
  }

  private parseRouting(lines: string[]): void {
    for (const line of lines) {
      const match = line.match(/^(\d+)\s+(\d+)$/);
      if (match) {
        const output = parseInt(match[1], 10);
        const input = parseInt(match[2], 10);
        if (this.outputs[output]) {
          this.outputs[output].routedInput = input;
        }
      }
    }
  }

  private parseLocks(lines: string[]): void {
    for (const line of lines) {
      const match = line.match(/^(\d+)\s+([OLU])$/);
      if (match) {
        const port = parseInt(match[1], 10);
        const lock = match[2] as PortLock;
        if (this.locks[port]) {
          this.locks[port] = lock;
        }
      }
    }
  }

  /** Emit current state if we have enough data. */
  private tryEmitState(): void {
    if (this.outputs.length === 0) return;

    const state: VideohubState = {
      connected: this._connected,
      modelName: this.modelName,
      videoInputs: this.inputCount,
      videoOutputs: this.outputCount,
      inputs: this.inputs.map((i) => ({ ...i })),
      outputs: this.outputs.map((o) => ({ ...o })),
      locks: [...this.locks],
      protocolVersion: this.protocolVersion,
    };

    this.lastEmittedState = state;
    this.emit('videohubState', state);
  }
}
