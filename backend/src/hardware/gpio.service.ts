import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface EncoderEvent {
  encoderId: string;
  direction: 'cw' | 'ccw'; // clockwise / counter-clockwise
  clicks: number;
}

export interface ButtonEvent {
  encoderId: string;
  action: 'press' | 'release' | 'longPress';
}

/**
 * Mock GPIO Service for development on PC.
 * In production on Raspberry Pi, this would interface with real GPIO pins.
 */
@Injectable()
export class GpioService extends EventEmitter {
  private encoderValues: Map<string, number> = new Map();
  private mockInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.initMockEncoders();
  }

  /**
   * Initialize mock encoders for development
   */
  private initMockEncoders() {
    // Define which parameters each encoder controls
    const encoders = [
      { id: 'encoder-peep', parameter: 'peep', min: 0, max: 20, step: 1 },
      { id: 'encoder-pinsp', parameter: 'pinsp', min: 5, max: 40, step: 1 },
      { id: 'encoder-rr', parameter: 'rr', min: 6, max: 35, step: 1 },
      { id: 'encoder-ti', parameter: 'ti', min: 0.3, max: 2.5, step: 0.1 },
      { id: 'encoder-trigger', parameter: 'trigger', min: 1, max: 10, step: 0.5 },
    ];

    for (const enc of encoders) {
      this.encoderValues.set(enc.id, 0);
    }
  }

  /**
   * Get configured encoder mappings
   */
  getEncoderConfig() {
    return [
      { id: 'encoder-peep', parameter: 'peep', min: 0, max: 20, step: 1, label: 'PEEP' },
      { id: 'encoder-pinsp', parameter: 'pinsp', min: 5, max: 40, step: 1, label: 'Pinsp' },
      { id: 'encoder-rr', parameter: 'rr', min: 6, max: 35, step: 1, label: 'RR' },
      { id: 'encoder-ti', parameter: 'ti', min: 0.3, max: 2.5, step: 0.1, label: 'Ti' },
      { id: 'encoder-trigger', parameter: 'trigger', min: 1, max: 10, step: 0.5, label: 'Trigger' },
    ];
  }

  /**
   * Simulate encoder rotation (for UI or testing)
   */
  simulateEncoderRotation(encoderId: string, direction: 'cw' | 'ccw', clicks: number = 1) {
    const event: EncoderEvent = { encoderId, direction, clicks };
    this.emit('encoder', event);
    return event;
  }

  /**
   * Simulate button press
   */
  simulateButtonPress(encoderId: string, action: 'press' | 'release' | 'longPress' = 'press') {
    const event: ButtonEvent = { encoderId, action };
    this.emit('button', event);
    return event;
  }

  /**
   * Start mock random encoder movements (for testing)
   */
  startMockMode() {
    if (this.mockInterval) return;

    this.mockInterval = setInterval(() => {
      const encoders = this.getEncoderConfig();
      const randomEncoder = encoders[Math.floor(Math.random() * encoders.length)];
      const direction = Math.random() > 0.5 ? 'cw' : 'ccw';
      this.simulateEncoderRotation(randomEncoder.id, direction, 1);
    }, 2000); // Random input every 2 seconds
  }

  /**
   * Stop mock mode
   */
  stopMockMode() {
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }
  }

  /**
   * Calculate new parameter value based on encoder rotation
   */
  calculateNewValue(
    currentValue: number,
    config: { min: number; max: number; step: number },
    direction: 'cw' | 'ccw',
    clicks: number,
  ): number {
    const delta = config.step * clicks * (direction === 'cw' ? 1 : -1);
    let newValue = currentValue + delta;
    newValue = Math.max(config.min, Math.min(config.max, newValue));
    return Math.round(newValue * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Production: Initialize real GPIO (Raspberry Pi)
   * This would use a library like 'onoff' or 'pigpio'
   */
  initRealGpio() {
    // Example of what this would look like:
    // const Gpio = require('onoff').Gpio;
    // const encoderA = new Gpio(17, 'in', 'both');
    // const encoderB = new Gpio(27, 'in', 'both');
    // ... set up interrupt handlers
    console.log('GPIO: Running in mock mode (no real hardware)');
  }

  onDestroy() {
    this.stopMockMode();
  }
}
