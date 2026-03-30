import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';

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
 * GPIO Service for working with the HW-040 encoder.
 * Automatically detects mode: mock (PC) or real GPIO (Raspberry Pi via Python/gpiozero).
 */
@Injectable()
export class GpioService extends EventEmitter implements OnModuleDestroy {
  private readonly logger = new Logger(GpioService.name);
  
  private encoderValues: Map<string, number> = new Map();
  private mockInterval: NodeJS.Timeout | null = null;
  private isRealGpio = false;
  
  private pythonProcess: ChildProcessWithoutNullStreams | null = null;
  
  // Текущий выбранный параметр (для изменения энкодером)
  private selectedParameter: string = 'trigger';

  constructor() {
    super();
    this.initGpio();
  }

  private initGpio() {
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'encoder.py');
    
    // Пробуем запустить python-скрипт (python3 на Pi) 
    this.pythonProcess = spawn('python3', ['-u', scriptPath]);
    
    this.pythonProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      const lines = output.split('\n');
      
      lines.forEach(line => {
        const text = line.trim();
        if (text === 'READY') {
          this.isRealGpio = true;
          this.logger.log('GPIO: Real encoder connected (via Python gpiozero)');
        } else if (text === 'ENCODER:CW') {
          this.emitEncoderEvent('cw');
        } else if (text === 'ENCODER:CCW') {
          this.emitEncoderEvent('ccw');
        } else if (text === 'BUTTON:PRESS') {
          this.emitButtonEvent('press');
        } else if (text.startsWith('ERROR:gpiozero_missing')) {
          this.logger.log('GPIO: Hardware library missing, switching to mock mode');
          this.initMockMode();
        } else if (text.startsWith('ERROR:')) {
          this.logger.warn(`Python script error: ${text}`);
          if (!this.isRealGpio) {
            this.initMockMode();
          }
        }
      });
    });

    this.pythonProcess.stderr.on('data', (data) => {
      // Игнорируем обычные логи, но можем выводить при отладке
      // this.logger.debug(`Python STDERR: ${data.toString()}`);
    });

    this.pythonProcess.on('close', (code) => {
      if (code !== 0 && !this.isRealGpio) {
        this.logger.log(`GPIO: Hardware process inactive (code ${code}), using mock mode`);
        this.initMockMode();
      } else {
        this.logger.debug(`Python process exited with code ${code}`);
      }
    });

    this.pythonProcess.on('error', (err) => {
      if (!this.isRealGpio) {
        this.logger.log(`GPIO: Python/Hardware not available (${err.message}), using mock mode`);
        this.initMockMode();
      }
    });
  }

  private initMockMode() {
    if (!this.encoderValues.has('encoder-main')) {
      this.encoderValues.set('encoder-main', 0);
      this.logger.log('GPIO: Mock mode (PC development)');
    }
  }

  private emitEncoderEvent(direction: 'cw' | 'ccw') {
    const event: EncoderEvent = {
      encoderId: 'encoder-main',
      direction,
      clicks: 1,
    };
    this.logger.debug(`Encoder: ${direction === 'cw' ? '→ CW' : '← CCW'}`);
    this.emit('encoder', event);
  }

  private emitButtonEvent(action: 'press' | 'release' | 'longPress') {
    const event: ButtonEvent = {
      encoderId: 'encoder-main',
      action,
    };
    this.logger.debug(`Button: ${action}`);
    this.emit('button', event);
  }

  setSelectedParameter(parameter: string) {
    if (this.getParameterConfig().hasOwnProperty(parameter)) {
        this.selectedParameter = parameter;
        this.logger.log(`Selected parameter: ${parameter}`);
        this.emit('parameterChanged', parameter);
    }
  }

  selectNextParameter() {
    const params = Object.keys(this.getParameterConfig());
    const currentIndex = params.indexOf(this.selectedParameter);
    const nextIndex = (currentIndex + 1) % params.length;
    this.setSelectedParameter(params[nextIndex]);
  }

  getSelectedParameter(): string {
    return this.selectedParameter;
  }

  isRealGpioMode(): boolean {
    return this.isRealGpio;
  }

  getEncoderConfig() {
    return [
      { id: 'encoder-main', parameter: 'selected', min: 0, max: 100, step: 1, label: 'Main Encoder' },
    ];
  }

  getParameterConfig() {
    return {
      ipap: { min: 5, max: 30, step: 1, label: 'IPAP / Pinsp', unit: 'cmH₂O' },
      epap: { min: 0, max: 15, step: 1, label: 'EPAP / PEEP', unit: 'cmH₂O' },
      rr: { min: 5, max: 40, step: 1, label: 'Respiratory Rate (RR)', unit: '/min' },
      ti: { min: 0.3, max: 3.0, step: 0.1, label: 'Inspiratory Time (Ti)', unit: 's' },
      trigger: { min: 0.5, max: 10, step: 0.5, label: 'Trigger', unit: 'cmH₂O' },
      vt: { min: 200, max: 1000, step: 50, label: 'Tidal Volume (VT)', unit: 'mL' },
    };
  }

  simulateEncoderRotation(encoderId: string, direction: 'cw' | 'ccw', clicks: number = 1) {
    const event: EncoderEvent = { encoderId, direction, clicks };
    this.emit('encoder', event);
    return event;
  }

  simulateButtonPress(encoderId: string, action: 'press' | 'release' | 'longPress' = 'press') {
    const event: ButtonEvent = { encoderId, action };
    this.emit('button', event);
    return event;
  }

  startMockMode() {
    if (this.mockInterval) return;
    this.mockInterval = setInterval(() => {
      const direction = Math.random() > 0.5 ? 'cw' : 'ccw';
      this.simulateEncoderRotation('encoder-main', direction, 1);
    }, 2000);
  }

  stopMockMode() {
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }
  }

  calculateNewValue(
    currentValue: number,
    config: { min: number; max: number; step: number },
    direction: 'cw' | 'ccw',
    clicks: number,
  ): number {
    const delta = config.step * clicks * (direction === 'cw' ? 1 : -1);
    let newValue = currentValue + delta;
    newValue = Math.max(config.min, Math.min(config.max, newValue));
    return Math.round(newValue * 100) / 100;
  }

  onModuleDestroy() {
    this.stopMockMode();
    if (this.pythonProcess) {
      this.pythonProcess.kill();
    }
    this.logger.log('GPIO resources released');
  }
}
